import { dataKind, dataRecordsHref } from "./data-routes";
import { safeReturnPath } from "./editorial-return-path";

export const workspaces = {
  content: { label: "Content", href: "/content/pages" },
  operations: { label: "Observability", href: "/observability/status" },
  life: { label: "Data", href: "/data/records" },
} as const;
export type Workspace = keyof typeof workspaces;

/** Only navigation preferences survive a workspace switch, never private
 * queries, record ids or cursors. */
export function workspaceReturnPath(
  workspace: Workspace,
  value: string,
): string {
  const fallback = workspaces[workspace].href;
  const url = safeReturnPath(value);
  if (!url) return fallback;
  const path = url.pathname;
  if (workspace === "life") {
    if (!/^\/data\/(?:records|sources)$/.test(path)) return fallback;
    // The kind filter is a view, not a record identity.
    return path === "/data/records"
      ? dataRecordsHref(dataKind(url.searchParams.get("kind")))
      : path;
  }
  if (workspace === "content") {
    if (
      !/^\/(content\/(?:pages|writing|projects|newsletter|new|new-project|(?:home|page|work|writing|projects|workPage|writingPage|systemsPage|newsletterPage)\/[a-zA-Z0-9_-]+)|newsletter\/[a-zA-Z0-9_-]+)$/.test(
        path,
      )
    )
      return fallback;
  } else if (
    !/^\/(observability\/(?:status|activity|alerts)|work|system|proof|ops\/destructive|content\/(?:review|drafts|preview|operations|carousels))$/.test(
      path,
    )
  )
    return fallback;
  const params = new URLSearchParams();
  for (const key of ["status", "sort", "view", "panel"])
    if (/^[a-z-]{1,40}$/.test(url.searchParams.get(key) ?? ""))
      params.set(key, url.searchParams.get(key)!);
  return path + (params.size ? `?${params}` : "");
}
