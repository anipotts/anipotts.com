import React, { useEffect, useState, type ReactNode } from "react";
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
import { sidebarGroupForPath } from "../../lib/admin-sidebar";
import { sidebarSearchEntries } from "./UnifiedSidebar";
import { adminThemeIcons } from "./adminThemeIcons";

// Built once, so the theme provider sees a stable object per workspace.
const shellThemes = {
  content: { ...workspaceThemes.content, icons: adminThemeIcons },
  life: { ...workspaceThemes.life, icons: adminThemeIcons },
  operations: { ...workspaceThemes.operations, icons: adminThemeIcons },
};

type AdminShellProps = {
  children: ReactNode;
  chrome: "admin" | "auth";
  currentRoute: string;
  deck?: string;
  hideHeader?: boolean;
  navItems: NavItem[];
  title: string;
  localPreview?: boolean;
  localOwner?: boolean;
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
  localOwner = false,
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
  const workspace = sidebarGroupForPath(currentRoute.split("?")[0] ?? "");
  if (chrome === "auth")
    return (
      <main className="admin-auth-frame">
        <section className="admin-auth-card">{children}</section>
      </main>
    );
  const operationalItems = navItems.filter(
    (item) => item.group !== "life" && item.group !== "website",
  );
  return (
    <Theme theme={shellThemes[workspace]} mode={mode}>
      <EditorialWorkspaceShell
        area="content"
        workspace={workspace}
        mode={mode}
        changeTheme={changeTheme}
        siteHref="https://anipotts.com"
        localPreview={localPreview}
        localOwner={localOwner}
        currentRoute={currentRoute}
        palette={
          workspace === "life" ? (
            <AdminCommandPalette
              entries={sidebarSearchEntries}
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
