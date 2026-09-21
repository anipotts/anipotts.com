import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  SideNavItem,
  SideNavSection,
  useSideNavRenderMode,
} from "@astryxdesign/core/SideNav";
import { Button } from "@astryxdesign/core/Button";
import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Text } from "@astryxdesign/core/Text";
import {
  BellSimpleIcon,
  BriefcaseIcon,
  BrowserIcon,
  ClockCounterClockwiseIcon,
  EnvelopeSimpleIcon,
  PencilSimpleIcon,
  PulseIcon,
  RowsIcon,
  SquaresFourIcon,
  TreeStructureIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  SIDEBAR_GROUPS_KEY,
  ALL_GROUPS_OPEN,
  sidebarGroupsState,
  type SidebarGroupId,
  type SidebarGroupsCollapsed,
} from "../../lib/admin-sidebar";
import type { AdminSearchResult } from "../../data/admin-search";

type Destination = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: Icon;
};

/** The one overview, above the groups. */
export const overviewDestination: Destination = {
  id: "overview",
  label: "Overview",
  href: "/",
  icon: SquaresFourIcon,
};

/**
 * Every sidebar group and page, in the order shown: Content, then Data, then
 * Observability. This list is the one place to change the sidebar, the
 * command palette's page list and the selection rules below. Content ids are
 * library group names, so the library can keep its filters per destination.
 */
export const sidebarGroups: ReadonlyArray<{
  id: SidebarGroupId;
  label: string;
  items: readonly Destination[];
}> = [
  {
    id: "content",
    label: "Content",
    items: [
      {
        id: "website",
        label: "Pages",
        href: "/content/pages",
        icon: BrowserIcon,
      },
      {
        id: "writing",
        label: "Writing",
        href: "/content/writing",
        icon: PencilSimpleIcon,
      },
      {
        id: "work",
        label: "Projects",
        href: "/content/projects",
        icon: BriefcaseIcon,
      },
      {
        id: "newsletter",
        label: "Newsletter",
        href: "/content/newsletter",
        icon: EnvelopeSimpleIcon,
      },
    ],
  },
  {
    id: "life",
    label: "Data",
    items: [
      {
        id: "records",
        label: "Records",
        href: "/data/records",
        icon: RowsIcon,
      },
      {
        id: "sources",
        label: "Sources",
        href: "/data/sources",
        icon: TreeStructureIcon,
      },
    ],
  },
  {
    id: "operations",
    label: "Observability",
    items: [
      {
        id: "status",
        label: "Status",
        href: "/observability/status",
        icon: PulseIcon,
      },
      {
        id: "activity",
        label: "Activity",
        href: "/observability/activity",
        icon: ClockCounterClockwiseIcon,
      },
      {
        id: "alerts",
        label: "Alerts",
        href: "/observability/alerts",
        icon: BellSimpleIcon,
      },
    ],
  },
];

export const websiteNavigation = sidebarGroups[0]!.items;

/** Every sidebar destination, for every workspace's command palette, so
 * search reaches the whole app from any page. */
export const sidebarSearchEntries: AdminSearchResult[] = [
  { ...overviewDestination, group: "Admin" },
  ...sidebarGroups.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.label })),
  ),
].map(({ label, href, group }) => ({
  id: `nav:${href}`,
  label,
  href,
  domain: "navigation" as const,
  kind: "destination",
  currentFact: group,
  source: "admin",
  freshness: "current",
  keywords: [label, group],
}));

/** Which overview, Data or Observability item a route selects. A Data record
 * detail selects Records. Content selection comes from the editorial page's
 * own record and library state. */
export function selectedSidebarItem(route: string): string | undefined {
  const path = route.split("?")[0] ?? "";
  if (path === "/") return overviewDestination.id;
  for (const group of sidebarGroups.slice(1))
    for (const item of group.items)
      if (path === item.href || path.startsWith(`${item.href}/`))
        return item.id;
  return undefined;
}

const FOCUS_KEY = "admin:sidebar-focus";
const TARGETS = "[data-sidebar-focus]";

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TARGETS)].filter(
    (element) => !element.closest("[inert], [aria-hidden='true'], [hidden]"),
  );
}

/** Open or closed per group, saved per viewer. The server and the first
 * client render show every group open; the prepaint script has already held
 * the saved closed groups closed with CSS, so applying the saved state after
 * hydration changes nothing on screen. */
function useSidebarGroups(active: SidebarGroupId) {
  const [collapsed, setCollapsed] =
    useState<SidebarGroupsCollapsed>(ALL_GROUPS_OPEN);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SIDEBAR_GROUPS_KEY);
    } catch {
      /* The preference is a convenience; every group opens without it. */
    }
    setCollapsed(sidebarGroupsState(raw, active));
    setReady(true);
  }, [active]);
  useEffect(() => {
    // React now owns the closed groups, so the prepaint hold can go and
    // toggling animates normally.
    if (ready) delete document.documentElement.dataset.adminNavClosed;
  }, [ready]);
  const toggle = useCallback((id: SidebarGroupId, isCollapsed: boolean) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: isCollapsed };
      try {
        localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* Unsaved preferences still apply to this page. */
      }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

/**
 * The one admin sidebar: Content, Data and Observability as collapsible
 * groups. In the desktop rail the groups are unlabeled runs of icons, since a
 * rail has no room for a heading and a flyout would cost a click per page.
 *
 * Keyboard: Up and Down move through the headings and pages, Home and End
 * jump to either end, Right opens a group or enters it, Left leaves a page for
 * its heading or closes the group. Enter and Space toggle a heading (it is a
 * button). A page opened from the keyboard gets focus back on the new page.
 */
export function UnifiedNavigation({
  rail,
  activeGroup,
  selected,
  contentHref,
  groupCounts,
}: {
  rail: boolean;
  activeGroup: SidebarGroupId;
  /** The selected item id within the active group. */
  selected?: string;
  contentHref?: (id: string) => string;
  groupCounts?: Readonly<Record<string, number>>;
}) {
  const { collapsed, toggle } = useSidebarGroups(activeGroup);
  const root = useRef<HTMLDivElement>(null);
  const renderMode = useSideNavRenderMode();
  const inDrawer = renderMode === "drawer" || renderMode === "drawer-content";
  const { isMobileNavOpen } = useAppShellMobile();

  // Opening the drawer shows the current page, not the top of the list.
  useEffect(() => {
    if (!inDrawer || !isMobileNavOpen) return;
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [inDrawer, isMobileNavOpen]);

  const jumpTo = (id: SidebarGroupId) => {
    if (collapsed[id]) toggle(id, false);
    root.current
      ?.querySelector(`[data-sidebar-group="${id}"]`)
      ?.scrollIntoView({ block: "start" });
  };

  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(FOCUS_KEY);
      sessionStorage.removeItem(FOCUS_KEY);
    } catch {
      return;
    }
    if (!id || !root.current) return;
    const target = focusable(root.current).find(
      (element) => element.dataset.sidebarId === id,
    );
    target?.focus({ preventScroll: true });
  }, []);

  const rememberKeyboardNavigation = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLElement>(
      "a[data-sidebar-id]",
    );
    // A keyboard activation reaches the link as a click with no pointer
    // presses. Pointer navigation leaves focus where the browser puts it.
    if (!link || event.detail !== 0) return;
    try {
      sessionStorage.setItem(FOCUS_KEY, link.dataset.sidebarId!);
    } catch {
      /* Focus restoration is a convenience. */
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const container = root.current;
    const current = event.target as HTMLElement;
    if (!container || !current.matches(TARGETS)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const targets = focusable(container);
    const index = targets.indexOf(current);
    const group = (current.dataset.sidebarGroup ??
      current.dataset.sidebarMember) as SidebarGroupId | undefined;
    const isHeading = current.dataset.sidebarFocus === "group";
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = targets[Math.min(index + 1, targets.length - 1)];
        break;
      case "ArrowUp":
        next = targets[Math.max(index - 1, 0)];
        break;
      case "Home":
        next = targets[0];
        break;
      case "End":
        next = targets.at(-1);
        break;
      case "ArrowRight":
        if (!isHeading || !group) return;
        if (collapsed[group]) toggle(group, false);
        else next = targets[index + 1];
        break;
      case "ArrowLeft":
        if (!group) return;
        if (isHeading) {
          if (!collapsed[group]) toggle(group, true);
        } else
          next = targets.find(
            (element) => element.dataset.sidebarGroup === group,
          );
        break;
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  return (
    <div
      ref={root}
      className="admin-unified-nav"
      data-rail={rail}
      onKeyDown={onKeyDown}
      onClickCapture={rememberKeyboardNavigation}
    >
      {/* Phones and tablets: one tap reaches any workspace from anywhere in
          the drawer. The row stays pinned while the list scrolls. */}
      {inDrawer && (
        <div
          className="admin-unified-nav-jump"
          role="group"
          aria-label="Workspaces"
        >
          {sidebarGroups.map((group) => (
            <Button
              key={group.id}
              label={group.label}
              aria-label={`Go to ${group.label}`}
              variant="ghost"
              size="sm"
              data-sidebar-jump={group.id}
              onClick={() => jumpTo(group.id)}
            />
          ))}
        </div>
      )}
      <SideNavItem
        label={overviewDestination.label}
        href={overviewDestination.href}
        isSelected={selected === overviewDestination.id}
        icon={<SquaresFourIcon size={18} aria-hidden="true" />}
        className="admin-unified-nav-root"
        data-sidebar-focus="item"
        data-sidebar-id={overviewDestination.id}
      />
      {sidebarGroups.map((group) => {
        const items = group.items.map(({ id, label, href, icon: ItemIcon }) => {
          const count = group.id === "content" ? groupCounts?.[id] : undefined;
          return (
            <SideNavItem
              key={id}
              label={label}
              href={
                group.id === "content" && contentHref ? contentHref(id) : href
              }
              isSelected={group.id === activeGroup && selected === id}
              icon={<ItemIcon size={18} aria-hidden="true" />}
              data-sidebar-focus="item"
              data-sidebar-member={group.id}
              data-sidebar-id={`${group.id}:${id}`}
              endContent={
                count === undefined ? undefined : (
                  <Text
                    type="supporting"
                    color="secondary"
                    className="editorial-nav-count"
                    aria-label={`${count} ${count === 1 ? "record" : "records"}`}
                  >
                    {count}
                  </Text>
                )
              }
            />
          );
        });
        return rail ? (
          <SideNavSection
            key={group.id}
            title={group.label}
            isHeaderHidden
            data-sidebar-section={group.id}
          >
            {items}
          </SideNavSection>
        ) : (
          <SideNavItem
            key={group.id}
            label={group.label}
            data-sidebar-focus="group"
            data-sidebar-group={group.id}
            collapsible={{
              isCollapsed: collapsed[group.id],
              onCollapsedChange: (isCollapsed) => toggle(group.id, isCollapsed),
            }}
          >
            {items}
          </SideNavItem>
        );
      })}
    </div>
  );
}
