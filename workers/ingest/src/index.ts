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
 * The Apps Script capture posts a brands_email row only when brand mail
 * arrives, so this worker can't tell a quiet inbox from a stopped capture.
 * The budget comes from the capture's own history, as the 2026-09-22 audit
 * read it: while it ran (2026-05-12 to 2026-06-24) a row landed every 1 to 3
 * days, and the longest gap was 7 days (06-16 to 06-23). So a week without a
 * row is "quiet" and still ok.
 * Past 14 days, twice that longest gap, it is "silent": over budget, so the
 * GET reads degraded and ok false, naming the newest arrival's day. Degraded
 * is not failing: failing is kept for faults this worker can see (A-24).
 */
const DAY_S = 24 * 60 * 60;
const BRANDS_EMAIL_QUIET_AFTER_S = 7 * DAY_S;
const BRANDS_EMAIL_FRESHNESS_BUDGET_S = 14 * DAY_S;

const UNOBSERVED =
  "The Apps Script capture itself. This worker sees only the rows that reach it and keeps no record of rejected posts.";

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

type WriteReceipt =
  | { rows_written: number; rows_ignored: number }
  | {
      rows_written: null;
      rows_ignored: null;
    };

/**
 * INSERT OR IGNORE drops a row whose message_id already exists. INSERT OR
 * REPLACE would delete the existing row and re-insert it with DEFAULTs for the
 * admin-set columns (status, notes, deal_slug) the worker never writes.
 * IGNORE also drops a row missing a NOT NULL column (thread_id, received_at,
 * from_addr, subject, label), so the receipt counts D1's changes, not the rows
 * posted.
 */
async function writeToTable(
  db: D1Database,
  category: Category,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<WriteReceipt> {
  const table = CATEGORY_TABLE[category];
  const allowedColumns = TABLE_COLUMNS[category];
  const tsColumn = TS_COLUMN[category];
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length === 0) return { rows_written: 0, rows_ignored: 0 };

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

  const results = await db.batch(statements);
  const changes = results.map((result) => result?.meta?.changes);
  if (
    changes.length !== rows.length ||
    !changes.every((n) => typeof n === "number" && Number.isSafeInteger(n))
  ) {
    return { rows_written: null, rows_ignored: null };
  }
  const written = (changes as number[]).reduce((sum, n) => sum + n, 0);
  return { rows_written: written, rows_ignored: rows.length - written };
}

type BrandsEmailArrival = {
  state: "recent" | "quiet" | "silent" | "empty" | "unknown";
  last_ingested_at: string | null;
  quiet_after_s: number;
  freshness_budget_s: number;
  note: string;
};

/** The ops vocabulary: failing is a fault this worker sees, degraded is not. */
type HealthState = "ok" | "degraded" | "failing";

/** The day of the newest arrival, in UTC: "2026-06-24". */
const day = (last: string | null) =>
  last ? new Date(Date.parse(last)).toISOString().slice(0, 10) : "";

const ARRIVAL_NOTE: Record<
  BrandsEmailArrival["state"],
  (last: string | null) => string
> = {
  recent: () => "Brand mail arrived in the last 7 days.",
  quiet: (last) =>
    `No brand mail since ${day(last)}, inside the 14 day budget. A quiet inbox and a stopped capture look the same here.`,
  silent: (last) =>
    `No brand mail since ${day(last)}, past the 14 day budget. The longest gap while the capture ran was 7 days, so it may have stopped.`,
  empty: () =>
    "No brand mail recorded, so the capture has never been seen working.",
  unknown: () => "Couldn't read the newest arrival time.",
};

function arrival(
  state: BrandsEmailArrival["state"],
  last: string | null,
): BrandsEmailArrival {
  return {
    state,
    last_ingested_at: last,
    quiet_after_s: BRANDS_EMAIL_QUIET_AFTER_S,
    freshness_budget_s: BRANDS_EMAIL_FRESHNESS_BUDGET_S,
    note: ARRIVAL_NOTE[state](last),
  };
}

/** One timestamp, never a subject, address or message id. */
async function brandsEmailArrival(
  db: D1Database,
  nowMs: number,
): Promise<BrandsEmailArrival> {
  const row = await db
    .prepare("SELECT MAX(ingested_at) AS last_at FROM brands_emails")
    .first<{ last_at: string | null }>();
  const last = typeof row?.last_at === "string" ? row.last_at : null;
  if (last === null) return arrival("empty", null);
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs)) return arrival("unknown", last);
  const age = nowMs - lastMs;
  return arrival(
    age <= BRANDS_EMAIL_QUIET_AFTER_S * 1000
      ? "recent"
      : age <= BRANDS_EMAIL_FRESHNESS_BUDGET_S * 1000
        ? "quiet"
        : "silent",
    last,
  );
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

    // Health, in the ops vocabulary. failing is a fault this worker can see:
    // D1 unreadable means every capture post would fail, an unset
    // BRANDS_INGEST_KEY means every capture post is refused, and a newest
    // time that isn't a timestamp can't be judged. degraded is no fault here
    // but no proof the capture works: silent past its budget, or never seen.
    // ok is true only when state is ok, so no reader of ok alone mistakes a
    // silent capture for all clear.
    if (request.method === "GET") {
      let brands: BrandsEmailArrival | null = null;
      try {
        brands = await brandsEmailArrival(env.DB, Date.now());
      } catch {
        brands = null;
      }
      const brandsKey =
        typeof env.BRANDS_INGEST_KEY === "string" &&
        env.BRANDS_INGEST_KEY.trim() !== ""
          ? "configured"
          : "missing";
      const state: HealthState =
        brands === null ||
        brands.state === "unknown" ||
        brandsKey !== "configured"
          ? "failing"
          : brands.state === "silent" || brands.state === "empty"
            ? "degraded"
            : "ok";
      // failing is a fault this worker sees: 503. degraded is no proof either
      // way, so it stays 200 with ok false.
      return jsonResponse(
        {
          app: "ingest",
          ok: state === "ok",
          state,
          d1: brands ? "connected" : "error",
          brands_key: brandsKey,
          brands_email: brands ?? arrival("unknown", null),
          unobserved: UNOBSERVED,
          ts: new Date().toISOString(),
        },
        state === "failing" ? 503 : 200,
      );
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
      const receipt = await writeToTable(env.DB, payload.category, rows);
      return jsonResponse({ success: true, ...receipt });
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
