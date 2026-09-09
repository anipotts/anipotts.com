const csrfCookie = "__Host-editorial-csrf";
const tokenPattern = /^[a-f0-9]{64}$/;

export function privateEditorialResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Call only after verifying the Access assertion. The token grants no identity. */
export function issueEditorialCsrf(request?: Request): Response {
  const existing = (request?.headers.get("Cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${csrfCookie}=`));
  const previous =
    existing.length === 1 ? existing[0]!.slice(csrfCookie.length + 1) : "";
  const token = tokenPattern.test(previous)
    ? previous
    : Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
  const response = privateEditorialResponse({ csrf: token });
  response.headers.set(
    "Set-Cookie",
    `${csrfCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

/** Defense in depth after authentication, never an alternative to it. */
export function checkEditorialMutation(
  request: Request,
  configuredOrigin: string,
): "origin_required" | "csrf_required" | "json_required" | null {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (url.origin !== configuredOrigin || origin !== configuredOrigin)
    return "origin_required";
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null && fetchSite !== "same-origin")
    return "origin_required";
  const cookies = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${csrfCookie}=`));
  // Duplicate cookies are ambiguous and rejected instead of choosing first/last.
  if (cookies.length !== 1) return "csrf_required";
  const cookie = cookies[0]!.slice(csrfCookie.length + 1);
  const supplied = request.headers.get("X-Editorial-CSRF");
  if (!tokenPattern.test(cookie) || !supplied || !tokenPattern.test(supplied))
    return "csrf_required";
  let difference = 0;
  for (let index = 0; index < cookie.length; index++)
    difference |= cookie.charCodeAt(index) ^ supplied.charCodeAt(index);
  if (difference !== 0) return "csrf_required";
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return "json_required";
  return null;
}

/** Bound streaming input too; Content-Length is only an early rejection hint. */
export async function readEditorialJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > limit))
    throw new Error("request_too_large");
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new Error("invalid_json");
  }
}
