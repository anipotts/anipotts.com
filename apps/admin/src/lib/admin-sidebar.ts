/** Saved sidebar choice. The first key is current; the second is read once for
 * people who collapsed the sidebar before the key moved. */
export const SIDEBAR_STORAGE_KEYS = [
  "admin:sidebar-collapsed",
  "editorial:sidebar-collapsed",
] as const;

/** AppShell's md drawer covers widths up to and including 768px, so the rail
 * exists only above it, and by default only below the wide layout. */
export const RAIL_QUERY = "(min-width: 769px) and (max-width: 1279px)";
export const DRAWER_MAX_WIDTH = 768;

export function savedSidebarCollapsed(storage: Pick<Storage, "getItem">) {
  for (const key of SIDEBAR_STORAGE_KEYS) {
    try {
      const value = storage.getItem(key);
      if (value === "true" || value === "false") return value === "true";
    } catch {
      return null;
    }
  }
  return null;
}

/** Whether the sidebar is the collapsed rail at this width. */
export function sidebarRail(
  width: number,
  collapsed: boolean | null,
  inRailRange: boolean,
) {
  return width <= DRAWER_MAX_WIDTH ? false : (collapsed ?? inRailRange);
}

/**
 * Runs before first paint and records the sidebar shape on the root element,
 * so the page lays out with the rail it will keep instead of the server's
 * expanded sidebar. Self-contained, like the theme prepaint, because it is
 * serialized into the document.
 */
export function prepaintAdminSidebar() {
  // Do not introduce nested functions here. Worker bundling can wrap them in
  // name-preservation helpers that would escape into the serialized script.
  let collapsed: boolean | null = null;
  for (const key of [
    "admin:sidebar-collapsed",
    "editorial:sidebar-collapsed",
  ]) {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {
      break;
    }
    if (value === "true" || value === "false") {
      collapsed = value === "true";
      break;
    }
  }
  const width = window.innerWidth;
  const rail =
    width <= 768
      ? false
      : (collapsed ??
        window.matchMedia("(min-width: 769px) and (max-width: 1279px)")
          .matches);
  document.documentElement.dataset.adminSidebar = rail ? "rail" : "full";
}

export const adminSidebarPrepaintScript = `(${prepaintAdminSidebar.toString()})();`;
