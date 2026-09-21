import {
  workspaces,
  workspaceReturnPath,
  type Workspace,
} from "../../lib/workspace-navigation";
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  libraryReturnPath,
  libraryStateUrl,
  readLibraryState,
} from "../../lib/content-library-state";
import type { ThemePreference } from "@anipotts/brand/theme";
import { HStack } from "@astryxdesign/core/HStack";
import "./WorkspaceHeader.css";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { Token } from "@astryxdesign/core/Token";
import { AppShell, useAppShellMobile } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavItem,
  SideNavCollapseButton,
} from "@astryxdesign/core/SideNav";
import {
  SidebarSimpleIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  DesktopIcon,
  SunIcon,
  SignOutIcon,
  ArrowUpRightIcon,
  ListIcon,
  LaptopIcon,
} from "@phosphor-icons/react";
import { AdminCommandPalette } from "./AdminCommandPalette";
import type { AdminSearchResult } from "../../data/admin-search";
import {
  RAIL_QUERY,
  savedSidebarCollapsed,
  sidebarRail,
} from "../../lib/admin-sidebar";
import {
  UnifiedNavigation,
  selectedSidebarItem,
  sidebarSearchEntries,
  websiteNavigation,
} from "./UnifiedSidebar";

export { websiteNavigation };

const noOperationalNavigation: never[] = [];

export function workspaceSelection(
  area: "content" | "newsletter",
  group?: string,
  kind?: string,
): string {
  if (area === "newsletter") return "newsletter";
  if (kind === "writing") return "writing";
  if (kind === "work") return "work";
  if (kind) return "website";
  return group === "systems" ? "website" : (group ?? "pages");
}

/** Remembers the last page of each workspace for this tab, and returns the
 * Content library query last used, so the Content pages keep their filters and
 * ordering when reached from another workspace. Only navigation preferences
 * are kept (see workspaceReturnPath). */
export function useWorkspaceMemory(workspace: Workspace) {
  const [contentSearch, setContentSearch] = useState("");
  useEffect(() => {
    const sync = () => {
      try {
        const here = workspaceReturnPath(
          workspace,
          location.pathname + location.search,
        );
        // A page outside the workspace's own routes (Content review renders
        // in the operational layout) leaves the remembered page alone.
        if (
          here !== workspaces[workspace].href ||
          location.pathname === workspaces[workspace].href
        )
          sessionStorage.setItem(`admin:navigation:${workspace}`, here);
        const content = workspaceReturnPath(
          "content",
          sessionStorage.getItem("admin:navigation:content") ?? "",
        );
        const url = new URL(content, location.origin);
        setContentSearch(url.pathname === "/content" ? url.search : "");
      } catch {
        /* Navigation works without storage. */
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("admin:workspace-navigation", sync);
    window.addEventListener("editorial:library-state", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("admin:workspace-navigation", sync);
      window.removeEventListener("editorial:library-state", sync);
    };
  }, [workspace]);
  return contentSearch;
}

/** The phone and tablet header. It sits in AppShell's banner slot, which the
 * server writes on every document, and CSS shows it at the drawer breakpoint
 * (AppShell md, 768px and below). Nothing about it waits for hydration, so it
 * is on screen from the first paint of every page and never flickers between
 * workspaces or tabs. The menu button opens AppShell's own drawer, which holds
 * the same three groups as the desktop sidebar. */
export function WorkspaceTopBar() {
  const { isMobile, isMobileNavOpen, mobileNavId, openMobileNav } =
    useAppShellMobile();
  return (
    <HStack
      className="admin-mobile-header"
      gap={3}
      hAlign="between"
      vAlign="center"
    >
      <HStack gap={3} vAlign="center" className="admin-mobile-header-identity">
        <span className="admin-bracket-wordmark" aria-label="Admin">
          <span aria-hidden="true">[</span>admin
          <span aria-hidden="true">]</span>
        </span>
      </HStack>
      <Button
        className="admin-mobile-header-menu"
        label="Open navigation"
        isIconOnly
        variant="ghost"
        size="md"
        icon={<ListIcon size={20} aria-hidden="true" />}
        aria-expanded={isMobileNavOpen}
        // The drawer exists only once the shell has hydrated at this width.
        aria-controls={isMobile ? mobileNavId : undefined}
        onClick={openMobileNav}
      />
    </HStack>
  );
}

/** The sidebar header, in the desktop sidebar, the collapsed rail and the
 * phone and tablet drawer. */
export function WorkspaceIdentity({
  collapsed = false,
  siteHref = "https://anipotts.com",
}: {
  collapsed?: boolean;
  siteHref?: string;
}) {
  const { isMobile } = useAppShellMobile();
  const compact = collapsed && !isMobile;
  return (
    <VStack
      className="editorial-workspace-identity approved-workspace-header"
      gap={2}
      data-collapsed={compact}
    >
      <HStack
        className="editorial-identity-primary-row"
        gap={0}
        hAlign="between"
        vAlign="center"
      >
        {!isMobile && (
          <SideNavCollapseButton size="md">
            <SidebarSimpleIcon size={18} aria-hidden="true" />
          </SideNavCollapseButton>
        )}
        {!compact && (
          <span className="admin-bracket-wordmark" aria-label="Admin">
            <span aria-hidden="true">[</span>admin
            <span aria-hidden="true">]</span>
          </span>
        )}
        {!compact && !isMobile && (
          <Button
            className="editorial-header-site"
            label="Visit site"
            aria-label="Visit site"
            tooltip="Visit anipotts.com"
            isIconOnly
            variant="ghost"
            size="md"
            icon={<ArrowUpRightIcon size={18} aria-hidden="true" />}
            href={siteHref}
            target="_blank"
            rel="noopener noreferrer"
          />
        )}
      </HStack>
      {!isMobile && (
        <Button
          className="editorial-header-search"
          label="Search"
          aria-label="Search"
          tooltip={compact ? "Search (⌘K / Ctrl+K)" : undefined}
          isIconOnly={compact}
          variant="ghost"
          size="md"
          icon={<MagnifyingGlassIcon size={18} aria-hidden="true" />}
          onClick={() =>
            document.dispatchEvent(new CustomEvent("admin:search"))
          }
        />
      )}
    </VStack>
  );
}

const appearanceOptions: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: typeof SunIcon;
}> = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: DesktopIcon },
];

/** Sidebar footer: appearance, then log out outside local previews. */
function WorkspaceUtilities({
  rail,
  mode,
  changeTheme,
  localPreview,
}: {
  rail: boolean;
  mode: ThemePreference;
  changeTheme: (mode: ThemePreference) => void;
  localPreview: boolean;
}) {
  const { isMobile } = useAppShellMobile();
  const compact = rail && !isMobile;
  return (
    <VStack
      className="editorial-workspace-utilities"
      data-collapsed={compact}
      hAlign={compact ? "center" : "stretch"}
      gap={1}
    >
      <SegmentedControl
        className="admin-theme-tabs"
        label="Theme"
        value={mode}
        layout="fill"
        onChange={(value) => changeTheme(value as ThemePreference)}
      >
        {appearanceOptions.map(({ value, label, Icon }) => (
          <Tooltip key={value} content={`${label} theme`}>
            <SegmentedControlItem
              value={value}
              label={label}
              isLabelHidden
              icon={<Icon size={18} aria-hidden="true" />}
            />
          </Tooltip>
        ))}
      </SegmentedControl>
      {!localPreview && (
        <SideNavItem
          label="Log out"
          href="/auth/logout"
          icon={<SignOutIcon size={18} aria-hidden="true" />}
        />
      )}
    </VStack>
  );
}

export function EditorialWorkspaceShell({
  children,
  area,
  selectedGroup,
  recordKind,
  mode,
  changeTheme,
  siteHref,
  localPreview,
  localOwner = false,
  searchEntries,
  groupCounts,
  workspace = "content",
  currentRoute,
  palette,
}: {
  children: ReactNode;
  area: "content" | "newsletter";
  selectedGroup?: string;
  /** Record count per navigation id, shown at the end of the nav item. */
  groupCounts?: Readonly<Record<string, number>>;
  recordKind?: string;
  mode: ThemePreference;
  changeTheme: (mode: ThemePreference) => void;
  siteHref: string;
  localPreview: boolean;
  /** Request resolved to the synthetic owner of a local owner build. */
  localOwner?: boolean;
  searchEntries?: AdminSearchResult[];
  /** The group the current page belongs to. */
  workspace?: Workspace;
  /** Path and query of an operational or Data page, which selects its item.
   * Content pages select from their own record and library state instead. */
  currentRoute?: string;
  palette?: ReactNode;
}) {
  const [rail, setRail] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  // False until the client has chosen the rail. Until then the prepaint
  // script's choice on the root element holds the sidebar geometry.
  const [railReady, setRailReady] = useState(false);
  const rememberedContentSearch = useWorkspaceMemory(workspace);
  const [pageSearch, setPageSearch] = useState("");
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      setPageSearch(
        returnTo
          ? new URL(libraryReturnPath(returnTo), window.location.origin).search
          : window.location.search,
      );
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("editorial:library-state", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("editorial:library-state", sync);
    };
  }, []);
  // On a Content page the library state is the page's own. Elsewhere it is the
  // state Content was last left in, so returning keeps filters and ordering.
  const onContentPage = workspace === "content" && currentRoute === undefined;
  const librarySearch = onContentPage ? pageSearch : rememberedContentSearch;
  const destination = (id: string) => {
    const current = readLibraryState(librarySearch);
    const currentGroup =
      onContentPage && area === "newsletter" ? "newsletter" : current.group;
    // Sections and statuses describe one library's records. A different library
    // starts with its complete set, while keeping the useful query and ordering.
    return libraryStateUrl(
      id === "newsletter" ? "/newsletter" : "/content",
      librarySearch,
      {
        ...current,
        ...(id !== currentGroup ? { status: "all", sections: undefined } : {}),
        group: id === "newsletter" ? "pages" : id,
      },
    );
  };
  useEffect(() => {
    // The saved choice and the width decide the rail in one commit, the same
    // way the prepaint script decided it, so hydration never resizes it.
    let saved: boolean | null = null;
    try {
      saved = savedSidebarCollapsed(localStorage);
    } catch {}
    setUserCollapsed(saved);
    setRail(
      sidebarRail(
        window.innerWidth,
        saved,
        window.matchMedia(RAIL_QUERY).matches,
      ),
    );
    setRailReady(true);
  }, []);
  useEffect(() => {
    if (!railReady) return;
    const query = window.matchMedia(RAIL_QUERY);
    const update = () =>
      setRail(sidebarRail(window.innerWidth, userCollapsed, query.matches));
    query.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [railReady, userCollapsed]);
  const changeCollapsed = (collapsed: boolean) => {
    setUserCollapsed(collapsed);
    setRail(collapsed);
    try {
      localStorage.setItem("admin:sidebar-collapsed", String(collapsed));
    } catch {}
  };
  const selected =
    currentRoute === undefined
      ? workspaceSelection(area, selectedGroup, recordKind)
      : undefined;
  const paletteEntries = useMemo(
    () => [...sidebarSearchEntries, ...(searchEntries ?? [])],
    [searchEntries],
  );
  return (
    <>
      {palette ?? (
        <AdminCommandPalette
          entries={paletteEntries}
          navItems={noOperationalNavigation}
          scope="editorial"
          showTrigger={false}
        />
      )}
      <AppShell
        className="editorial-workspace-shell"
        data-sidebar-collapsed={rail}
        data-sidebar-ready={railReady}
        data-workspace={workspace}
        height="fill"
        variant={rail ? "section" : "wash"}
        contentPadding={0}
        // Admin owns the phone and tablet header (see WorkspaceTopBar), so
        // AppShell never swaps a bar in after hydration; its drawer stays.
        mobileNav={{ breakpoint: "md", hasToggle: false }}
        banner={<WorkspaceTopBar />}
        sideNav={
          <SideNav
            className="editorial-workspace-nav"
            aria-label="Admin"
            collapsible={{
              isCollapsed: rail,
              onCollapsedChange: changeCollapsed,
              hasButton: false,
            }}
            header={<WorkspaceIdentity collapsed={rail} siteHref={siteHref} />}
            footer={
              <WorkspaceUtilities
                rail={rail}
                mode={mode}
                changeTheme={changeTheme}
                localPreview={localPreview}
              />
            }
          >
            <UnifiedNavigation
              rail={rail}
              activeGroup={workspace}
              selected={
                selected ??
                (currentRoute ? selectedSidebarItem(currentRoute) : undefined)
              }
              contentHref={destination}
              groupCounts={groupCounts}
            />
          </SideNav>
        }
      >
        {children}
      </AppShell>
      {__LOCAL_OWNER_BUILD__ && localOwner && (
        <HStack
          className="admin-local-owner-indicator"
          data-admin-local-owner="true"
          role="status"
        >
          <Token
            label="Local owner"
            size="sm"
            color="orange"
            icon={<LaptopIcon size={14} aria-hidden="true" />}
          />
        </HStack>
      )}
    </>
  );
}
