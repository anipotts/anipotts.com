/** Configured modes enter the guarded reader. Only absent/legacy may use Git. */
export function usesPublishedContent(env: unknown): boolean {
  if (!env || typeof env !== "object" || !("CONTENT_RUNTIME" in env))
    return false;
  return env.CONTENT_RUNTIME !== undefined && env.CONTENT_RUNTIME !== "legacy";
}

/** Normalize unreserved ASCII escapes before routing. Reject ambiguous separators,
 * double encoding and malformed escapes instead of letting ASSETS decode them
 * differently from the publication guard. UTF-8 path segments remain encoded. */
export function canonicalContentPath(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    if (/[\\%\u0000-\u001f?#]/u.test(decoded) || /%2f/iu.test(pathname))
      return null;
    return pathname.replace(/%([a-f0-9]{2})/giu, (escape, hex: string) => {
      const character = String.fromCharCode(Number.parseInt(hex, 16));
      return /^[a-z0-9._~-]$/iu.test(character) ? character : escape;
    });
  } catch {
    return null;
  }
}

/** CMS surfaces whose 200 is a rendered view of the inventory: pages, the
 * feed, the sitemap and the search index. They get a version validator and
 * the edge copy. The verification API and editorial media stay no-store. */
export function isCacheableContentPath(pathname: string): boolean {
  return (
    isRuntimeContentPath(pathname) &&
    pathname !== "/api/content-version" &&
    !pathname.startsWith("/images/")
  );
}

/** CMS surfaces must never take an ASSETS shortcut, even if stale files exist. */
export function isRuntimeContentPath(pathname: string): boolean {
  const canonical = canonicalContentPath(pathname);
  if (canonical === null) return true;
  pathname = canonical;
  return (
    /^\/(?:work(?:\/.*)?|writing(?:\/.*)?|systems|feed\.xml|sitemap\.xml|search-index\.json)?\/?$/u.test(
      pathname,
    ) ||
    pathname === "/api/content-version" ||
    pathname.startsWith("/images/editorial/")
  );
}
