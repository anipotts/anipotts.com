/**
 * Build output under /_astro is content hashed: a name never serves other
 * bytes, so the browser keeps it for a year and never asks again. `private`
 * keeps every shared cache out, even for code behind Access. Pages and APIs
 * keep `private, no-store` from the middleware.
 *
 * The Cloudflare adapter fetches these files by URL string, which drops the
 * request's headers, and the assets service's default is `public, max-age=0,
 * must-revalidate`. Every document load asked again for every script and
 * stylesheet and, with If-None-Match lost, downloaded each one in full.
 * src/worker.ts passes the original request instead, so a reload's validator
 * still gets a 304.
 */
export const HASHED_ASSET_CACHE = "private, max-age=31536000, immutable";

export function isHashedAssetRequest(request: {
  method: string;
  url: string;
}): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    new URL(request.url).pathname.startsWith("/_astro/")
  );
}

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** ASSETS headers are immutable, so the policy goes on a copy that keeps the
 * status, validators and a null body on a 304. */
export function withHashedAssetCache(response: Response): Response {
  const cached = new Response(
    NULL_BODY_STATUSES.has(response.status) ? null : response.body,
    response,
  );
  cached.headers.set("Cache-Control", HASHED_ASSET_CACHE);
  return cached;
}
