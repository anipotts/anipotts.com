import { createRuntimeContractReporter } from "./runtime-contract";

// brands_email is the one category left. The ops, code, analytics, business
// and rollup categories and the four cron jobs were retired on 2026-09-22:
// nothing called or read them, and none of their output could tell the truth.
// A stale schedule is logged and ignored.

interface Env {
  DB: D1Database;
  MAC_MINI_INGEST_KEY: string;
  BRANDS_INGEST_KEY: string;
}

type Category = "brands_email";

const CATEGORY_TABLE: Record<Category, string> = {
  brands_email: "brands_emails",
};

const VALID_CATEGORIES = new Set<Category>(["brands_email"]);

/**
 * Categories writable with a scoped secret (BRANDS_INGEST_KEY).
 * Anything NOT in this set requires the global MAC_MINI_INGEST_KEY.
 */
const SCOPED_CATEGORIES: Record<Category, "mac_mini" | "brands"> = {
  brands_email: "brands",
};

/** Allowlisted columns per table. Only these can be written via ingest. */
const TABLE_COLUMNS: Record<Category, Set<string>> = {
  // Apps Script sends identity fields only; status/notes/deal_slug are edited
  // through other paths (admin UI) and must not be overwritten by re-ingest.
  brands_email: new Set([
    "message_id",
    "thread_id",
    "received_at",
    "from_addr",
    "subject",
    "label",
    "ingested_at",
  ]),
};

/** Timestamp column name per table (set automatically on ingest). */
const TS_COLUMN: Record<Category, string> = {
  brands_email: "ingested_at",
};

/**
 * The Apps Script capture posts brands_email rows as mail arrives. A week
 * with no new row means the capture stopped, so GET reports ok:false.
 */
const BRANDS_EMAIL_BUDGET_S = 7 * 24 * 60 * 60;

interface IngestPayload {
  category: Category;
  data: Record<string, unknown> | Record<string, unknown>[];
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isoOrNull(ms: unknown): string | null {
  return typeof ms === "number" && Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : null;
}

/**
 * INSERT OR IGNORE drops a row whose message_id already exists. INSERT OR
 * REPLACE would delete the existing row and re-insert it with DEFAULTs for the
 * admin-set columns (status, notes, deal_slug) the worker never writes.
 */
async function writeToTable(
  db: D1Database,
  category: Category,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<number> {
  const table = CATEGORY_TABLE[category];
  const allowedColumns = TABLE_COLUMNS[category];
  const tsColumn = TS_COLUMN[category];
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length === 0) return 0;

  const ts = new Date().toISOString();
  const statements = [];

  for (const row of rows) {
    // Filter to allowlisted columns only, add timestamp
    const record: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (allowedColumns.has(k)) {
        record[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      }
    }
    record[tsColumn] = ts;

    if (Object.keys(record).length <= 1) {
      // Only the timestamp column. Nothing useful to write.
      throw new Error("No valid columns in row");
    }

    const keys = Object.keys(record);
    const placeholders = keys.map(() => "?").join(", ");
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
        )
        .bind(...Object.values(record)),
    );
  }

  await db.batch(statements);
  return rows.length;
}

type BrandsEmailFreshness = {
  state: "fresh" | "stale" | "never" | "unknown";
  last_ingested_at: string | null;
  freshness_budget_s: number;
};

/** One timestamp, never a subject, address or message id. */
async function brandsEmailFreshness(
  db: D1Database,
  nowMs: number,
): Promise<BrandsEmailFreshness> {
  const row = await db
    .prepare("SELECT MAX(ingested_at) AS last_at FROM brands_emails")
    .first<{ last_at: string | null }>();
  const last = typeof row?.last_at === "string" ? row.last_at : null;
  const lastMs = last === null ? Number.NaN : Date.parse(last);
  const state =
    last === null
      ? "never"
      : !Number.isFinite(lastMs)
        ? "unknown"
        : nowMs - lastMs <= BRANDS_EMAIL_BUDGET_S * 1000
          ? "fresh"
          : "stale";
  return {
    state,
    last_ingested_at: last,
    freshness_budget_s: BRANDS_EMAIL_BUDGET_S,
  };
}

// Log only: one runtime contract line per isolate. It never blocks a request
// or changes a response.
const reportRuntimeContract = createRuntimeContractReporter();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    reportRuntimeContract(env, "fetch");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    // Health: the brands_email capture judged against its stated budget.
    if (request.method === "GET") {
      let freshness: BrandsEmailFreshness | null = null;
      try {
        freshness = await brandsEmailFreshness(env.DB, Date.now());
      } catch {
        freshness = null;
      }
      return jsonResponse({
        app: "ingest",
        ok: freshness?.state === "fresh",
        d1: freshness ? "connected" : "error",
        brands_email: freshness ?? {
          state: "unknown",
          last_ingested_at: null,
          freshness_budget_s: BRANDS_EMAIL_BUDGET_S,
        },
        ts: new Date().toISOString(),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const apiKey = request.headers.get("X-Ingest-Key");
    if (!apiKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Parse body (bounded by Worker request size limits)
    let payload: IngestPayload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    // Validate category
    if (!payload.category || !VALID_CATEGORIES.has(payload.category)) {
      return jsonResponse(
        {
          error: `Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(", ")}`,
        },
        400,
      );
    }

    // Scoped auth:
    //   - MAC_MINI_INGEST_KEY can write any category (superset)
    //   - BRANDS_INGEST_KEY can write only the "brands" scope (brands_email)
    const requiredScope = SCOPED_CATEGORIES[payload.category];
    const mainKeyOk = apiKey === env.MAC_MINI_INGEST_KEY;
    const brandsKeyOk = apiKey === env.BRANDS_INGEST_KEY;
    const authOk = mainKeyOk || (requiredScope === "brands" && brandsKeyOk);
    if (!authOk) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (!payload.data) {
      return jsonResponse({ error: "Missing data field" }, 400);
    }

    const rows = Array.isArray(payload.data) ? payload.data : [payload.data];
    if (rows.length === 0) {
      return jsonResponse({ error: "Empty data array" }, 400);
    }

    try {
      const rowsWritten = await writeToTable(env.DB, payload.category, rows);
      return jsonResponse({ success: true, rows_written: rowsWritten });
    } catch (e) {
      const isValidation =
        e instanceof Error && e.message === "No valid columns in row";
      return jsonResponse(
        { error: isValidation ? e.message : "Database write failed" },
        isValidation ? 400 : 500,
      );
    }
  },

  // The deploy removes the every-minute schedule. If a stale one still fires,
  // log it and do nothing else.
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    reportRuntimeContract(env, "scheduled");
    console.warn(
      JSON.stringify({
        event: "scheduled_retired",
        worker: "ingest",
        cron: typeof event?.cron === "string" ? event.cron : null,
        scheduled_at: isoOrNull(event?.scheduledTime),
      }),
    );
  },
};
