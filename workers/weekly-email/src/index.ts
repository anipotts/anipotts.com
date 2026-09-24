import { createRuntimeContractReporter } from "./runtime-contract";

// Retired on 2026-09-22. Every Sunday run since 2026-05-03 failed with a
// Resend 401 and queued its report, and every report input had stopped
// changing in April. The worker now sends nothing: the report build, the send
// and the queue retry are gone, so a restored Resend key can never deliver the
// stale queued reports. GET reports the retirement and the queue counts, a
// stale schedule is logged and ignored, and every other request answers 405.

interface Env {
  DB: D1Database;
}

const QUEUE_STATUSES = ["pending", "failed", "sent"] as const;

interface QueueRow {
  status: string;
  n: number;
  last_at: string | null;
}

interface QueueState {
  counts: Record<string, number>;
  lastSentAt: string | null;
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
 * Counts and one timestamp only, never a subject, address or body. The worker
 * never recorded a direct send, so last_sent_at is the newest queued report a
 * retry delivered. No queued report was ever delivered, so it reads null.
 */
async function readQueue(db: D1Database): Promise<QueueState> {
  const { results } = await db
    .prepare(
      "SELECT status, COUNT(*) AS n, MAX(updated_at) AS last_at FROM email_queue GROUP BY status",
    )
    .all<QueueRow>();
  const counts: Record<string, number> = {};
  for (const status of QUEUE_STATUSES) counts[status] = 0;
  let lastSentAt: string | null = null;
  for (const row of results) {
    counts[row.status] = Number(row.n) || 0;
    if (row.status === "sent" && typeof row.last_at === "string")
      lastSentAt = row.last_at;
  }
  return { counts, lastSentAt };
}

// Log only: one runtime contract line per isolate. It never changes a response.
const reportRuntimeContract = createRuntimeContractReporter();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    reportRuntimeContract(env, "fetch");
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let queue: QueueState | null = null;
    try {
      queue = await readQueue(env.DB);
    } catch {
      queue = null;
    }
    return jsonResponse(
      {
        app: "weekly-email",
        ok: false,
        retired: true,
        d1: queue ? "connected" : "error",
        last_sent_at: queue?.lastSentAt ?? null,
        email_queue: queue?.counts ?? null,
        ts: new Date().toISOString(),
      },
      410,
    );
  },

  // The deploy removes the Sunday schedule. If a stale one still fires, log it
  // and do nothing else.
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    reportRuntimeContract(env, "scheduled");
    console.warn(
      JSON.stringify({
        event: "scheduled_retired",
        worker: "weekly-email",
        cron: typeof event?.cron === "string" ? event.cron : null,
        scheduled_at: isoOrNull(event?.scheduledTime),
      }),
    );
  },
};
