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
  libraryReturnPath,
  libraryStateUrl,
  readLibraryState,
} from "../../lib/content-library-state";
import type { ThemePreference } from "@anipotts/brand/theme";
import { HStack } from "@astryxdesign/core/HStack";
import { Popover } from "@astryxdesign/core/Popover";
import "./WorkspaceHeader.css";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import { AppShell, useAppShellMobile } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
  SideNavCollapseButton,
} from "@astryxdesign/core/SideNav";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
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
  ArrowUpRightIcon,
} from "@phosphor-icons/react";
import { AdminCommandPalette } from "./AdminCommandPalette";
import type { AdminSearchResult } from "../../data/admin-search";

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

/** AppShell reuses this slot in its fixed-height mobile topbar and drawer. */
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
  const selectorRef = useRef<HTMLButtonElement>(null);
  const [menuWidth, setMenuWidth] = useState<number | string>();
  const WorkspaceIcon = workspaceIcons[workspace];
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
      <Popover
        className="editorial-workspace-popover"
        width={menuWidth}
        onOpenChange={(open) => {
          if (open)
            setMenuWidth(
              compact
                ? "calc(var(--spacing-8) * 7)"
                : selectorRef.current?.getBoundingClientRect().width,
            );
        }}
        label="Switch workspace"
        placement={compact ? "end" : "below"}
        content={
          <VStack padding={2} gap={1} className="editorial-workspace-switcher">
            {(Object.keys(workspaces) as Workspace[]).map((key) => {
              const Icon = workspaceIcons[key];
              return (
                <SideNavItem
                  key={key}
                  label={workspaces[key].label}
                  href={destinations[key]}
                  isSelected={workspace === key}
                  icon={<Icon size={18} aria-hidden="true" />}
                />
              );
            })}
          </VStack>
        }
      >
        <Button
          ref={selectorRef}
          className="admin-workspace-selector"
          label={workspaces[workspace].label}
          aria-label={`Switch workspace: ${workspaces[workspace].label}`}
          tooltip={`Switch workspace: ${workspaces[workspace].label}`}
          isIconOnly={compact}
          variant="secondary"
          size="md"
          icon={<WorkspaceIcon size={18} aria-hidden="true" />}
        >
          {!compact && (
            <>
              <span className="workspace-control-label">
                {workspaces[workspace].label}
              </span>
              <CaretDownIcon
                className="workspace-caret"
                size={16}
                weight="fill"
                aria-hidden="true"
              />
            </>
          )}
        </Button>
      </Popover>
      {!isMobile && (
        <Button
          className="editorial-header-search"
          label="Search"
          aria-label="Search"
          tooltip="Search (⌘K / Ctrl+K)"
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

export function EditorialWorkspaceShell({
  children,
  area,
  selectedGroup,
  recordKind,
  mode,
  changeTheme,
  siteHref,
  localPreview,
  searchEntries,
  workspace = "content",
  navigationContent,
  palette,
}: {
  children: ReactNode;
  area: "content" | "newsletter";
  selectedGroup?: string;
  recordKind?: string;
  mode: ThemePreference;
  changeTheme: (mode: ThemePreference) => void;
  siteHref: string;
  localPreview: boolean;
  searchEntries?: AdminSearchResult[];
  workspace?: Workspace;
  navigationContent?: ReactNode;
  palette?: ReactNode;
}) {
  const [rail, setRail] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
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
  const destination = (id: string) =>
    libraryStateUrl(
      id === "newsletter" ? "/newsletter" : "/content",
      librarySearch,
      {
        ...readLibraryState(librarySearch),
        group: id === "newsletter" ? "pages" : id,
      },
    );
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem("admin:sidebar-collapsed") ??
        localStorage.getItem("editorial:sidebar-collapsed");
      if (saved === "true" || saved === "false")
        setUserCollapsed(saved === "true");
    } catch {}
  }, []);
  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 768px) and (max-width: 1279px)",
    );
    const update = () =>
      setRail(
        window.innerWidth < 768 ? false : (userCollapsed ?? query.matches),
      );
    update();
    query.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [userCollapsed]);
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
        data-workspace={workspace}
        height="fill"
        variant={rail ? "section" : "wash"}
        contentPadding={0}
        mobileNav={{ breakpoint: "md" }}
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
              <VStack
                className="editorial-workspace-utilities"
                data-collapsed={rail}
                hAlign={rail ? "center" : "stretch"}
                gap={2}
                paddingBlock={2}
              >
                <VStack gap={0} className="editorial-site-appearance">
                  <ToggleButtonGroup
                    type="single"
                    label="Appearance"
                    value={mode}
                    onChange={(value) => {
                      if (value) changeTheme(value as ThemePreference);
                    }}
                    orientation={rail ? "vertical" : "horizontal"}
                    size="md"
                  >
                    <ToggleButton
                      value="light"
                      label="Light"
                      tooltip="Light"
                      icon={<SunIcon size={18} aria-hidden="true" />}
                      isIconOnly
                    />
                    <ToggleButton
                      value="dark"
                      label="Dark"
                      tooltip="Dark"
                      icon={<MoonIcon size={18} aria-hidden="true" />}
                      isIconOnly
                    />
                    <ToggleButton
                      value="system"
                      label="System"
                      tooltip="System"
                      icon={<DesktopIcon size={18} aria-hidden="true" />}
                      isIconOnly
                    />
                  </ToggleButtonGroup>
                </VStack>
                {!localPreview && (
                  <SideNavItem
                    label="Log out"
                    href="/cdn-cgi/access/logout"
                    icon={<SignOutIcon size={18} aria-hidden="true" />}
                  />
                )}
              </VStack>
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
                  />
                ))}
              </SideNavSection>
            )}
          </SideNav>
        }
      >
        {children}
      </AppShell>
    </>
  );
}
