export const libraryGroups = [
  "pages",
  "website",
  "writing",
  "work",
  "systems",
] as const;
export const librarySorts = ["attention", "updated", "title"] as const;
export type LibraryState = {
  group: string;
  q: string;
  status: string;
  sort: "attention" | "updated" | "title";
  sections?: string[];
};
const statuses = new Set([
  "all",
  "changes",
  "draft",
  "published",
  "featured",
  "listed",
  "hidden",
  "archived",
  "scheduled",
  "review",
  "ready",
  "blocked",
]);
const origin = "https://editorial.invalid";
export function readLibraryState(
  search: string,
  fallbackGroup = "pages",
): LibraryState {
  const params = new URLSearchParams(search);
  const group = params.get("group") ?? fallbackGroup;
  const status = params.get("status") ?? "all";
  return {
    group: libraryGroups.includes(group as (typeof libraryGroups)[number])
      ? group
      : "pages",
    q: (params.get("q") ?? "").slice(0, 512),
    status: statuses.has(status) ? status : "all",
    sort:
      params.get("sort") === "title"
        ? "title"
        : params.get("sort") === "updated"
          ? "updated"
          : "attention",
    sections: params.has("sections")
      ? (params.get("sections") ?? "")
          .split(",")
          .filter((value) => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value))
          .slice(0, 30)
      : undefined,
  };
}
export function libraryStateUrl(
  pathname: string,
  search: string,
  state: LibraryState,
): string {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()])
    if (!["theme", "group", "q", "status", "sort", "sections"].includes(key))
      params.delete(key);
  if (!["light", "dark", "system"].includes(params.get("theme") ?? ""))
    params.delete("theme");
  const set = (key: string, value: string, omit: boolean) =>
    omit ? params.delete(key) : params.set(key, value);
  set(
    "group",
    state.group,
    state.group === "pages" || pathname === "/newsletter",
  );
  set("q", state.q, !state.q);
  set("status", state.status, state.status === "all");
  set("sort", state.sort, state.sort === "attention");
  if (state.sections === undefined) params.delete("sections");
  else params.set("sections", [...new Set(state.sections)].sort().join(","));
  const query = params.toString();
  return `${pathname === "/newsletter" ? pathname : "/content"}${query ? `?${query}` : ""}`;
}
/** Only a library destination, never an auth endpoint, record, or external redirect. */
export function libraryReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value))
    return "/content";
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      !["/content", "/newsletter"].includes(url.pathname)
    )
      return "/content";
    return libraryStateUrl(
      url.pathname,
      url.search,
      readLibraryState(url.search),
    );
  } catch {
    return "/content";
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
