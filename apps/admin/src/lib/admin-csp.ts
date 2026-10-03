/** A fresh response nonce is attached only to scripts owned by AdminDocument. */
export function createAdminScriptNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Keep Astro's hashes for its own hydration scripts and add our template nonce. */
export function withAdminScriptNonce(
  response: Response,
  nonce: string,
): Response {
  if (!response.headers.get("Content-Type")?.includes("text/html"))
    return response;
  const policy = response.headers.get("Content-Security-Policy");
  if (!policy) return response;
  const updated = policy.replace(
    /(^|;\s*)(script-src(?:-elem)?\s+)([^;]*)/gu,
    (_match, prefix: string, directive: string, sources: string) =>
      `${prefix}${directive}${sources.trimEnd()} 'nonce-${nonce}'`,
  );
  if (updated !== policy)
    response.headers.set("Content-Security-Policy", updated);
  return response;
}
