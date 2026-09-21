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

/** The unified sidebar's groups, in the order they are shown. The ids are the
 * workspace ids; the labels live in `workspaces`. */
const SIDEBAR_GROUP_IDS = ["content", "life", "operations"] as const;
export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number];
export type SidebarGroupsCollapsed = Record<SidebarGroupId, boolean>;
/** Per-viewer preference: which groups the viewer closed. */
export const SIDEBAR_GROUPS_KEY = "admin:sidebar-groups";
export const ALL_GROUPS_OPEN: SidebarGroupsCollapsed = {
  content: false,
  life: false,
  operations: false,
};

/** The group that owns a path. Content review and preview routes are Content
 * pages even though they render in the operational layout. */
export function sidebarGroupForPath(pathname: string): SidebarGroupId {
  if (/^\/(?:content|newsletter)(?:\/|$)/.test(pathname)) return "content";
  if (/^\/data(?:\/|$)/.test(pathname)) return "life";
  return "operations";
}

/** The saved choice, with the active page's group always open. */
export function sidebarGroupsState(
  raw: string | null,
  active: SidebarGroupId,
): SidebarGroupsCollapsed {
  const state = { ...ALL_GROUPS_OPEN };
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === "object")
      for (const id of SIDEBAR_GROUP_IDS)
        state[id] = (saved as Record<string, unknown>)[id] === true;
  } catch {
    /* A malformed preference opens every group. */
  }
  state[active] = false;
  return state;
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
  // Groups the viewer closed, except the active page's group, which always
  // opens. CSS holds these closed until the sidebar hydrates, so a saved
  // choice never shifts the page. Keep in step with sidebarGroupsState.
  let closed = "";
  try {
    const raw = localStorage.getItem("admin:sidebar-groups");
    const saved = raw ? JSON.parse(raw) : null;
    const path = (window.location && window.location.pathname) || "/";
    const active = /^\/(?:content|newsletter)(?:\/|$)/.test(path)
      ? "content"
      : /^\/data(?:\/|$)/.test(path)
        ? "life"
        : "operations";
    if (saved && typeof saved === "object")
      for (const id of ["content", "life", "operations"])
        if (id !== active && saved[id] === true)
          closed = closed ? `${closed} ${id}` : id;
  } catch {
    closed = "";
  }
  if (closed) document.documentElement.dataset.adminNavClosed = closed;
  else delete document.documentElement.dataset.adminNavClosed;
}

export const adminSidebarPrepaintScript = `(${prepaintAdminSidebar.toString()})();`;
