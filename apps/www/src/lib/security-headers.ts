/** Security headers for every www response, on every host the Worker serves.
 *
 * This is the only copy of the header values. src/worker.ts applies them to
 * whatever the Cloudflare adapter returns, which covers prerendered pages and
 * static assets served through env.ASSETS before middleware runs. Middleware
 * applies them too, so `astro dev` pages carry the same policy.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com",
  ].join("; "),
};

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** Adds each security header the response does not already carry. A value
 * set upstream is kept as is, so a stricter route policy is never replaced
 * and no header is sent twice. ASSETS responses have immutable headers, so a
 * copy is made only when something is missing. The copy keeps the status,
 * the body stream and every existing header, including ETag and Cache-Control.
 */
export function withSecurityHeaders(response: Response): Response {
  const missing = Object.entries(SECURITY_HEADERS).filter(
    ([name]) => !response.headers.has(name),
  );
  if (missing.length === 0) return response;
  const body = NULL_BODY_STATUSES.has(response.status) ? null : response.body;
  const secured = new Response(body, response);
  for (const [name, value] of missing) secured.headers.set(name, value);
  return secured;
}
