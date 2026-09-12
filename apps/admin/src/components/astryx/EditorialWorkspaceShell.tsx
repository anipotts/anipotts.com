import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  libraryReturnPath,
  libraryStateUrl,
  readLibraryState,
} from "../../lib/content-library-state";
import type { ThemePreference } from "@anipotts/brand/theme";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import { AppShell, useAppShellMobile } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
  SideNavHeading,
  SideNavCollapseButton,
} from "@astryxdesign/core/SideNav";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import {
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

/** AppShell reuses this slot in its fixed-height mobile topbar and drawer. */
export function WorkspaceIdentity({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const { isMobile } = useAppShellMobile();
  return (
    <HStack
      className="editorial-workspace-identity"
      gap={1}
      vAlign="center"
      data-collapsed={collapsed}
    >
      <SideNavHeading
        className="editorial-workspace-brand"
        heading={isMobile ? "ani potts / admin" : "ani potts"}
        subheading={isMobile ? undefined : "admin"}
        icon={collapsed && !isMobile ? <Text>ap</Text> : undefined}
        menu={
          <VStack padding={2} gap={1} className="editorial-workspace-switcher">
            <SideNavItem label="ani potts admin" href="/content" isSelected />
            <SideNavItem label="ani potts operations" href="/inbox" />
          </VStack>
        }
      />
      {!isMobile && <SideNavCollapseButton size="md" />}
    </HStack>
  );
}

function WebsiteSearch() {
  const { isMobile } = useAppShellMobile();
  return isMobile ? null : (
    <SideNavItem
      label="Search"
      icon={<MagnifyingGlassIcon size={18} aria-hidden="true" />}
      onClick={() => document.dispatchEvent(new CustomEvent("admin:search"))}
    />
  );
}

/** Exact approved AP paths from public/favicon.svg; background deliberately omitted. */
function APMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 512 512" aria-hidden="true">
      {" "}
      <g transform="translate(28.9776,308.8984) scale(0.20037279,-0.20037279)">
        <path
          d="M838 1000H1138V0H837L823 90Q786 38 729.5 6.0Q673 -26 598 -26Q486 -26 388.5 16.0Q291 58 217.0 132.5Q143 207 101.5 304.5Q60 402 60 514Q60 621 99.0 714.0Q138 807 208.5 877.5Q279 948 371.5 988.0Q464 1028 570 1028Q656 1028 726.5 992.5Q797 957 852 904ZM590 262Q652 262 703.0 294.0Q754 326 784.0 380.0Q814 434 814 500Q814 566 784.0 620.0Q754 674 703.0 706.0Q652 738 590 738Q528 738 477.5 706.0Q427 674 397.5 620.0Q368 566 368 500Q368 434 398.0 380.0Q428 326 478.5 294.0Q529 262 590 262Z"
          transform="translate(0.0,0)"
          fill="currentColor"
        />
        <path
          d="M420 -500H120V1000H420V906Q467 959 529.0 992.5Q591 1026 672 1026Q782 1026 877.0 985.0Q972 944 1044.5 871.5Q1117 799 1157.5 704.0Q1198 609 1198 500Q1198 391 1157.5 295.0Q1117 199 1044.5 126.5Q972 54 877.0 13.0Q782 -28 672 -28Q591 -28 529.0 6.0Q467 40 420 92ZM668 738Q607 738 556.5 705.5Q506 673 476.0 619.0Q446 565 446 500Q446 434 476.0 380.0Q506 326 556.5 294.0Q607 262 668 262Q730 262 781.0 294.0Q832 326 862.0 380.0Q892 434 892 500Q892 565 862.0 619.0Q832 673 781.0 705.5Q730 738 668 738Z"
          transform="translate(1008.0,0)"
          fill="currentColor"
        />
      </g>
    </svg>
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
      const saved = localStorage.getItem("editorial:sidebar-collapsed");
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
      localStorage.setItem("editorial:sidebar-collapsed", String(collapsed));
    } catch {}
  };
  const selected = workspaceSelection(area, selectedGroup, recordKind);
  const paletteEntries = useMemo(
    () => [...navigationResults, ...(searchEntries ?? [])],
    [searchEntries],
  );
  const menuButton = (label: string, icon: ReactNode) => ({
    label,
    icon,
    isIconOnly: rail,
    tooltip: label,
    variant: "ghost" as const,
    size: rail ? ("md" as const) : ("sm" as const),
  });
  return (
    <>
      <AdminCommandPalette
        entries={paletteEntries}
        navItems={noOperationalNavigation}
        scope="editorial"
        showTrigger={false}
      />
      <AppShell
        className="editorial-workspace-shell"
        data-sidebar-collapsed={rail}
        height="auto"
        variant={rail ? "section" : "wash"}
        contentPadding={0}
        mobileNav={{ breakpoint: "md" }}
        sideNav={
          <SideNav
            className="editorial-workspace-nav"
            aria-label="Website"
            collapsible={{
              isCollapsed: rail,
              onCollapsedChange: changeCollapsed,
              hasButton: false,
            }}
            header={<WorkspaceIdentity collapsed={rail} />}
            topContent={<WebsiteSearch />}
            footer={
              <VStack
                className="editorial-workspace-utilities"
                data-collapsed={rail}
                hAlign={rail ? "center" : "stretch"}
                gap={2}
                paddingBlock={2}
              >
                <Button
                  {...menuButton("Live site", <APMark />)}
                  href={siteHref}
                  aria-label="Live site"
                  target="_blank"
                  rel="noopener noreferrer"
                />
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
          </SideNav>
        }
      >
        {children}
      </AppShell>
    </>
  );
}
