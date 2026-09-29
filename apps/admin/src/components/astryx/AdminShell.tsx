import { AuthReentry } from "./AuthReentry";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import {
  protectedSessionIsLocked,
  watchProtectedSession,
} from "../../lib/protected-admin-json";
import { workspaceReturnPath } from "../../lib/workspace-navigation";
import { VStack } from "@astryxdesign/core/VStack";
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
  searchEntries,
  localPreview = false,
  localOwner = false,
  initialMode = "light",
}: AdminShellProps) {
  const [locked, setLocked] = useState(protectedSessionIsLocked);
  const inactive = useRef(locked);
  const stopSync = useRef<(() => void) | null>(null);
  useEffect(
    () =>
      watchProtectedSession(() => {
        inactive.current = true;
        stopSync.current?.();
        stopSync.current = null;
        setLocked(true);
      }),
    [],
  );
  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  useEffect(() => {
    if (inactive.current || protectedSessionIsLocked()) return;
    const sync = () => {
      if (!inactive.current && !protectedSessionIsLocked())
        setCurrentRoute(location.pathname + location.search);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("admin:workspace-navigation", sync);
    const stop = () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("admin:workspace-navigation", sync);
    };
    stopSync.current = stop;
    return stop;
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
  if (locked) {
    const path = location.pathname + location.search;
    const owner = workspaceForPath(location.pathname);
    return (
      <Theme theme={shellTheme} mode={mode}>
        <VStack gap={3}>
          <Heading level={1}>Session ended</Heading>
          <AuthReentry href={owner ? workspaceReturnPath(owner, path) : "/"} />
        </VStack>
      </Theme>
    );
  }
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
      >
        <VStack gap={4} className="admin-page-frame">
          <section className="admin-page-content">{children}</section>
        </VStack>
      </EditorialWorkspaceShell>
    </Theme>
  );
}
