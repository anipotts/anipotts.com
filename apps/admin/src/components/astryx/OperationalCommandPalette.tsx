import { AdminCommandPalette } from "./AdminCommandPalette";
import type { NavItem } from "../../data/admin";
import type { AdminSearchResult } from "../../data/admin-search";
import { sidebarSearchEntries } from "./UnifiedSidebar";
import { observabilityNavigation } from "../../lib/observability-navigation";

export const operationalDestinations: AdminSearchResult[] =
  observabilityNavigation.map(({ label, href }) => ({
    id: `nav:${href}`,
    label,
    href,
    domain: "navigation",
    kind: "destination",
    currentFact: "",
    source: "admin",
    freshness: "current",
    keywords: [],
  }));
/** Every sidebar page, then any operational destination it does not list. */
const paletteDestinations: AdminSearchResult[] = [
  ...sidebarSearchEntries,
  ...operationalDestinations.filter(
    (entry) => !sidebarSearchEntries.some((row) => row.id === entry.id),
  ),
];
export function operationalSearchNavigation(items: NavItem[]): NavItem[] {
  const routes = new Set(["/work", "/work?view=now", "/system", "/proof"]);
  return items.filter(
    (item) =>
      routes.has(item.href) &&
      !["life", "website", "content"].includes(item.group),
  );
}
export async function loadLiveResults(): Promise<AdminSearchResult[]> {
  const rows: AdminSearchResult[] = [];
  const [runtimeResponse] = await Promise.allSettled([
    fetch("/api/admin/runtime-feed", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  if (runtimeResponse.status === "fulfilled" && runtimeResponse.value.ok) {
    const payload = await runtimeResponse.value.json();
    const tasks = Array.isArray(payload?.task_states)
      ? payload.task_states
      : Array.isArray(payload?.projections?.task_states)
        ? payload.projections.task_states
        : [];
    for (const task of tasks) {
      rows.push({
        id: `work:${task.task_id}`,
        label: task.canonical_title || task.title,
        domain: "work",
        kind: task.operator_state || "work",
        currentFact: task.next_action || task.bounded_goal || task.summary,
        source: task.provider || task.source,
        freshness: task.last_observed_at || task.freshness,
        href: `/work?view=now&entity=${encodeURIComponent(task.primary_entity_ref || task.task_id)}`,
        keywords: [task.project_label, task.owner, task.host],
      });
    }
  }

  if (
    [runtimeResponse].some(
      (result) => result.status === "rejected" || !result.value.ok,
    )
  ) {
    throw new Error(
      "Some operational sources could not be loaded. Navigation remains available.",
    );
  }
  return rows;
}

export function OperationalCommandPalette({
  navItems,
  showTrigger = true,
}: {
  navItems: NavItem[];
  showTrigger?: boolean;
}) {
  return (
    <AdminCommandPalette
      navItems={[]}
      searchableNavItems={operationalSearchNavigation(navItems)}
      entries={paletteDestinations}
      showTrigger={showTrigger}
      loadEntries={loadLiveResults}
    />
  );
}
