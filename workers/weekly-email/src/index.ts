import { createRuntimeContractReporter } from "./runtime-contract";

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  MERCURY_API_TOKEN?: string;
  MERCURY_ACCOUNT_ID_CHECKING?: string;
  MERCURY_ACCOUNT_ID_SAVINGS?: string;
  MINI_API_KEY?: string;
  MINI_API_URL?: string;
}

interface MiniReposResponse {
  repos: {
    name: string;
    dirty: boolean;
    dirty_files: number;
    unpushed_count: number;
    last_commit: { hash?: string; message?: string; date?: string };
  }[];
  ts: string;
}

interface MiniVitalsResponse {
  hostname: string;
  cpu_percent: number;
  mem_percent: number;
  disk_percent: number;
  uptime_seconds: number;
  ts: string;
}

async function fetchMiniApi<T>(env: Env, path: string): Promise<T | null> {
  if (!env.MINI_API_KEY) return null;
  const baseUrl = env.MINI_API_URL || "https://api.mini.anipotts.com";
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${env.MINI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface BusinessDataRow {
  key: string;
  value: string;
}

interface ThoughtRow {
  status: string;
}

interface CodeHealthRow {
  repo: string;
  dirty: number;
  unpushed_count: number;
  updated_at: string | null;
}

interface OpsSnapshotRow {
  key: string;
  category: string;
  value: string;
  updated_at: string | null;
}

interface MercuryAccount {
  currentBalance: number;
  availableBalance: number;
  name: string;
}

interface MercuryTransaction {
  amount: number;
  counterpartyName: string;
  dashDate: string;
  kind: string;
}

interface QueuedEmail {
  id: string;
  subject: string;
  html: string;
  to_address: string;
  attempts: number;
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 4s, 16s

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

async function getBusinessData(
  db: D1Database,
  key: string,
): Promise<unknown | null> {
  const row = await db
    .prepare("SELECT value FROM business_data WHERE key = ?")
    .bind(key)
    .first<BusinessDataRow>();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function getMercuryData(env: Env): Promise<{
  checking: number | null;
  savings: number | null;
  recentTx: { name: string; amount: number; date: string; kind: string }[];
}> {
  if (!env.MERCURY_API_TOKEN) {
    return { checking: null, savings: null, recentTx: [] };
  }

  const headers = {
    Authorization: `Bearer ${env.MERCURY_API_TOKEN}`,
    Accept: "application/json",
  };

  let checking: number | null = null;
  let savings: number | null = null;
  const recentTx: {
    name: string;
    amount: number;
    date: string;
    kind: string;
  }[] = [];

  // Separate try/catch for each account (partial success preserved)
  if (env.MERCURY_ACCOUNT_ID_CHECKING) {
    try {
      const res = await fetch(
        `https://api.mercury.com/api/v1/account/${env.MERCURY_ACCOUNT_ID_CHECKING}`,
        { headers, signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = (await res.json()) as MercuryAccount;
        checking = data.currentBalance;
      }
    } catch {
      // Checking balance unavailable
    }

    try {
      const txRes = await fetch(
        `https://api.mercury.com/api/v1/account/${env.MERCURY_ACCOUNT_ID_CHECKING}/transactions?limit=5&offset=0`,
        { headers, signal: AbortSignal.timeout(5000) },
      );
      if (txRes.ok) {
        const txData = (await txRes.json()) as {
          transactions: MercuryTransaction[];
        };
        if (Array.isArray(txData.transactions)) {
          recentTx.push(
            ...txData.transactions.map((t) => ({
              name: t.counterpartyName,
              amount: t.amount,
              date: t.dashDate,
              kind: t.kind,
            })),
          );
        }
      }
    } catch {
      // Transactions unavailable
    }
  }

  if (env.MERCURY_ACCOUNT_ID_SAVINGS) {
    try {
      const res = await fetch(
        `https://api.mercury.com/api/v1/account/${env.MERCURY_ACCOUNT_ID_SAVINGS}`,
        { headers, signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = (await res.json()) as MercuryAccount;
        savings = data.currentBalance;
      }
    } catch {
      // Savings balance unavailable
    }
  }

  return { checking, savings, recentTx };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
}

function generateEmailHtml(data: {
  mercury: {
    checking: number | null;
    savings: number | null;
    recentTx: { name: string; amount: number; date: string; kind: string }[];
  };
  deals: { company: string; status: string; payment_status: string }[];
  deadlines: {
    date: string;
    description: string;
    status?: string;
    daysUntil: number;
    isOverdue: boolean;
  }[];
  content: { drafts: number; ready: number; published: number };
  dirtyRepos: { repo: string; unpushed: number }[];
  failedCrons: { name: string; exitCode: number }[];
  miniLastSeen: string | null;
  weekOf: string;
}): string {
  const {
    mercury,
    deals,
    deadlines,
    content,
    dirtyRepos,
    failedCrons,
    miniLastSeen,
    weekOf,
  } = data;

  const activeDeals = deals.filter(
    (d) => d.status === "active" || d.status === "negotiating",
  );
  const upcomingDeadlines = deadlines.filter(
    (d) => d.status !== "complete" && d.daysUntil <= 14,
  );
  const overdueDeadlines = deadlines.filter((d) => d.isOverdue);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'JetBrains Mono', monospace, sans-serif; background: #09090b; color: #d4d4d8; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 16px; color: #fafafa; margin: 0 0 20px; }
    h2 { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 8px; }
    .section { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .label { color: #71717a; }
    .value { color: #e4e4e7; }
    .green { color: #34d399; }
    .red { color: #f87171; }
    .amber { color: #fbbf24; }
    .muted { color: #52525b; font-size: 11px; }
    hr { border: none; border-top: 1px solid #27272a; margin: 16px 0; }
    .footer { font-size: 10px; color: #3f3f46; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Weekly Report: ${weekOf}</h1>

    <h2>Banking</h2>
    <div class="section">
      ${mercury.checking !== null ? `<div class="row"><span class="label">Checking</span><span class="value">${fmtUsd(mercury.checking)}</span></div>` : ""}
      ${mercury.savings !== null ? `<div class="row"><span class="label">Savings</span><span class="value">${fmtUsd(mercury.savings)}</span></div>` : ""}
      ${mercury.checking === null && mercury.savings === null ? '<div class="muted">Mercury not configured</div>' : ""}
      ${mercury.recentTx.length > 0 ? `<hr>${mercury.recentTx.map((tx) => `<div class="row"><span class="label">${esc(tx.name)}</span><span class="${tx.kind === "credit" ? "green" : "value"}">${tx.kind === "credit" ? "+" : "-"}${fmtUsd(Math.abs(tx.amount))}</span></div>`).join("")}` : ""}
    </div>

    <h2>Deals (${activeDeals.length} active)</h2>
    <div class="section">
      ${deals.length > 0 ? deals.map((d) => `<div class="row"><span class="label">${esc(d.company)}</span><span class="value">${esc(d.status)} · ${esc(d.payment_status)}</span></div>`).join("") : '<div class="muted">No deals in database</div>'}
    </div>

    ${overdueDeadlines.length > 0 ? `<h2 class="red">Overdue (${overdueDeadlines.length})</h2><div class="section">${overdueDeadlines.map((d) => `<div class="row"><span class="red">${esc(d.description)}</span><span class="red">${esc(d.date)}</span></div>`).join("")}</div>` : ""}

    <h2>Upcoming Deadlines</h2>
    <div class="section">
      ${upcomingDeadlines.length > 0 ? upcomingDeadlines.map((d) => `<div class="row"><span class="label">${esc(d.description)}</span><span class="${d.daysUntil <= 3 ? "amber" : "value"}">${esc(d.date)} (${d.daysUntil}d)</span></div>`).join("") : '<div class="muted">Nothing in the next 14 days</div>'}
    </div>

    <h2>Content Pipeline</h2>
    <div class="section">
      <div class="row"><span class="label">Drafts</span><span class="value">${content.drafts}</span></div>
      <div class="row"><span class="label">Ready</span><span class="value">${content.ready}</span></div>
      <div class="row"><span class="label">Published</span><span class="green">${content.published}</span></div>
    </div>

    ${dirtyRepos.length > 0 ? `<h2 class="amber">Dirty Repos (${dirtyRepos.length})</h2><div class="section">${dirtyRepos.map((r) => `<div class="row"><span class="label">${esc(r.repo)}</span><span class="amber">${r.unpushed > 0 ? `${r.unpushed} unpushed` : "uncommitted changes"}</span></div>`).join("")}</div>` : ""}

    ${failedCrons.length > 0 ? `<h2 class="red">Failed Crons (${failedCrons.length})</h2><div class="section">${failedCrons.map((c) => `<div class="row"><span class="label">${esc(c.name)}</span><span class="red">exit ${c.exitCode}</span></div>`).join("")}</div>` : ""}

    <h2>Mac Mini</h2>
    <div class="section">
      <div class="row"><span class="label">Last seen</span><span class="${miniLastSeen ? "value" : "red"}">${miniLastSeen ? fmtDate(miniLastSeen) : "No data"}</span></div>
    </div>

    <div class="footer">Sent by anipotts-weekly-email Worker</div>
  </div>
</body>
</html>`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send email via Resend with exponential backoff retry.
 * Returns null on success, error string on failure after all retries.
 */
async function sendEmailWithRetry(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = BACKOFF_BASE_MS * Math.pow(4, attempt - 1); // 1s, 4s, 16s
      await sleep(delayMs);
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ani Potts LLC <weekly@anipotts.com>",
          to: [to],
          subject,
          html,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) return null; // Success

      const status = res.status;
      // Don't retry on 4xx (except 429)
      if (status >= 400 && status < 500 && status !== 429) {
        return `Resend ${status}: ${await res.text()}`;
      }

      // 429 or 5xx: retry
      if (attempt === MAX_RETRIES - 1) {
        return `Resend ${status} after ${MAX_RETRIES} attempts`;
      }
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) {
        return e instanceof Error ? e.message : "Network error";
      }
    }
  }

  return "Max retries exceeded";
}

/**
 * Queue a failed email in D1 for retry on next cron run.
 */
async function queueEmail(
  db: D1Database,
  subject: string,
  html: string,
  to: string,
  error: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO email_queue (id, subject, html, to_address, status, attempts, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, ?)",
    )
    .bind(uuid(), subject, html, to, error, now(), now())
    .run();
}

/**
 * Retry any pending emails from the queue before generating new ones.
 */
async function retryQueuedEmails(env: Env): Promise<number> {
  const pending = await env.DB.prepare(
    "SELECT id, subject, html, to_address, attempts FROM email_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5",
  ).all<QueuedEmail>();

  let sent = 0;
  for (const email of pending.results) {
    const error = await sendEmailWithRetry(
      env.RESEND_API_KEY,
      email.to_address,
      email.subject,
      email.html,
    );

    if (!error) {
      await env.DB.prepare(
        "UPDATE email_queue SET status = 'sent', updated_at = ? WHERE id = ?",
      )
        .bind(now(), email.id)
        .run();
      sent++;
    } else {
      const newAttempts = email.attempts + 1;
      const newStatus = newAttempts >= 5 ? "failed" : "pending";
      await env.DB.prepare(
        "UPDATE email_queue SET status = ?, attempts = ?, last_error = ?, updated_at = ? WHERE id = ?",
      )
        .bind(newStatus, newAttempts, error, now(), email.id)
        .run();
    }
  }

  return sent;
}

async function buildAndSendReport(env: Env): Promise<{
  sent: boolean;
  queued: boolean;
  retried: number;
  error?: string;
}> {
  // First, retry any queued emails from previous failures
  let retried = 0;
  try {
    retried = await retryQueuedEmails(env);
  } catch (e) {
    console.error("Queue retry failed:", e instanceof Error ? e.message : e);
  }

  try {
    const weekOf = new Date().toISOString().slice(0, 10);

    // Fetch all data in parallel (Mini API + D1 for fallback)
    const [
      mercury,
      dealsRaw,
      deadlinesRaw,
      thoughtRows,
      codeHealthRows,
      opsRows,
      miniRepos,
      miniVitals,
    ] = await Promise.all([
      getMercuryData(env),
      getBusinessData(env.DB, "brand-deals"),
      getBusinessData(env.DB, "deadlines"),
      env.DB.prepare("SELECT status FROM thoughts").all<ThoughtRow>(),
      env.DB.prepare(
        "SELECT repo, dirty, unpushed_count, updated_at FROM code_health WHERE dirty = 1 OR unpushed_count > 0",
      ).all<CodeHealthRow>(),
      env.DB.prepare(
        "SELECT key, category, value, updated_at FROM ops_snapshots WHERE category IN ('crons', 'system') ORDER BY updated_at DESC",
      ).all<OpsSnapshotRow>(),
      fetchMiniApi<MiniReposResponse>(env, "/code/repos"),
      fetchMiniApi<MiniVitalsResponse>(env, "/ops/vitals"),
    ]);

    // Parse deals
    const deals = (
      Array.isArray((dealsRaw as { deals?: unknown })?.deals)
        ? (dealsRaw as { deals: Record<string, unknown>[] }).deals
        : []
    ).map((d: Record<string, unknown>) => ({
      company: String(d.company ?? ""),
      status: String(d.status ?? ""),
      payment_status: String(d.payment_status ?? ""),
    }));

    // Parse deadlines
    const rawNow = new Date();
    const rawDeadlines = (
      Array.isArray((deadlinesRaw as { deadlines?: unknown })?.deadlines)
        ? (deadlinesRaw as { deadlines: Record<string, unknown>[] }).deadlines
        : []
    ).map((d: Record<string, unknown>) => {
      const date = String(d.date ?? "");
      const status = d.status ? String(d.status) : undefined;
      const dateMs = new Date(date).getTime();
      const daysUntil = Number.isNaN(dateMs)
        ? 0
        : Math.ceil((dateMs - rawNow.getTime()) / (1000 * 60 * 60 * 24));
      return {
        date,
        description: String(d.description ?? ""),
        status,
        daysUntil,
        isOverdue: status !== "complete" && date < weekOf,
      };
    });

    // Parse content
    let drafts = 0;
    let ready = 0;
    let published = 0;
    for (const row of thoughtRows.results) {
      if (row.status === "draft") drafts++;
      else if (row.status === "ready") ready++;
      else if (row.status === "published") published++;
    }

    // Parse dirty repos: prefer Mini API data, fall back to D1
    const dirtyRepos = miniRepos
      ? miniRepos.repos
          .filter((r) => r.dirty || r.unpushed_count > 0)
          .map((r) => ({ repo: r.name, unpushed: r.unpushed_count }))
      : codeHealthRows.results.map((r) => ({
          repo: r.repo,
          unpushed: r.unpushed_count ?? 0,
        }));

    // Parse failed crons from ops_snapshots
    const failedCrons: { name: string; exitCode: number }[] = [];
    for (const row of opsRows.results) {
      if (row.category !== "crons") continue;
      try {
        const parsed = JSON.parse(row.value);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item.exit_code != null && item.exit_code !== 0) {
            failedCrons.push({
              name: String(item.name ?? row.key),
              exitCode: item.exit_code,
            });
          }
        }
      } catch {
        // skip unparseable
      }
    }

    // Mini status: prefer live vitals from Mini API, fall back to D1
    const miniLastSeen = miniVitals
      ? miniVitals.ts
      : (opsRows.results.find(
          (r) => r.category === "system" && r.key === "system",
        )?.updated_at ?? null);

    const subject = `Weekly Report: ${weekOf}`;
    const html = generateEmailHtml({
      mercury,
      deals,
      deadlines: rawDeadlines,
      content: { drafts, ready, published },
      dirtyRepos,
      failedCrons,
      miniLastSeen,
      weekOf,
    });

    const sendError = await sendEmailWithRetry(
      env.RESEND_API_KEY,
      "hello@anipotts.com",
      subject,
      html,
    );

    if (sendError) {
      // All retries failed. Queue for next cron run.
      await queueEmail(env.DB, subject, html, "hello@anipotts.com", sendError);
      console.error("Weekly email queued after failure:", sendError);
      return { sent: false, queued: true, retried, error: sendError };
    }

    return { sent: true, queued: false, retried };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    console.error("Weekly email build failed:", errorMsg);
    return { sent: false, queued: false, retried, error: errorMsg };
  }
}

// Log only: one runtime contract line per isolate. It never blocks, skips or
// changes a send, a retry or a response.
const reportRuntimeContract = createRuntimeContractReporter();

export default {
  // Manual trigger via HTTP
  async fetch(request: Request, env: Env): Promise<Response> {
    reportRuntimeContract(env, "fetch");
    if (request.method === "GET") {
      // Health check
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
        app: "weekly-email",
        ok: d1Status === "connected",
        d1: d1Status,
        tables_ok: tablesOk,
        ts: new Date().toISOString(),
      });
    }

    if (request.method === "POST") {
      const result = await buildAndSendReport(env);
      return jsonResponse(
        result as unknown as Record<string, unknown>,
        result.sent ? 200 : 500,
      );
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  },

  // Cron trigger: Sunday 9am EDT
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    reportRuntimeContract(env, "scheduled");
    ctx.waitUntil(
      buildAndSendReport(env).then((result) => {
        if (!result.sent && !result.queued) {
          console.error("Weekly email failed completely:", result.error);
        } else if (result.queued) {
          console.error("Weekly email queued for retry:", result.error);
        }
        if (result.retried > 0) {
          console.log(`Retried ${result.retried} queued email(s)`);
        }
      }),
    );
  },
};
