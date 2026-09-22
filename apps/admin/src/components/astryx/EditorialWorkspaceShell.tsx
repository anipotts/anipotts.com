import {
  workspaces,
  workspaceReturnPath,
  type Workspace,
} from "../../lib/workspace-navigation";
import React, {
  useEffect,
  useMemo,
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
import { AppShell } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavItem,
  SideNavCollapseButton,
} from "@astryxdesign/core/SideNav";
import {
  CircleHalfIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  SunIcon,
  type Icon,
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
import { onClientLinkClick } from "../../lib/client-routes";
import { navigateAdmin } from "../../lib/editorial-navigation";
import {
  UnifiedNavigation,
  overviewDestination,
  selectedSidebarItem,
  sidebarGroups,
} from "./UnifiedSidebar";
import { AdminWordmark } from "./AdminWordmark";
import { BrandTile } from "../BrandTile";

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
          // in the operational layout) leaves the remembered page alone.
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

/** Whether the page's own heading has scrolled under the phone top bar, so
 * the bar shows the page title only once the page stops showing it. */
function useHeadingScrolledAway(route: string) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return;
    let observer: IntersectionObserver | null = null;
    let frame = 0;
    const watch = () => {
      observer?.disconnect();
      const heading = document.querySelector("#astryx-app-shell-main h1");
      if (!heading) return setAway(true);
      observer = new IntersectionObserver(
        ([entry]) =>
          setAway(
            !!entry &&
              !entry.isIntersecting &&
              entry.boundingClientRect.top < 0,
          ),
        { rootMargin: "-64px 0px 0px 0px" },
      );
      observer.observe(heading);
    };
    // A client route commits its page after the navigation event.
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(watch);
      });
    };
    watch();
    window.addEventListener("admin:workspace-navigation", later);
    window.addEventListener("popstate", later);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("admin:workspace-navigation", later);
      window.removeEventListener("popstate", later);
    };
  }, [route]);
  return away;
}

const openSearch = () =>
  document.dispatchEvent(new CustomEvent("admin:search"));

/** Local owner builds only: the laptop tile beside the wordmark. */
function LocalOwnerTile() {
  return (
    <span className="admin-local-owner" data-admin-local-owner="true">
      <BrandTile id="ap-pro" size={24} label="Local owner" />
    </span>
  );
}

/** The phone top bar, in AppShell's banner slot. The server writes it on
 * every page and CSS shows it at compact widths only, so it is on screen
 * from the first paint. It sticks to the top of the document scroll and
 * reaches under the status bar on the canvas colour. */
function PhoneBar({
  title,
  showTitle,
  localOwner,
}: {
  title: string;
  showTitle: boolean;
  localOwner: boolean;
}) {
  return (
    <div className="admin-phone-bar" onClickCapture={onClientLinkClick}>
      <HStack gap={2} vAlign="center" className="admin-phone-bar-identity">
        <AdminWordmark href="/" label="Overview" />
        {localOwner && <LocalOwnerTile />}
      </HStack>
      <span
        className="admin-phone-bar-title"
        data-visible={showTitle}
        aria-hidden="true"
      >
        {title}
      </span>
      <Button
        className="admin-phone-bar-search"
        label="Search"
        isIconOnly
        variant="ghost"
        size="md"
        icon={<MagnifyingGlassIcon size={20} aria-hidden="true" />}
        onClick={openSearch}
      />
    </div>
  );
}

/** The phone tab row: the three workspaces, then the current workspace's
 * pages as chips. It scrolls with the page, under the top bar. */
function PhoneTabs({
  workspace,
  selected,
  workspaceHref,
  pageHref,
}: {
  workspace: Workspace | null;
  selected?: string;
  workspaceHref: (id: Workspace) => string;
  pageHref: (group: Workspace, id: string, href: string) => string;
}) {
  const pages = useRef<HTMLDivElement>(null);
  const current = sidebarGroups.find((group) => group.id === workspace);
  useEffect(() => {
    // The current chip starts in view without moving the page.
    const row = pages.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && chip && chip.offsetLeft + chip.offsetWidth > row.clientWidth)
      row.scrollLeft = chip.offsetLeft - row.clientWidth / 3;
  }, [workspace, selected]);
  return (
    <nav
      className="admin-phone-tabs"
      aria-label="Workspaces"
      onClickCapture={onClientLinkClick}
    >
      <div className="admin-phone-tab-row">
        {sidebarGroups.map((group) => (
          <a
            key={group.id}
            className="admin-phone-workspace"
            href={workspaceHref(group.id)}
            aria-current={group.id === workspace ? "true" : undefined}
          >
            {group.label}
          </a>
        ))}
      </div>
      {current && (
        <div className="admin-phone-tab-row" ref={pages}>
          {current.items.map((item) => (
            <a
              key={item.id}
              className="admin-phone-page"
              href={pageHref(current.id, item.id, item.href)}
              aria-current={item.id === selected ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </nav>
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
        <SideNavCollapseButton size="md">
          <SidebarSimpleIcon size={18} aria-hidden="true" />
        </SideNavCollapseButton>
        {!rail && <AdminWordmark href="/" label="Overview" />}
        {/* The end slot balances the collapse button, so the wordmark keeps
            the middle of the row. */}
        {!rail && (
          <span className="editorial-identity-end">
            {localOwner && <LocalOwnerTile />}
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
      {rail && localOwner && <LocalOwnerTile />}
    </VStack>
  );
}

const THEME_NAMES: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
const THEME_ICONS: Record<ThemePreference, Icon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: CircleHalfIcon,
};

/** Sidebar footer: log out outside local previews, then the one theme
 * button, which cycles light, dark and system. */
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
  const ThemeIcon = THEME_ICONS[mode];
  const Stack = rail ? VStack : HStack;
  return (
    <Stack
      className="editorial-workspace-utilities"
      data-collapsed={rail}
      gap={1}
    >
      {!localPreview && (
        <SideNavItem
          label="Log out"
          href="/auth/logout"
          icon={<SignOutIcon size={18} aria-hidden="true" />}
        />
      )}
      <Button
        className="admin-theme-cycle"
        label={`${THEME_NAMES[mode]} theme`}
        tooltip={`${THEME_NAMES[mode]} theme`}
        isIconOnly
        variant="ghost"
        size="md"
        icon={<ThemeIcon size={18} aria-hidden="true" />}
        onClick={() => changeTheme(nextTheme(mode))}
      />
    </Stack>
  );
}

/** AppShell draws its own drawer below the breakpoint unless it is given
 * content; admin has no drawer, so it gets none. */
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
  title,
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
  /** Unused since the sidebar lost its Visit site link. */
  siteHref?: string;
  localPreview: boolean;
  /** Request resolved to the synthetic owner of a local owner build. */
  localOwner?: boolean;
  /** Content this page read, for the palette to search. */
  searchEntries?: AdminSearchResult[];
  /** The group the current page belongs to; null on the overview. */
  workspace?: Workspace | null;
  /** Path and query of an operational or Data page, which selects its item.
   * Content pages select from their own record and library state instead. */
  currentRoute?: string;
  /** The phone top bar's title. Defaults to the selected page's name. */
  title?: string;
  /** A record page draws its own phone bar (the editor bar), so the top bar
   * and tab row step aside at compact widths. The page's bar can reuse the
   * `admin-phone-bar` class for the same sticky, safe-area placement. */
  recordPage?: boolean;
}) {
  const [rail, setRail] = useState(false);
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
    // On phones the document scrolls, so a page drawn in place (overview to
    // Data) starts at the top the way a loaded page does. Back and forward
    // keep the browser's own restoration.
    const top = () => {
      if (window.matchMedia(COMPACT_QUERY).matches) window.scrollTo(0, 0);
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
  const pageTitle =
    title ??
    (selected === overviewDestination.id
      ? overviewDestination.label
      : (sidebarGroups
          .flatMap((group) => group.items)
          .find((item) => item.id === selected)?.label ?? "Admin"));
  const headingAway = useHeadingScrolledAway(currentRoute ?? pageLibrary);
  const pageHref = (group: Workspace, id: string, href: string) =>
    group === "content" ? destination(id) : href;
  const workspaceHref = (id: Workspace) =>
    id === "content" && onContentPage
      ? destination(selected ?? "website")
      : memory.pages[id];
  const showLocalOwner = __LOCAL_OWNER_BUILD__ && localOwner;
  return (
    <>
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
        // Compact widths have no sidebar and no drawer; the phone top bar and
        // tab row take its place (see PhoneBar and PhoneTabs).
        mobileNav={{ breakpoint: "sm", hasToggle: false, content: NO_DRAWER }}
        banner={
          recordPage ? undefined : (
            <PhoneBar
              title={pageTitle}
              showTitle={headingAway}
              localOwner={showLocalOwner}
            />
          )
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
              selected={selected}
              contentHref={destination}
              groupCounts={groupCounts}
            />
          </SideNav>
        }
      >
        {!recordPage && (
          <PhoneTabs
            workspace={workspace}
            selected={selected}
            workspaceHref={workspaceHref}
            pageHref={pageHref}
          />
        )}
        {children}
      </AppShell>
    </>
  );
}
