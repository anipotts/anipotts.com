import { createRuntimeContractReporter } from "./runtime-contract";

interface Env {
  DB: D1Database;
  MAC_MINI_INGEST_KEY: string;
  BRANDS_INGEST_KEY: string;
  GITHUB_TOKEN: string;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
}

type Category =
  "ops" | "code" | "analytics" | "business" | "rollup" | "brands_email";

const CATEGORY_TABLE: Record<Category, string> = {
  ops: "ops_snapshots",
  code: "code_health",
  analytics: "analytics_events",
  business: "business_data",
  rollup: "daily_rollups",
  brands_email: "brands_emails",
};

const VALID_CATEGORIES = new Set<Category>([
  "ops",
  "code",
  "analytics",
  "business",
  "rollup",
  "brands_email",
]);

/**
 * Categories writable with a scoped secret (BRANDS_INGEST_KEY).
 * Anything NOT in this set requires the global MAC_MINI_INGEST_KEY.
 */
const SCOPED_CATEGORIES: Record<Category, "mac_mini" | "brands"> = {
  ops: "mac_mini",
  code: "mac_mini",
  analytics: "mac_mini",
  business: "mac_mini",
  rollup: "mac_mini",
  brands_email: "brands",
};

/** Allowlisted columns per table. Only these can be written via ingest. */
const TABLE_COLUMNS: Record<Category, Set<string>> = {
  ops: new Set(["key", "category", "value", "updated_at"]),
  code: new Set([
    "repo",
    "dirty",
    "unpushed_count",
    "stale_branches",
    "last_commit_at",
    "last_commit_msg",
    "deployment_status",
    "updated_at",
  ]),
  analytics: new Set([
    "id",
    "source",
    "metric",
    "value",
    "dimensions",
    "period_start",
    "period_end",
    "fetched_at",
  ]),
  business: new Set(["key", "value", "source_file", "updated_at"]),
  rollup: new Set(["id", "date", "hour", "metric", "value", "created_at"]),
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

/** Primary key column(s) per table, used to look up existing rows for merging. */
const PK_COLUMNS: Record<Category, string[]> = {
  ops: ["key", "category"],
  code: ["repo"],
  analytics: ["id"],
  business: ["key"],
  rollup: ["id"],
  brands_email: ["message_id"],
};

/** Timestamp column name per table (set automatically on ingest). */
const TS_COLUMN: Record<Category, string> = {
  ops: "updated_at",
  code: "updated_at",
  analytics: "fetched_at",
  business: "updated_at",
  rollup: "created_at",
  brands_email: "ingested_at",
};

/**
 * Conflict strategy per category.
 *
 * - "replace": INSERT OR REPLACE — overwrites the existing row. Safe for
 *   categories where the ingest path owns every column in the table.
 * - "ignore":  INSERT OR IGNORE  — drops the new row on PK collision.
 *   Required when non-allowlisted columns (e.g. admin-set status/notes on
 *   brands_emails) must not be clobbered by re-ingest. INSERT OR REPLACE
 *   would delete the existing row, then re-insert with DEFAULTs for any
 *   columns the worker doesn't write.
 */
const CONFLICT_STRATEGY: Record<Category, "replace" | "ignore"> = {
  ops: "replace",
  code: "replace",
  analytics: "replace",
  business: "replace",
  rollup: "replace",
  brands_email: "ignore",
};

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

/**
 * Fetch the existing row from D1 so we can merge incoming fields over it,
 * preventing INSERT OR REPLACE from NULL-ing omitted columns.
 */
async function fetchExistingRow(
  db: D1Database,
  table: string,
  pkColumns: string[],
  incomingRecord: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const whereClauses = pkColumns.map((col) => `${col} = ?`);
  const whereValues = pkColumns.map((col) => incomingRecord[col]);

  // If any PK value is missing, can't look up existing row
  if (whereValues.some((v) => v === undefined || v === null)) return null;

  const sql = `SELECT * FROM ${table} WHERE ${whereClauses.join(" AND ")} LIMIT 1`;
  const result = await db
    .prepare(sql)
    .bind(...whereValues)
    .first();
  return result as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Shared write helper: used by both the HTTP ingest path and cron jobs
// ---------------------------------------------------------------------------

async function writeToTable(
  db: D1Database,
  category: Category,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<number> {
  const table = CATEGORY_TABLE[category];
  const allowedColumns = TABLE_COLUMNS[category];
  const pkColumns = PK_COLUMNS[category];
  const tsColumn = TS_COLUMN[category];
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length === 0) return 0;

  const ts = new Date().toISOString();
  const statements = [];

  for (const row of rows) {
    // Filter to allowlisted columns only, add timestamp
    const incoming: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (allowedColumns.has(k)) {
        incoming[k] =
          typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      }
    }
    incoming[tsColumn] = ts;

    if (Object.keys(incoming).length <= 1) {
      // Only the timestamp column. Nothing useful to write.
      throw new Error("No valid columns in row");
    }

    const strategy = CONFLICT_STRATEGY[category];
    let record: Record<string, unknown>;

    if (strategy === "replace") {
      // Merge: fetch existing row so columns the ingest path owns but didn't
      // include in this payload keep their values across re-ingest.
      const existing = await fetchExistingRow(db, table, pkColumns, incoming);
      const merged = existing ? { ...existing, ...incoming } : incoming;

      record = {};
      for (const [k, v] of Object.entries(merged)) {
        if (allowedColumns.has(k)) {
          record[k] = v;
        }
      }
    } else {
      // IGNORE — never touches existing rows; merge/fetch is dead weight here.
      record = incoming;
    }

    const keys = Object.keys(record);
    const placeholders = keys.map(() => "?").join(", ");
    const values = Object.values(record);
    const verb =
      strategy === "ignore" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";

    statements.push(
      db
        .prepare(
          `${verb} INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`,
        )
        .bind(...values),
    );
  }

  await db.batch(statements);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Cron job: Health probes (every minute)
// ---------------------------------------------------------------------------

const HEALTH_ENDPOINTS = [
  { key: "www", url: "https://anipotts.com/api/health" },
  { key: "admin", url: "https://admin.anipotts.com/_health" },
  { key: "ingest", url: "https://anipotts-ingest.anipotts.workers.dev" },
  { key: "mini", url: "https://api.mini.anipotts.com/health" },
];

async function runHealthProbes(db: D1Database): Promise<void> {
  const results = await Promise.allSettled(
    HEALTH_ENDPOINTS.map(async (endpoint) => {
      const start = Date.now();
      try {
        const res = await fetch(endpoint.url, {
          signal: AbortSignal.timeout(5000),
        });
        const ms = Date.now() - start;
        return {
          key: endpoint.key,
          category: "health_probe",
          value: JSON.stringify({
            ok: res.ok,
            status: res.status,
            ms,
            ts: new Date().toISOString(),
          }),
        };
      } catch (e) {
        const ms = Date.now() - start;
        return {
          key: endpoint.key,
          category: "health_probe",
          value: JSON.stringify({
            ok: false,
            status: 0,
            ms,
            error: e instanceof Error ? e.message : "Fetch failed",
            ts: new Date().toISOString(),
          }),
        };
      }
    }),
  );

  const rows: Record<string, unknown>[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") rows.push(r.value);
  }

  if (rows.length > 0) {
    await writeToTable(db, "ops", rows);
  }
}

// ---------------------------------------------------------------------------
// Cron job: GitHub stats (every 5 min)
// ---------------------------------------------------------------------------

const GITHUB_REPOS = [
  "anipotts/anipotts.com",
  "anipotts/claude-code-tips",
  "anipotts/imessage-mcp",
  "anipotts/claudemon",
  "anipotts/antileak",
  "anipotts/vector-seo",
  "anipotts/quantercise",
  "anipotts/rudy",
];

interface GhRepoResponse {
  stargazers_count: number;
  open_issues_count: number;
}

interface GhSearchResponse {
  total_count: number;
}

async function runGitHubStats(db: D1Database, token: string): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const now = new Date();
  const dateHour = `${now.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH

  const results = await Promise.allSettled(
    GITHUB_REPOS.map(async (fullName) => {
      const repoName = fullName.split("/")[1] ?? fullName;

      try {
        const [repoRes, prRes] = await Promise.all([
          fetch(`https://api.github.com/repos/${fullName}`, {
            headers,
            signal: AbortSignal.timeout(5000),
          }),
          fetch(
            `https://api.github.com/search/issues?q=repo:${fullName}+type:pr+state:open&per_page=1`,
            {
              headers,
              signal: AbortSignal.timeout(5000),
            },
          ),
        ]);

        let stars = 0;
        let openIssues = 0;
        let openPRs = 0;

        if (repoRes.ok) {
          const repoData = (await repoRes.json()) as GhRepoResponse;
          stars = repoData.stargazers_count;
          openIssues = repoData.open_issues_count;
        }

        if (prRes.ok) {
          const prData = (await prRes.json()) as GhSearchResponse;
          openPRs = prData.total_count ?? 0;
          // open_issues_count includes PRs, so subtract
          openIssues = Math.max(0, openIssues - openPRs);
        }

        return [
          {
            id: `github-${repoName}-stars-${dateHour}`,
            source: "github",
            metric: "stars",
            value: JSON.stringify({ repo: repoName, count: stars }),
          },
          {
            id: `github-${repoName}-issues-${dateHour}`,
            source: "github",
            metric: "open_issues",
            value: JSON.stringify({ repo: repoName, count: openIssues }),
          },
          {
            id: `github-${repoName}-prs-${dateHour}`,
            source: "github",
            metric: "open_prs",
            value: JSON.stringify({ repo: repoName, count: openPRs }),
          },
        ];
      } catch {
        return [];
      }
    }),
  );

  const rows: Record<string, unknown>[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") rows.push(...r.value);
  }

  if (rows.length > 0) {
    await writeToTable(db, "analytics", rows);
  }
}

// ---------------------------------------------------------------------------
// Cron job: CF Worker deployments (every 5 min)
// ---------------------------------------------------------------------------

const CF_WORKERS = [
  "anipotts-www",
  "anipotts-admin",
  "anipotts-ingest",
  "claudemon-api",
];

interface CfWorkerResponse {
  success: boolean;
  result?: {
    id: string;
    modified_on?: string;
    size?: number;
  };
}

async function runCfDeployments(
  db: D1Database,
  token: string,
  accountId: string,
): Promise<void> {
  const results = await Promise.allSettled(
    CF_WORKERS.map(async (name) => {
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${name}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          },
        );

        if (!res.ok) {
          return {
            key: name,
            category: "cf_deployment",
            value: JSON.stringify({
              status: "error",
              error: `HTTP ${res.status}`,
              ts: new Date().toISOString(),
            }),
          };
        }

        const data = (await res.json()) as CfWorkerResponse;
        return {
          key: name,
          category: "cf_deployment",
          value: JSON.stringify({
            status: data.success ? "active" : "error",
            modified_on: data.result?.modified_on ?? null,
            size: data.result?.size ?? null,
            ts: new Date().toISOString(),
          }),
        };
      } catch (e) {
        return {
          key: name,
          category: "cf_deployment",
          value: JSON.stringify({
            status: "error",
            error: e instanceof Error ? e.message : "Fetch failed",
            ts: new Date().toISOString(),
          }),
        };
      }
    }),
  );

  const rows: Record<string, unknown>[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") rows.push(r.value);
  }

  if (rows.length > 0) {
    await writeToTable(db, "ops", rows);
  }
}

// ---------------------------------------------------------------------------
// Cron job: npm download counts (every hour)
// ---------------------------------------------------------------------------

const NPM_PACKAGES = ["imessage-mcp", "claudemon-cli"];

interface NpmDownloadsResponse {
  downloads: number;
}

async function runNpmDownloads(db: D1Database): Promise<void> {
  const dateHour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH

  const results = await Promise.allSettled(
    NPM_PACKAGES.map(async (pkg) => {
      try {
        const res = await fetch(
          `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
          { signal: AbortSignal.timeout(5000) },
        );

        if (!res.ok) return null;

        const data = (await res.json()) as NpmDownloadsResponse;
        return {
          id: `npm-${pkg}-weekly-${dateHour}`,
          source: "npm",
          metric: "downloads_weekly",
          value: JSON.stringify({
            package: pkg,
            downloads: data.downloads ?? 0,
          }),
        };
      } catch {
        return null;
      }
    }),
  );

  const rows: Record<string, unknown>[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) rows.push(r.value);
  }

  if (rows.length > 0) {
    await writeToTable(db, "analytics", rows);
  }
}

// ---------------------------------------------------------------------------
// Scheduler dispatcher
// ---------------------------------------------------------------------------

async function runScheduledJobs(env: Env, minute: number): Promise<void> {
  // Health probes: every minute
  try {
    await runHealthProbes(env.DB);
  } catch (e) {
    console.error("Health probes failed:", e instanceof Error ? e.message : e);
  }

  // GitHub + CF deployments: every 5 minutes
  if (minute % 5 === 0) {
    const [ghResult, cfResult] = await Promise.allSettled([
      runGitHubStats(env.DB, env.GITHUB_TOKEN),
      runCfDeployments(env.DB, env.CF_API_TOKEN, env.CF_ACCOUNT_ID),
    ]);
    if (ghResult.status === "rejected") {
      console.error("GitHub stats failed:", ghResult.reason);
    }
    if (cfResult.status === "rejected") {
      console.error("CF deployments failed:", cfResult.reason);
    }
  }

  // npm downloads: every hour
  if (minute === 0) {
    try {
      await runNpmDownloads(env.DB);
    } catch (e) {
      console.error(
        "npm downloads failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Worker exports
// ---------------------------------------------------------------------------

// Log only: one runtime contract line per isolate. It never blocks a request,
// skips a cron job or changes a response.
const reportRuntimeContract = createRuntimeContractReporter();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    reportRuntimeContract(env, "fetch");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    // Health check endpoint
    if (request.method === "GET") {
      let d1Status: "connected" | "error" = "error";
      let tablesOk = false;
      try {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM thoughts LIMIT 1",
        ).first<{ cnt: number }>();
        if (result && typeof result.cnt === "number") {
          d1Status = "connected";
          tablesOk = true;
        }
      } catch {
        d1Status = "error";
      }
      return jsonResponse({
        app: "ingest",
        ok: d1Status === "connected",
        d1: d1Status,
        tables_ok: tablesOk,
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

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    reportRuntimeContract(env, "scheduled");
    const minute = new Date(event.scheduledTime).getMinutes();
    ctx.waitUntil(runScheduledJobs(env, minute));
  },
};
