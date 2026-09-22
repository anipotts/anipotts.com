import React, { useEffect, useState, type ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import {
  savedTheme,
  saveTheme,
  type ThemePreference,
} from "../../lib/admin-theme";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";
import { editorialTheme } from "../../themes/editorial.js";
import { workspaceForPath } from "../../lib/admin-sidebar";
import type { AdminSearchResult } from "../../data/admin-search";
import { adminThemeIcons } from "./adminThemeIcons";

// Built once, so the theme provider sees a stable object. Every workspace
// renders this one theme; its accent comes from themes/workspace-accents.css.
const shellTheme = { ...editorialTheme, icons: adminThemeIcons };

type AdminShellProps = {
  children: ReactNode;
  currentRoute: string;
  deck?: string;
  hideHeader?: boolean;
  title: string;
  searchEntries?: AdminSearchResult[];
  localPreview?: boolean;
  localOwner?: boolean;
  initialMode?: ThemePreference;
};

/** The shell for the overview, Data, Observability and the retired console
 * pages. Content pages render the same workspace shell from EditorialApp. */
export function AdminShell({
  children,
  currentRoute: initialRoute,
  deck,
  hideHeader = false,
  title,
  searchEntries,
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
  const workspace = workspaceForPath(currentRoute.split("?")[0] ?? "");
  return (
    <Theme theme={shellTheme} mode={mode}>
      <EditorialWorkspaceShell
        area="content"
        workspace={workspace}
        mode={mode}
        changeTheme={changeTheme}
        localPreview={localPreview}
        localOwner={localOwner}
        currentRoute={currentRoute}
        searchEntries={searchEntries}
        // A client route (overview to Data) keeps the document; the selected
        // page names the bar instead of the first page's title.
        title={currentRoute === initialRoute ? title : undefined}
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
