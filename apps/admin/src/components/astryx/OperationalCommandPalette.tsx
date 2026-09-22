import { AdminCommandPalette } from "./AdminCommandPalette";
import type { NavItem } from "../../data/admin";
import type { AdminSearchResult } from "../../data/admin-search";
import { sidebarSearchEntries } from "./UnifiedSidebar";

/** Observability's pages, from the one sidebar list. */
export const operationalDestinations: AdminSearchResult[] =
  sidebarSearchEntries.filter((entry) => entry.currentFact === "Observability");
/** Every sidebar page; the search then adds the operational pages below. */
const paletteDestinations: AdminSearchResult[] = sidebarSearchEntries;
export function operationalSearchNavigation(items: NavItem[]): NavItem[] {
  const routes = new Set(["/work", "/work?view=now", "/system", "/proof"]);
  return items.filter(
    (item) =>
      routes.has(item.href) &&
      !["life", "website", "content"].includes(item.group),
  );
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
    />
  );
}
