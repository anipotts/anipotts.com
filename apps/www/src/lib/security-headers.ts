/** Security headers for every www response, on every host the Worker serves.
 *
 * This is the only copy of the header values. src/worker.ts applies them to
 * whatever the Cloudflare adapter returns, which covers prerendered pages and
 * static assets served through env.ASSETS before middleware runs. That only
 * holds while apps/www/wrangler.toml keeps `run_worker_first = true`.
 * Middleware applies them too, so `astro dev` pages carry the same policy.
 *
 * Cloudflare Web Analytics is injected at the edge into proxied HTML. Its
 * beacon loads from static.cloudflareinsights.com under a versioned path and
 * reports to same-origin /cdn-cgi/rum, which `connect-src 'self'` covers.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com",
  ].join("; "),
};

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** Applies the baseline to a response, and the baseline always wins. A header
 * that is missing, duplicated or set upstream to any other value, weaker or
 * stricter, is replaced, so each one is sent exactly once with the value
 * above. A route that needs a different value needs a deliberate, scoped
 * exception in this module. ASSETS responses have immutable headers, so a copy
 * is made only when something differs. The copy keeps the status, the body
 * stream and every other header, including ETag and Cache-Control.
 */
export function withSecurityHeaders(response: Response): Response {
  const differing = Object.entries(SECURITY_HEADERS).filter(
    ([name, value]) => response.headers.get(name) !== value,
  );
  if (differing.length === 0) return response;
  const body = NULL_BODY_STATUSES.has(response.status) ? null : response.body;
  const secured = new Response(body, response);
  for (const [name, value] of differing) secured.headers.set(name, value);
  return secured;
}
