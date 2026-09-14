/** shared guards for the POST endpoints: origin allowlist, byte-capped bodies
 *  and a d1 sliding-window rate limit (5 requests / 10 min per ip, table
 *  rate_limits). */
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
    if (new URL(origin).origin === new URL(request.url).origin) return null;
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

/** read a request body as text, or null once it exceeds maxBytes. the stream
 *  is cancelled at the cap, so an oversized body is never fully buffered. */
export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const RATE_LIMIT_PREFIX = "contact:";
// ";" sorts directly after ":", so [prefix, end) is exactly the prefix range.
const RATE_LIMIT_PREFIX_END = "contact;";
const RATE_LIMIT_CLEANUP_ROWS = 100;

export async function checkRateLimit(
  request: Request,
  db: D1Database | undefined,
): Promise<boolean> {
  if (!db) throw new Error("rate-limit database unavailable");
  const key = `${RATE_LIMIT_PREFIX}${requestIp(request)}`;
  const now = Date.now();
  const windowStart = now - 10 * 60 * 1000;
  const max = 5;
  await db.batch([
    db
      .prepare("DELETE FROM rate_limits WHERE key = ? AND ts < ?")
      .bind(key, windowStart),
    // Rotating client addresses never revisit their own key, so each request
    // also removes a capped batch of other expired rows in this key family.
    db
      .prepare(
        "DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE key >= ? AND key < ? AND ts < ? LIMIT ?)",
      )
      .bind(
        RATE_LIMIT_PREFIX,
        RATE_LIMIT_PREFIX_END,
        windowStart,
        RATE_LIMIT_CLEANUP_ROWS,
      ),
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
