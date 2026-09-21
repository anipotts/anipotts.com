/** Configured modes enter the guarded reader. Only absent/legacy may use Git. */
export function usesPublishedContent(env: unknown): boolean {
  if (!env || typeof env !== "object" || !("CONTENT_RUNTIME" in env))
    return false;
  return env.CONTENT_RUNTIME !== undefined && env.CONTENT_RUNTIME !== "legacy";
}

/** CMS surfaces must never take an ASSETS shortcut, even if stale files exist. */
export function isRuntimeContentPath(pathname: string): boolean {
  return (
    /^\/(?:work(?:\/.*)?|writing(?:\/.*)?|systems|feed\.xml|sitemap\.xml|search-index\.json)?\/?$/u.test(
      pathname,
    ) ||
    pathname === "/api/content-version" ||
    pathname.startsWith("/images/editorial/")
  );
}
