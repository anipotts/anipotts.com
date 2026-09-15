/** Static files the Worker answers straight from env.ASSETS.
 *
 * The Cloudflare adapter fetches manifest assets by URL string, which drops
 * the request headers, so If-None-Match never reaches the assets service and
 * every revalidation downloads the full file again. src/worker.ts sends the
 * original request for these paths instead, so a matching validator gets a
 * 304. Pages stay with the adapter and middleware.
 */
const STATIC_PREFIXES = ["/_astro/", "/images/", "/brand/"];
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
 * revalidate in the background. The feed, sitemap, favicons and the rest keep
 * revalidating on every use. */
export function staticCacheControl(pathname: string): string | null {
  if (pathname.startsWith("/_astro/"))
    return "public, max-age=31536000, immutable";
  if (pathname.startsWith("/images/") || pathname.startsWith("/brand/"))
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
