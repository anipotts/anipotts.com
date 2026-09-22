import { BREAKPOINT_MIN } from "./breakpoints";

/** Saved sidebar choice. The first key is current; the second is read once for
 * people who collapsed the sidebar before the key moved. */
export const SIDEBAR_STORAGE_KEYS = [
  "admin:sidebar-collapsed",
  "editorial:sidebar-collapsed",
] as const;

/** The sidebar contract, on lib/breakpoints.ts. Compact phones (640px and
 * below) have no sidebar: the top bar and tab row replace it. Medium widths
 * (641px to 1023px) always open on the rail, because the full sidebar would
 * leave a table too little room; the rail button still opens it for the
 * moment. From large (1024px) a saved choice wins, and without one the
 * sidebar is a rail until 1280px, where the full sidebar has room. */
export const COMPACT_MAX_WIDTH = BREAKPOINT_MIN.medium - 1;
export const RAIL_ONLY_MAX_WIDTH = BREAKPOINT_MIN.large - 1;
export const FULL_SIDEBAR_MIN_WIDTH = 1280;
export const RAIL_QUERY = `(min-width: ${BREAKPOINT_MIN.medium}px) and (max-width: ${FULL_SIDEBAR_MIN_WIDTH - 1}px)`;
export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

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
  if (width <= COMPACT_MAX_WIDTH) return false;
  if (width <= RAIL_ONLY_MAX_WIDTH) return true;
  return collapsed ?? inRailRange;
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

/** The workspace that owns a path, or null for the overview and anything
 * outside the three workspaces, which stay workspace-neutral: no group is
 * forced open and the accent is the editorial theme's own. */
export function workspaceForPath(pathname: string): SidebarGroupId | null {
  if (/^\/(?:content|newsletter)(?:\/|$)/.test(pathname)) return "content";
  if (/^\/data(?:\/|$)/.test(pathname)) return "life";
  if (/^\/observability(?:\/|$)/.test(pathname)) return "operations";
  return null;
}

/** The saved choice, with the active page's group always open. */
export function sidebarGroupsState(
  raw: string | null,
  active: SidebarGroupId | null,
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
  if (active) state[active] = false;
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
  // Keep in step with sidebarRail.
  const width = window.innerWidth;
  const rail =
    width <= 640
      ? false
      : width <= 1023
        ? true
        : (collapsed ??
          window.matchMedia("(min-width: 641px) and (max-width: 1279px)")
            .matches);
  document.documentElement.dataset.adminSidebar = rail ? "rail" : "full";
  // Groups the viewer closed, except the active page's group, which always
  // opens. CSS holds these closed until the sidebar hydrates, so a saved
  // choice never shifts the page. Keep in step with sidebarGroupsState and
  // workspaceForPath.
  let closed = "";
  try {
    const raw = localStorage.getItem("admin:sidebar-groups");
    const saved = raw ? JSON.parse(raw) : null;
    const path = (window.location && window.location.pathname) || "/";
    const active = /^\/(?:content|newsletter)(?:\/|$)/.test(path)
      ? "content"
      : /^\/data(?:\/|$)/.test(path)
        ? "life"
        : /^\/observability(?:\/|$)/.test(path)
          ? "operations"
          : "";
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
