export const workspaces = {
  content: { label: "Content", href: "/content" },
  operations: { label: "Operations", href: "/operations/observability" },
  life: { label: "Life", href: "/life" },
} as const;
export type Workspace = keyof typeof workspaces;

/** Only navigation preferences survive a workspace switch, never private queries. */
export function workspaceReturnPath(
  workspace: Workspace,
  value: string,
): string {
  const fallback = workspaces[workspace].href;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  const url = new URL(value, "https://admin.invalid");
  if (url.origin !== "https://admin.invalid") return fallback;
  const path = url.pathname;
  if (workspace === "life")
    return /^\/life(?:\/(people|projects|places|timeline|sources|preview|health|aesthetics))?$/.test(
      path,
    )
      ? path
      : fallback;
  if (workspace === "content") {
    if (
      !/^\/(content(?:\/(?:new|(?:home|page|work|writing|projects|workPage|writingPage|systemsPage|newsletterPage)\/[a-zA-Z0-9_-]+))?|newsletter(?:\/[a-zA-Z0-9_-]+)?)$/.test(
        path,
      )
    )
      return fallback;
  } else if (
    !/^\/(operations\/observability|inbox|work|handoffs|system|fleet|proof|deploys|repos|mutations|knowledge(?:\/locations)?|ops\/destructive|content\/(?:review|drafts|preview|operations|carousels))$/.test(
      path,
    )
  )
    return fallback;
  const params = new URLSearchParams();
  for (const key of ["group", "status", "sort", "view", "panel"])
    if (/^[a-z-]{1,40}$/.test(url.searchParams.get(key) ?? ""))
      params.set(key, url.searchParams.get(key)!);
  // These are route filters, not record identities. Keep their allowlists
  // aligned with knowledge.astro and AdminHome.astro respectively.
  const routeFilter =
    workspace === "operations" && path === "/knowledge"
      ? {
          key: "kind",
          values: [
            "all",
            "people",
            "project",
            "decision",
            "concept",
            "place",
            "system",
          ],
        }
      : workspace === "operations" && path === "/inbox"
        ? { key: "category", values: ["work", "content", "life", "system"] }
        : undefined;
  if (routeFilter) {
    const value = url.searchParams.get(routeFilter.key);
    if (value && routeFilter.values.includes(value))
      params.set(routeFilter.key, value);
  }
  return path + (params.size ? `?${params}` : "");
}
