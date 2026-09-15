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
import { Text } from "@astryxdesign/core/Text";
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import "./WorkspaceHeader.css";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import { Token } from "@astryxdesign/core/Token";
import { AppShell, useAppShellMobile } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
  SideNavCollapseButton,
} from "@astryxdesign/core/SideNav";
import { navigateAdmin } from "../../lib/editorial-navigation";
import {
  SidebarSimpleIcon,
  SquaresFourIcon,
  PencilSimpleIcon,
  BrowserIcon,
  BriefcaseIcon,
  EnvelopeSimpleIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  DesktopIcon,
  SunIcon,
  SignOutIcon,
  FileTextIcon,
  DesktopTowerIcon,
  IdentificationCardIcon,
  CaretDownIcon,
  CaretUpIcon,
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

export const websiteNavigation = [
  {
    id: "pages",
    label: "Overview",
    href: "/content",
    icon: SquaresFourIcon,
  },
  {
    id: "writing",
    label: "Writing",
    href: "/content?group=writing",
    icon: PencilSimpleIcon,
  },
  {
    id: "website",
    label: "Pages",
    href: "/content?group=website",
    icon: BrowserIcon,
  },
  {
    id: "work",
    label: "Projects",
    href: "/content?group=work",
    icon: BriefcaseIcon,
  },
  {
    id: "newsletter",
    label: "Newsletter",
    href: "/newsletter",
    icon: EnvelopeSimpleIcon,
  },
] as const;

const navigationResults: AdminSearchResult[] = websiteNavigation.map(
  ({ id, label, href }) => ({
    id: `website-nav:${id}`,
    label,
    href,
    domain: "navigation",
    kind: "destination",
    currentFact: "Website workspace",
    source: "admin",
    freshness: "current",
    keywords: [label],
  }),
);

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

const workspaceIcons = {
  content: FileTextIcon,
  operations: DesktopTowerIcon,
  life: IdentificationCardIcon,
};

/** Where each workspace menu item leads: the last page visited in that
 * workspace this session, or its home. */
function useWorkspaceDestinations(workspace: Workspace) {
  const [destinations, setDestinations] = useState<Record<Workspace, string>>({
    content: "/content",
    operations: "/operations/observability",
    life: "/life",
  });
  useEffect(() => {
    const sync = () => {
      try {
        sessionStorage.setItem(
          `admin:navigation:${workspace}`,
          workspaceReturnPath(workspace, location.pathname + location.search),
        );
        setDestinations(
          Object.fromEntries(
            Object.keys(workspaces).map((key) => [
              key,
              workspaceReturnPath(
                key as Workspace,
                sessionStorage.getItem(`admin:navigation:${key}`) ?? "",
              ),
            ]),
          ) as Record<Workspace, string>,
        );
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
  return destinations;
}

function WorkspaceMenu({
  workspace,
  compact,
}: {
  workspace: Workspace;
  compact: boolean;
}) {
  const destinations = useWorkspaceDestinations(workspace);
  const WorkspaceIcon = workspaceIcons[workspace];
  return (
    <SidebarMenu
      className="admin-workspace-selector"
      name="Workspace"
      label={workspaces[workspace].label}
      accessibleLabel={`Switch workspace: ${workspaces[workspace].label}`}
      icon={<WorkspaceIcon size={18} aria-hidden="true" />}
      compact={compact}
      opens="below"
      value={workspace}
      options={(Object.keys(workspaces) as Workspace[]).map((key) => ({
        value: key,
        label: workspaces[key].label,
      }))}
      onChange={(key) => {
        if (key !== workspace) navigateAdmin(destinations[key as Workspace]);
      }}
    />
  );
}

/** The phone and tablet header. It sits in AppShell's banner slot, which the
 * server writes on every document, and CSS shows it at the drawer breakpoint
 * (AppShell md, 768px and below). Nothing about it waits for hydration, so it
 * is on screen from the first paint of every page and never flickers between
 * workspaces or tabs. The menu button opens AppShell's own drawer. */
export function WorkspaceTopBar({ workspace }: { workspace: Workspace }) {
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
        <WorkspaceMenu workspace={workspace} compact={false} />
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
  workspace = "content",
  siteHref = "https://anipotts.com",
}: {
  collapsed?: boolean;
  workspace?: Workspace;
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
      <WorkspaceMenu workspace={workspace} compact={compact} />
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

type SidebarMenuOption = { value: string; label: string };

/** The sidebar's one control shape, used at the top for the workspace and at
 * the bottom for appearance: a full-width secondary trigger carrying the current
 * choice's icon, a label and the current choice, opening a single-choice menu
 * the width of the trigger. Menu rows are plain radio rows, like every other
 * admin dropdown. In the collapsed rail it is an icon button whose tooltip names
 * the choice. It reads the drawer state itself, so a rail collapsed on a wider
 * screen never shrinks the controls inside the phone and tablet drawer. */
function SidebarMenu({
  className,
  name,
  label,
  accessibleLabel,
  icon,
  detail,
  compact,
  opens,
  value,
  options,
  onChange,
}: {
  className: string;
  /** Group name read by assistive technology inside the menu. */
  name: string;
  label: string;
  accessibleLabel: string;
  icon: ReactNode;
  /** Secondary text between the label and the caret, such as the current choice. */
  detail?: string;
  compact: boolean;
  opens: "below" | "above";
  value: string;
  options: readonly SidebarMenuOption[];
  onChange: (value: string) => void;
}) {
  const Caret = opens === "above" ? CaretUpIcon : CaretDownIcon;
  return (
    <DropdownMenu
      button={{
        className: `admin-sidebar-menu ${className}`,
        label,
        "aria-label": accessibleLabel,
        tooltip: compact ? accessibleLabel : undefined,
        isIconOnly: compact,
        variant: "secondary",
        size: "md",
        icon,
        endContent: compact ? undefined : (
          <HStack gap={2} vAlign="center" className="admin-sidebar-menu-end">
            {detail && (
              <Text type="supporting" color="secondary">
                {detail}
              </Text>
            )}
            <Caret size={16} aria-hidden="true" />
          </HStack>
        ),
      }}
      hasChevron={false}
      placement={compact ? "end" : opens}
      alignment={compact && opens === "above" ? "end" : "start"}
      menuWidth={compact ? undefined : "anchor-size(width)"}
    >
      <DropdownMenuRadioGroup label={name} value={value} onChange={onChange}>
        {options.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
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
  const current =
    appearanceOptions.find((option) => option.value === mode) ??
    appearanceOptions[2];
  return (
    <VStack
      className="editorial-workspace-utilities"
      data-collapsed={compact}
      hAlign={compact ? "center" : "stretch"}
      gap={1}
    >
      <SidebarMenu
        className="admin-appearance-menu"
        name="Theme"
        label="Theme"
        accessibleLabel={`Theme: ${current.label}`}
        icon={<current.Icon size={18} aria-hidden="true" />}
        detail={current.label}
        compact={compact}
        opens="above"
        value={mode}
        options={appearanceOptions}
        onChange={(value) => changeTheme(value as ThemePreference)}
      />
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
  navigationContent,
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
  workspace?: Workspace;
  navigationContent?: ReactNode;
  palette?: ReactNode;
}) {
  const [rail, setRail] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  // False until the client has chosen the rail. Until then the prepaint
  // script's choice on the root element holds the sidebar geometry.
  const [railReady, setRailReady] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      setLibrarySearch(
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
  const destination = (id: string) => {
    const current = readLibraryState(librarySearch);
    const currentGroup = area === "newsletter" ? "newsletter" : current.group;
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
  const selected = workspaceSelection(area, selectedGroup, recordKind);
  const paletteEntries = useMemo(
    () => [...navigationResults, ...(searchEntries ?? [])],
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
        banner={<WorkspaceTopBar workspace={workspace} />}
        sideNav={
          <SideNav
            className="editorial-workspace-nav"
            aria-label={workspaces[workspace].label}
            collapsible={{
              isCollapsed: rail,
              onCollapsedChange: changeCollapsed,
              hasButton: false,
            }}
            header={
              <WorkspaceIdentity
                collapsed={rail}
                workspace={workspace}
                siteHref={siteHref}
              />
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
            {navigationContent ?? (
              <SideNavSection title="Content">
                {websiteNavigation.map(({ id, label, icon: Icon }) => (
                  <SideNavItem
                    key={id}
                    label={label}
                    href={destination(id)}
                    isSelected={selected === id}
                    icon={<Icon size={18} aria-hidden="true" />}
                    endContent={
                      groupCounts?.[id] === undefined ? undefined : (
                        <Text
                          type="supporting"
                          color="secondary"
                          className="editorial-nav-count"
                          aria-label={`${groupCounts[id]} ${groupCounts[id] === 1 ? "record" : "records"}`}
                        >
                          {groupCounts[id]}
                        </Text>
                      )
                    }
                  />
                ))}
              </SideNavSection>
            )}
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
