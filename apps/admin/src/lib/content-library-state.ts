const libraryGroups = [
  "pages",
  "website",
  "writing",
  "work",
  "newsletter",
  "systems",
] as const;
/** One route per Content library. The mixed `pages` overview and `systems`
 * subset have no route of their own; they land on Pages. */
export const libraryPaths = {
  website: "/content/pages",
  writing: "/content/writing",
  work: "/content/projects",
  newsletter: "/content/newsletter",
} as const;
const NEWSLETTER_PATHS = [libraryPaths.newsletter, "/newsletter"];
/** The library a route shows, or undefined for a route that is not a library. */
export function libraryGroupForPath(pathname: string): string | undefined {
  if (NEWSLETTER_PATHS.includes(pathname)) return "newsletter";
  const match = Object.entries(libraryPaths).find(
    ([, path]) => path === pathname,
  );
  if (match) return match[0];
  return pathname === "/content" ? "website" : undefined;
}
/** The route for a library group. Legacy groups land on Pages. */
export function libraryPath(group: string): string {
  return group in libraryPaths
    ? libraryPaths[group as keyof typeof libraryPaths]
    : libraryPaths.website;
}
export type LibrarySort = "attention" | "updated" | "title";
export type LibraryState = {
  group: string;
  q: string;
  status: string;
  sort: LibrarySort;
};
/** Every status a library can filter by, in lifecycle order. Menus list the
 * ones a library holds in this order, whatever order the records came in. */
export const LIBRARY_STATUSES = [
  "draft",
  "review",
  "ready",
  "scheduled",
  "published",
  "featured",
  "listed",
  "hidden",
  "archived",
  "blocked",
] as const;
const statuses = new Set<string>(["all", "changes", ...LIBRARY_STATUSES]);
/** Each sort's one name, in the menu, its tooltip and its accessible name. */
export const SORT_LABELS: Record<LibrarySort, string> = {
  attention: "Needs attention",
  updated: "Last updated",
  title: "Title",
};
const origin = "https://editorial.invalid";
export function readLibraryState(
  search: string,
  fallbackGroup = "website",
): LibraryState {
  const params = new URLSearchParams(search);
  const group = params.get("group") ?? fallbackGroup;
  const status = params.get("status") ?? "all";
  const sort = params.get("sort");
  return {
    group: libraryGroups.includes(group as (typeof libraryGroups)[number])
      ? group
      : "website",
    q: (params.get("q") ?? "").slice(0, 512),
    status: statuses.has(status) ? status : "all",
    sort: sort === "title" || sort === "updated" ? sort : "attention",
  };
}
export function libraryStateUrl(
  pathname: string,
  search: string,
  state: LibraryState,
): string {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()])
    if (!["theme", "q", "status", "sort"].includes(key)) params.delete(key);
  if (!["light", "dark", "system"].includes(params.get("theme") ?? ""))
    params.delete("theme");
  const set = (key: string, value: string, omit: boolean) =>
    omit ? params.delete(key) : params.set(key, value);
  // The route names the library, so the group never travels as a parameter.
  set("q", state.q, !state.q);
  set("status", state.status, state.status === "all");
  set("sort", state.sort, state.sort === "attention");
  const query = params.toString();
  const path = NEWSLETTER_PATHS.includes(pathname)
    ? libraryPaths.newsletter
    : libraryPath(state.group);
  return `${path}${query ? `?${query}` : ""}`;
}
/** Only a library destination, never an auth endpoint, record, or external redirect. */
export function libraryReturnPath(value: string | null | undefined): string {
  const fallback = libraryPaths.website;
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value))
    return fallback;
  try {
    const url = new URL(value, origin);
    const group = libraryGroupForPath(url.pathname);
    if (url.origin !== origin || !group) return fallback;
    return libraryStateUrl(
      url.pathname,
      url.search,
      readLibraryState(url.search, group),
    );
  } catch {
    return fallback;
  }
}
export function recordLibraryHref(href: string, returnTo: string): string {
  const url = new URL(href, origin);
  if (
    url.origin !== origin ||
    !/^\/(?:content|newsletter)\//.test(url.pathname)
  )
    return href;
  url.searchParams.set("returnTo", libraryReturnPath(returnTo));
  return `${url.pathname}${url.search}${url.hash}`;
}
