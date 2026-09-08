/** shared guards for the POST endpoints: origin allowlist + d1 sliding-window
 *  rate limit (5 requests / 10 min per ip, table rate_limits). */
import { siteConfig } from "@anipotts/content/public";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CANONICAL_ORIGINS = new Set([
  siteConfig.url,
  `${new URL(siteConfig.url).protocol}//www.${new URL(siteConfig.url).host}`,
]);

/** reject cross-origin posts. same-origin (the serving host, so previews and
 *  local dev work) and the canonical origins pass. */
export function checkOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (CANONICAL_ORIGINS.has(origin)) return null;
  try {
    if (new URL(origin).host === new URL(request.url).host) return null;
  } catch {
    /* malformed origin header falls through to forbidden */
  }
  return json({ error: "Forbidden" }, 403);
}

function requestIp(request: Request): string {
  // Cloudflare supplies this identity. Client-supplied forwarding chains do
  // not select a bucket; local requests without the edge header share one.
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

export async function checkRateLimit(
  request: Request,
  db: D1Database | undefined,
): Promise<boolean> {
  if (!db) throw new Error("rate-limit database unavailable");
  const key = `contact:${requestIp(request)}`;
  const now = Date.now();
  const windowStart = now - 10 * 60 * 1000;
  const max = 5;
  await db.batch([
    db
      .prepare("DELETE FROM rate_limits WHERE key = ? AND ts < ?")
      .bind(key, windowStart),
    db
      .prepare("INSERT INTO rate_limits (key, ts) VALUES (?, ?)")
      .bind(key, now),
  ]);
  const row = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND ts >= ?",
    )
    .bind(key, windowStart)
    .first<{ cnt: number }>();
  if (!row || !Number.isSafeInteger(row.cnt) || row.cnt < 1) {
    throw new Error("rate-limit count unavailable");
  }
  return row.cnt <= max;
}
