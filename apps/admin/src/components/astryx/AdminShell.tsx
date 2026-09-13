import {
  HouseIcon,
  UsersIcon,
  FolderIcon,
  MapPinIcon,
  ClockIcon,
  LinkIcon,
  FileTextIcon,
  DesktopIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react";
import React, { useEffect, useState, type ReactNode } from "react";
import { SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import {
  savedTheme,
  saveTheme,
  type ThemePreference,
} from "../../lib/admin-theme";
import type { NavItem } from "../../data/admin";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";
import { workspaceThemes } from "../../themes/workspaces";
import { OperationalCommandPalette } from "./OperationalCommandPalette";
import { AdminCommandPalette } from "./AdminCommandPalette";
import { lifeSections } from "../../lib/life-sections";

type AdminShellProps = {
  children: ReactNode;
  chrome: "admin" | "auth";
  currentRoute: string;
  deck?: string;
  hideHeader?: boolean;
  navItems: NavItem[];
  title: string;
  localPreview?: boolean;
  initialMode?: ThemePreference;
};
export function AdminShell({
  children,
  chrome,
  currentRoute: initialRoute,
  deck,
  hideHeader = false,
  navItems,
  title,
  localPreview = false,
  initialMode = "light",
}: AdminShellProps) {
  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  useEffect(() => {
    const sync = () => setCurrentRoute(location.pathname + location.search);
    window.addEventListener("popstate", sync);
    window.addEventListener("admin:workspace-navigation", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("admin:workspace-navigation", sync);
    };
  }, []);
  const [mode, setMode] = useState<ThemePreference>(initialMode);
  useEffect(() => {
    setMode(savedTheme());
  }, []);
  const changeTheme = (next: ThemePreference) => {
    setMode(next);
    saveTheme(next);
  };
  const workspace = currentRoute.split("?")[0].startsWith("/life")
    ? "life"
    : "operations";
  if (chrome === "auth")
    return (
      <main className="admin-auth-frame">
        <section className="admin-auth-card">{children}</section>
      </main>
    );
  const operationalItems = navItems.filter(
    (item) => item.group !== "life" && item.group !== "website",
  );
  const lifeIcons = [
    HouseIcon,
    UsersIcon,
    FolderIcon,
    MapPinIcon,
    ClockIcon,
    LinkIcon,
    FileTextIcon,
  ];
  const lifeEntries = Object.entries(lifeSections).map(([id, label]) => ({
    id: `life-nav:${id}`,
    label,
    href: id === "overview" ? "/life" : `/life/${id}`,
    domain: "navigation" as const,
    kind: "destination",
    currentFact: "",
    source: "admin",
    freshness: "current",
    keywords: [label],
  }));
  const navigation =
    workspace === "life" ? (
      <SideNavSection title="Life">
        {lifeEntries.map((item, index) => (
          <SideNavItem
            key={item.id}
            label={item.id === "life-nav:overview" ? "Overview" : item.label}
            href={item.href}
            icon={React.createElement(lifeIcons[index]!, {
              size: 18,
              "aria-hidden": true,
            })}
            isSelected={isActive(currentRoute, item.href)}
          />
        ))}
      </SideNavSection>
    ) : (
      <SideNavSection title="Operations">
        <SideNavItem
          label="Machines"
          href="/operations/observability?view=machines"
          icon={<DesktopIcon size={18} aria-hidden="true" />}
          isSelected={
            isActive(currentRoute, "/operations/observability?view=machines") ||
            (currentRoute.split("?")[0] === "/operations/observability" &&
              !new URLSearchParams(currentRoute.split("?")[1]).has("view"))
          }
        />
        <SideNavItem
          label="Loops"
          href="/operations/observability?view=loops"
          icon={<ArrowsClockwiseIcon size={18} aria-hidden="true" />}
          isSelected={isActive(
            currentRoute,
            "/operations/observability?view=loops",
          )}
        />
      </SideNavSection>
    );
  return (
    <Theme theme={workspaceThemes[workspace]} mode={mode}>
      <EditorialWorkspaceShell
        area="content"
        workspace={workspace}
        mode={mode}
        changeTheme={changeTheme}
        siteHref="https://anipotts.com"
        localPreview={localPreview}
        navigationContent={navigation}
        palette={
          workspace === "life" ? (
            <AdminCommandPalette
              entries={lifeEntries}
              navItems={[]}
              showTrigger={false}
            />
          ) : (
            <OperationalCommandPalette
              navItems={operationalItems}
              showTrigger={false}
            />
          )
        }
      >
        <VStack gap={4} className="admin-page-frame">
          {!hideHeader && (
            <header className="page-header">
              <h1>{title}</h1>
              {deck && (
                <Text as="p" type="supporting">
                  {deck}
                </Text>
              )}
            </header>
          )}
          <section className="admin-page-content">{children}</section>
        </VStack>
      </EditorialWorkspaceShell>
    </Theme>
  );
}

function isActive(currentRoute: string, href: string): boolean {
  const [currentPath, currentQuery = ""] = currentRoute.split("?");
  const [targetPath, targetQuery = ""] = href.split("?");
  const canonicalCurrentPath = currentPath;
  const currentParams = new URLSearchParams(currentQuery);

  if (targetQuery) {
    const targetParams = new URLSearchParams(targetQuery);
    return (
      canonicalCurrentPath === targetPath &&
      [...targetParams].every(
        ([key, value]) => currentParams.get(key) === value,
      )
    );
  }

  if (href === "/inbox") return canonicalCurrentPath === "/inbox";
  if (href === "/knowledge") {
    return canonicalCurrentPath === "/knowledge" && !currentParams.has("kind");
  }
  return canonicalCurrentPath === href;
}
