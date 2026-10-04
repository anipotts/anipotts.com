import {
  workspaces,
  workspaceReturnPath,
  type Workspace,
} from "../../lib/workspace-navigation";
import React, {
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  libraryGroupForPath,
  libraryReturnPath,
  libraryStateUrl,
  readLibraryState,
} from "../../lib/content-library-state";
import type { ThemePreference } from "@anipotts/brand/theme";
import { HStack } from "@astryxdesign/core/HStack";
import "./WorkspaceHeader.css";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { AppShell } from "@astryxdesign/core/AppShell";
import { NavigationIconScope } from "./adminThemeIcons";
import { MobileNav } from "@astryxdesign/core/MobileNav";
import {
  SideNav,
  SideNavItem,
  SideNavCollapseButton,
} from "@astryxdesign/core/SideNav";
import {
  MagnifyingGlassIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  ArrowLeftIcon,
} from "@phosphor-icons/react";
import { AdminCommandPalette, type PaletteAction } from "./AdminCommandPalette";
import type { AdminSearchResult } from "../../data/admin-search";
import { provideSearchEntries } from "../../lib/admin-search-index";
import {
  COMPACT_QUERY,
  RAIL_QUERY,
  savedSidebarCollapsed,
  sidebarRail,
} from "../../lib/admin-sidebar";
import { THEME_CYCLE, nextTheme } from "../../lib/admin-theme";
import { navigateAdmin } from "../../lib/editorial-navigation";
import { UnifiedNavigation, selectedSidebarItem } from "./UnifiedSidebar";
import { AdminWordmark } from "./AdminWordmark";
import { BrandTile } from "../BrandTile";
import {
  AdminThemeControls,
  ThemeControl,
  THEME_NAMES,
  THEME_ICONS,
} from "./ThemeControl";

export function workspaceSelection(
  area: "content" | "newsletter",
  group?: string,
  kind?: string,
): string {
  if (area === "newsletter") return "newsletter";
  if (kind === "writing") return "writing";
  if (kind === "work") return "work";
  if (kind) return "website";
  // The mixed overview and the systems subset have no route of their own.
  return !group || group === "pages" || group === "systems" ? "website" : group;
}

const WORKSPACE_IDS = Object.keys(workspaces) as Workspace[];
const DEFAULT_PAGES = Object.fromEntries(
  WORKSPACE_IDS.map((id) => [id, workspaces[id].href]),
) as Record<Workspace, string>;

/** Remembers the last page of each workspace for this tab, so a workspace
 * tab or heading returns to it, and the Content library last used, so the
 * Content pages keep their filters and ordering when reached from another
 * workspace. Only navigation preferences are kept (see workspaceReturnPath). */
export function useWorkspaceMemory(workspace: Workspace | null) {
  const [memory, setMemory] = useState({
    pages: DEFAULT_PAGES,
    contentLibrary: "",
  });
  useEffect(() => {
    const sync = () => {
      try {
        if (workspace) {
          const here = workspaceReturnPath(
            workspace,
            location.pathname + location.search,
          );
          // A page outside the workspace's own routes (Content review renders
          // in the Observability layout) leaves the remembered page alone.
          if (
            here !== workspaces[workspace].href ||
            location.pathname === workspaces[workspace].href
          )
            sessionStorage.setItem(`admin:navigation:${workspace}`, here);
        }
        const pages = Object.fromEntries(
          WORKSPACE_IDS.map((id) => [
            id,
            workspaceReturnPath(
              id,
              sessionStorage.getItem(`admin:navigation:${id}`) ?? "",
            ),
          ]),
        ) as Record<Workspace, string>;
        const content = new URL(pages.content, location.origin);
        setMemory({
          pages,
          contentLibrary: libraryGroupForPath(content.pathname)
            ? pages.content
            : "",
        });
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
  return memory;
}

const openSearch = () =>
  document.dispatchEvent(new CustomEvent("admin:search"));

/** Local owner builds only: the laptop tile beside the sidebar wordmark,
 * or immediately after Overview in the collapsed rail.
 * The flag is a build-time literal, so deployable builds drop the marker
 * below as dead code; scripts/ci/admin-local-owner-leak.mjs checks the
 * bundle. */
function LocalOwnerTile() {
  if (!__LOCAL_OWNER_BUILD__) return null;
  return (
    <span className="admin-local-owner" data-admin-local-owner="true">
      <BrandTile id="ap-pro" size={24} label="Local owner" />
    </span>
  );
}

/** Shared phone chrome stays outside the writing SDK boundary on every route. */
function PhoneBar({
  workspace,
  mode,
  changeTheme,
  openNavigation,
  navigationOpen,
  navigationId,
}: {
  workspace: Workspace | null;
  mode: ThemePreference;
  changeTheme: (mode: ThemePreference) => void;
  openNavigation: () => void;
  navigationOpen: boolean;
  navigationId: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0)
        document.documentElement.style.setProperty(
          "--admin-phone-appbar-height",
          `${height}px`,
        );
      else
        document.documentElement.style.removeProperty(
          "--admin-phone-appbar-height",
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--admin-phone-appbar-height",
      );
    };
  }, []);
  const ThemeIcon = THEME_ICONS[mode];
  return (
    <div ref={bar} className="admin-phone-bar">
      <Button
        label="Open navigation"
        tooltip="Open navigation"
        isIconOnly
        variant="ghost"
        size="md"
        aria-expanded={navigationOpen}
        aria-controls={navigationId}
        icon={<SidebarSimpleIcon size={20} aria-hidden="true" />}
        onClick={openNavigation}
      />
      <span className="admin-phone-identity">
        {workspace ? workspaces[workspace].label : "Overview"}
      </span>
      <Button
        label="Search"
        tooltip="Search"
        isIconOnly
        variant="ghost"
        size="md"
        icon={<MagnifyingGlassIcon size={20} aria-hidden="true" />}
        onClick={openSearch}
      />
      <Button
        className="admin-theme-cycle"
        label={`${THEME_NAMES[mode]} theme`}
        tooltip={`${THEME_NAMES[mode]} theme`}
        isIconOnly
        variant="ghost"
        size="md"
        icon={<ThemeIcon size={20} aria-hidden="true" />}
        onClick={() => changeTheme(nextTheme(mode))}
      />
    </div>
  );
}

/** The sidebar header, in the desktop sidebar and the collapsed rail. */
function WorkspaceIdentity({
  rail,
  localOwner,
}: {
  rail: boolean;
  localOwner: boolean;
}) {
  return (
    <VStack
      className="editorial-workspace-identity approved-workspace-header"
      gap={2}
      data-collapsed={rail}
    >
      <HStack
        className="editorial-identity-primary-row"
        gap={0}
        hAlign="between"
        vAlign="center"
      >
        <Tooltip content={rail ? "Expand sidebar" : "Collapse sidebar"}>
          <SideNavCollapseButton size="md">
            <SidebarSimpleIcon size={18} aria-hidden="true" />
          </SideNavCollapseButton>
        </Tooltip>
        {!rail && <AdminWordmark href="/" label="Overview" />}
        {/* The end slot balances the collapse button, so the wordmark keeps
            the middle of the row. */}
        {!rail && (
          <span className="editorial-identity-end">
            {__LOCAL_OWNER_BUILD__ && localOwner && <LocalOwnerTile />}
          </span>
        )}
      </HStack>
      <Button
        className="editorial-header-search"
        label="Search"
        aria-label="Search"
        tooltip={rail ? "Search (⌘K / Ctrl+K)" : undefined}
        isIconOnly={rail}
        variant="ghost"
        size="md"
        icon={<MagnifyingGlassIcon size={18} aria-hidden="true" />}
        onClick={openSearch}
      />
    </VStack>
  );
}

/** Sidebar footer: log out outside local previews, then the one theme
 * button, which cycles light, dark and system. */
function WorkspaceUtilities({
  rail,
  localPreview,
}: {
  rail: boolean;
  localPreview: boolean;
}) {
  const Stack = rail ? VStack : HStack;
  return (
    <Stack
      className="editorial-workspace-utilities editorial-workspace-utility-controls"
      data-collapsed={rail}
      gap={1}
    >
      <SideNavItem
        label="www"
        href="https://anipotts.com/"
        icon={<ArrowLeftIcon size={18} aria-hidden="true" />}
      />
      {!localPreview && (
        <SideNavItem
          label="Log out"
          href="/auth/logout"
          icon={<SignOutIcon size={18} aria-hidden="true" />}
        />
      )}
      <ThemeControl />
    </Stack>
  );
}

/** One controlled modal provides phone navigation and tablet sidebar expansion. */
const NO_DRAWER = <></>;

export function EditorialWorkspaceShell({
  children,
  area,
  selectedGroup,
  recordKind,
  mode,
  changeTheme,
  localPreview,
  localOwner = false,
  searchEntries,
  groupCounts,
  workspace = "content",
  currentRoute,
  recordPage = false,
}: {
  children: ReactNode;
  area: "content" | "newsletter";
  selectedGroup?: string;
  /** Record count per navigation id, shown at the end of the nav item. */
  groupCounts?: Readonly<Record<string, number>>;
  recordKind?: string;
  mode: ThemePreference;
  changeTheme: (mode: ThemePreference) => void;
  localPreview: boolean;
  /** Request resolved to the synthetic owner of a local owner build. */
  localOwner?: boolean;
  /** Content this page read, for the palette to search. */
  searchEntries?: AdminSearchResult[];
  /** The group the current page belongs to; null on the overview. */
  workspace?: Workspace | null;
  /** Path and query of an Observability or Data page, which selects its item.
   * Content pages select from their own record and library state instead. */
  currentRoute?: string;
  /** Identifies record routes; the shared phone appbar remains visible. */
  recordPage?: boolean;
}) {
  const [rail, setRail] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [tabletNavigation, setTabletNavigation] = useState(false);
  const navigationId = useId();
  useEffect(() => {
    // A requested route can still be held by the editor's unsaved-change guard.
    // Close only after the route actually commits, or the viewport leaves the
    // temporary-navigation range. Native dialog owns focus restoration.
    const committed = () => setNavigationOpen(false);
    const resize = () => {
      setTabletNavigation(window.innerWidth > 640 && window.innerWidth < 1024);
      if (window.innerWidth >= 1024) committed();
    };
    resize();
    window.addEventListener("admin:workspace-navigation", committed);
    window.addEventListener("popstate", committed);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("admin:workspace-navigation", committed);
      window.removeEventListener("popstate", committed);
      window.removeEventListener("resize", resize);
    };
  }, []);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  // False until the client has chosen the rail. Until then the prepaint
  // script's choice on the root element holds the sidebar geometry.
  const [railReady, setRailReady] = useState(false);
  const memory = useWorkspaceMemory(workspace);
  const [pageLibrary, setPageLibrary] = useState("");
  useEffect(() => {
    const sync = () => {
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      setPageLibrary(
        returnTo
          ? libraryReturnPath(returnTo)
          : window.location.pathname + window.location.search,
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
  const libraryUrl = new URL(
    (onContentPage ? pageLibrary : memory.contentLibrary) || "/content/pages",
    "https://admin.invalid",
  );
  const destination = (id: string) => {
    const currentGroup = libraryGroupForPath(libraryUrl.pathname);
    const current = readLibraryState(libraryUrl.search, currentGroup);
    // Sections and statuses describe one library's records. A different library
    // starts with its complete set, while keeping the useful query and ordering.
    return libraryStateUrl(
      id === "newsletter" ? "/content/newsletter" : "/content",
      libraryUrl.search,
      {
        ...current,
        ...(id !== currentGroup ? { status: "all", sections: undefined } : {}),
        group: id,
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
    if (window.innerWidth <= 1023) {
      setNavigationOpen(!collapsed);
      return;
    }
    setUserCollapsed(collapsed);
    setRail(collapsed);
    try {
      localStorage.setItem("admin:sidebar-collapsed", String(collapsed));
    } catch {}
  };
  // The root names the workspace for its accent (themes/workspace-accents.css).
  // The server wrote it for this path; a client route moves it.
  useEffect(() => {
    const root = document.documentElement;
    if (workspace) root.dataset.adminWorkspace = workspace;
    else delete root.dataset.adminWorkspace;
  }, [workspace]);
  useEffect(
    () =>
      searchEntries
        ? provideSearchEntries("content", searchEntries)
        : undefined,
    [searchEntries],
  );
  useEffect(() => {
    // A page drawn in place (overview to Data) starts at the top the way a
    // loaded page does: the document on phones, main's own panel beside the
    // sidebar. Back and forward keep the browser's own restoration.
    const top = () => {
      if (window.matchMedia(COMPACT_QUERY).matches) window.scrollTo(0, 0);
      else {
        const main = document.getElementById("astryx-app-shell-main");
        if (main) main.scrollTop = 0;
      }
    };
    window.addEventListener("admin:workspace-navigation", top);
    return () => window.removeEventListener("admin:workspace-navigation", top);
  }, []);
  const theme = useRef(changeTheme);
  theme.current = changeTheme;
  const actions = useMemo<PaletteAction[]>(
    () => [
      ...THEME_CYCLE.map((value) => ({
        id: `theme:${value}`,
        label: `${THEME_NAMES[value]} theme`,
        icon: THEME_ICONS[value],
        keywords: ["theme", "appearance"],
        run: () => theme.current(value),
      })),
      ...(localPreview
        ? []
        : [
            {
              id: "logout",
              label: "Log out",
              icon: SignOutIcon,
              keywords: ["sign out"],
              run: () => navigateAdmin("/auth/logout"),
            },
          ]),
    ],
    [localPreview],
  );
  const selected =
    currentRoute === undefined
      ? workspaceSelection(area, selectedGroup, recordKind)
      : selectedSidebarItem(currentRoute);
  const showLocalOwner = __LOCAL_OWNER_BUILD__ && localOwner;
  return (
    <AdminThemeControls.Provider value={{ mode, changeTheme }}>
      <AdminCommandPalette actions={actions} />
      <AppShell
        className="editorial-workspace-shell"
        data-sidebar-collapsed={rail}
        data-sidebar-ready={railReady}
        data-workspace={workspace ?? undefined}
        data-record-page={recordPage || undefined}
        height="fill"
        variant={rail ? "section" : "wash"}
        contentPadding={0}
        // Keep AppShell's responsive inline rail; our shared controlled drawer
        // also serves temporary tablet expansion without resizing the content.
        mobileNav={{ breakpoint: "sm", hasToggle: false, content: NO_DRAWER }}
        banner={
          <PhoneBar
            workspace={workspace}
            mode={mode}
            changeTheme={changeTheme}
            openNavigation={() => setNavigationOpen(true)}
            navigationOpen={navigationOpen}
            navigationId={navigationId}
          />
        }
        sideNav={
          <SideNav
            className="editorial-workspace-nav"
            aria-label="Admin"
            collapsible={{
              isCollapsed: rail,
              onCollapsedChange: changeCollapsed,
              hasButton: false,
            }}
            header={
              <WorkspaceIdentity rail={rail} localOwner={showLocalOwner} />
            }
            footer={
              <WorkspaceUtilities rail={rail} localPreview={localPreview} />
            }
          >
            <UnifiedNavigation
              rail={rail}
              activeGroup={workspace}
              selected={selected}
              contentHref={destination}
              groupCounts={groupCounts}
              afterOverview={
                rail && showLocalOwner ? <LocalOwnerTile /> : undefined
              }
            />
          </SideNav>
        }
      >
        <NavigationIconScope value>
          <MobileNav
            id={navigationId}
            className={`admin-navigation-drawer${tabletNavigation ? " admin-tablet-sidebar" : ""}`}
            label="Admin navigation"
            header="Navigation"
            side="start"
            width={320}
            isOpen={navigationOpen}
            onOpenChange={setNavigationOpen}
          >
            <SideNav
              className="editorial-workspace-nav admin-drawer-nav"
              aria-label="Admin"
              collapsible={
                tabletNavigation
                  ? {
                      isCollapsed: false,
                      onCollapsedChange: () => setNavigationOpen(false),
                      hasButton: false,
                    }
                  : undefined
              }
              header={
                tabletNavigation ? (
                  <WorkspaceIdentity rail={false} localOwner={showLocalOwner} />
                ) : undefined
              }
              footer={
                tabletNavigation ? (
                  <WorkspaceUtilities
                    rail={false}
                    localPreview={localPreview}
                  />
                ) : undefined
              }
            >
              <UnifiedNavigation
                rail={false}
                activeGroup={workspace}
                selected={selected}
                contentHref={destination}
                groupCounts={groupCounts}
              />
              {!tabletNavigation && (
                <WorkspaceUtilities rail={false} localPreview={localPreview} />
              )}
            </SideNav>
          </MobileNav>
        </NavigationIconScope>
        {children}
      </AppShell>
    </AdminThemeControls.Provider>
  );
}
