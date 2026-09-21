/** Static files the Worker answers straight from env.ASSETS.
 *
 * The Cloudflare adapter fetches manifest assets by URL string, which drops
 * the request headers, so If-None-Match never reaches the assets service and
 * every revalidation downloads the full file again. src/worker.ts sends the
 * original request for these paths instead, so a matching validator gets a
 * 304. Pages stay with the adapter and middleware.
 */
const STATIC_PREFIXES = ["/_astro/", "/images/", "/brand/", "/social/"];
const STATIC_FILES = new Set([
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/og-image.png",
  "/feed.xml",
  "/search-index.json",
  "/robots.txt",
  "/sitemap.xml",
]);

export function isStaticAssetPath(pathname: string): boolean {
  return (
    STATIC_FILES.has(pathname) ||
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Cache-Control by path class, or null to keep the ASSETS default
 * (public, max-age=0, must-revalidate). Build output under /_astro is content
 * hashed, so it never changes under its name. Public images and brand marks
 * keep their names across edits, so they stay fresh for a day and then
 * revalidate in the background, and the built social cards ride the same
 * policy because a card is rebuilt under its own name when its title changes.
 * The feed, sitemap, favicons and the rest keep revalidating on every use. */
export function staticCacheControl(pathname: string): string | null {
  if (pathname.startsWith("/_astro/"))
    return "public, max-age=31536000, immutable";
  if (
    pathname.startsWith("/images/") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/social/")
  )
    return "public, max-age=86400, stale-while-revalidate=604800";
  return null;
}

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** Applies the class policy. ASSETS headers are immutable, so a copy is made
 * only when the value differs; it keeps status, validators and a null body on
 * a 304. */
export function withStaticCacheControl(
  pathname: string,
  response: Response,
): Response {
  const value = staticCacheControl(pathname);
  if (!value || response.headers.get("cache-control") === value)
    return response;
  const body = NULL_BODY_STATUSES.has(response.status) ? null : response.body;
  const cached = new Response(body, response);
  cached.headers.set("cache-control", value);
  return cached;
}

const ENTITY_TAG = /(?:W\/)?"[^"]*"/g;
const opaque = (tag: string) => tag.replace(/^W\//, "");

/** Answers a conditional GET or HEAD that the adapter could not. It serves
 * prerendered top-level pages from ASSETS by URL string, which drops
 * If-None-Match, so a matching validator used to get the full page again,
 * including the click after a hover prefetch. A 200 whose ETag matches the
 * request, compared weakly as RFC 9110 requires for If-None-Match, becomes a
 * bodyless 304 with the same headers. Every other response and /api pass
 * through unchanged. */
export function withConditionalStatus(
  // Only what is read, so the adapter's workers Request type fits as well.
  request: {
    method: string;
    headers: { get(name: string): string | null };
  },
  pathname: string,
  response: Response,
): Response {
  if (response.status !== 200) return response;
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  if (pathname.startsWith("/api/")) return response;
  const etag = response.headers.get("etag");
  const condition = request.headers.get("if-none-match");
  if (!etag || !condition) return response;
  const matches =
    condition.trim() === "*" ||
    (condition.match(ENTITY_TAG) ?? []).some(
      (tag) => opaque(tag) === opaque(etag),
    );
  if (!matches) return response;
  void response.body?.cancel();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(null, { status: 304, headers });
}

/** Rendered pages that set no cache policy of their own (legacy Git mode,
 * which prerendered before routes moved to SSR) get the same revalidation
 * contract as prerendered HTML: a strong ETag over the body and
 * `public, max-age=0, must-revalidate`, so withConditionalStatus can answer
 * 304. Responses that already choose a policy, such as the published reader's
 * no-store, are left alone. */
export async function withRenderedValidator(
  request: { method: string },
  pathname: string,
  response: Response,
): Promise<Response> {
  if (response.status !== 200) return response;
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  if (pathname.startsWith("/api/")) return response;
  if (response.headers.has("cache-control") || response.headers.has("etag"))
    return response;
  const body = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  const tag = [...digest.slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const headers = new Headers(response.headers);
  headers.set("etag", `"${tag}"`);
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  return new Response(request.method === "HEAD" ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
