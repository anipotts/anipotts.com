import React, { useCallback, useEffect, useState } from "react";
import { AdminOverview } from "../overview/AdminOverview";
import { DataWorkspace, type DataNavigate } from "./DataWorkspace";
import { HealthView } from "./HealthView";
import { KnowledgeView } from "./KnowledgeView";
import type { CatalogRecord } from "../astryx/EditorialApp";
import type { OpsViewProps } from "../astryx/ObservabilityWorkspace";
import type { DataFixture } from "../../lib/data-fixture-reader";
import {
  DATA_VIEW_TITLES,
  dataRoute,
  type DataRoute,
} from "../../lib/data-routes";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import {
  clientNavigate,
  onClientLinkClick,
  registerClientRoutes,
} from "../../lib/client-routes";

type Route = { view: "overview" } | DataRoute;

/** The routes this island draws, or null for a route that needs a document.
 * Every Data view reads in the browser, so each is drawn in place. */
export function shellRoute(
  url: URL,
  { overview }: { overview: boolean },
): Route | null {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return overview ? { view: "overview" } : null;
  return dataRoute(url);
}

const title = (route: Route) =>
  route.view === "overview" ? "Overview" : DATA_VIEW_TITLES[route.view];

/** A new place starts at the top of the page. */
function scrollTop() {
  document.getElementById("astryx-app-shell-main")?.scrollTo?.(0, 0);
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

/**
 * One mounted shell for the overview and Data. Moving between them, or
 * opening a record from the overview, stays in this document, so the private
 * session (module memory, see lib/private-session-store.ts) is never opened
 * twice. The overview is only drawn where the server loaded its Content.
 * The route lives here, with the one history listener.
 */
export function PrivateShell({
  initialPath,
  content,
  dataEnabled,
  healthEnabled = false,
  knowledgeEnabled = false,
  dataFixture,
  session,
  healthSession,
  fetch: fetcher,
  ...ops
}: {
  initialPath: string;
  /** The overview's recent Content; present only when `/` rendered this. */
  content?: CatalogRecord[];
  dataEnabled: boolean;
  /** Health's own reader mode is on (PRIVATE_READER_HEALTH_ENABLED). */
  healthEnabled?: boolean;
  /** Knowledge's entity reads are on (PRIVATE_READER_KNOWLEDGE_ENABLED). */
  knowledgeEnabled?: boolean;
  dataFixture?: DataFixture;
  /** Test seams for the private sessions. */
  session?: PrivateReaderSession;
  healthSession?: PrivateReaderSession;
  fetch?: typeof fetch;
} & OpsViewProps) {
  const overview = content !== undefined;
  const resolve = useCallback(
    (url: URL) => shellRoute(url, { overview }),
    [overview],
  );
  const [route, setRoute] = useState<Route>(
    () =>
      resolve(new URL(initialPath, "https://admin.invalid")) ?? {
        view: "records",
        id: null,
        kind: "all",
        source: null,
      },
  );
  useEffect(() => {
    const show = (url: URL, top: boolean) => {
      const next = resolve(url);
      if (!next) return;
      setRoute(next);
      document.title = `${title(next)} | Admin`;
      if (top) scrollTop();
    };
    const unregister = registerClientRoutes({
      handles: (url) => resolve(url) !== null,
      show: (url) => show(url, true),
    });
    const back = () => show(new URL(window.location.href), false);
    window.addEventListener("popstate", back);
    return () => {
      unregister();
      window.removeEventListener("popstate", back);
    };
  }, [resolve]);
  const navigate = useCallback<DataNavigate>(
    (href, options = {}) => {
      if (!options.replace) {
        if (!clientNavigate(href)) window.location.assign(href);
        return;
      }
      const url = new URL(href, window.location.href);
      const next = resolve(url);
      if (!next) return window.location.replace(url.href);
      window.history.replaceState(null, "", url.pathname + url.search);
      setRoute(next);
    },
    [resolve],
  );
  return (
    <div onClick={onClientLinkClick}>
      {route.view === "overview" ? (
        <AdminOverview
          content={content ?? []}
          dataEnabled={dataEnabled}
          dataFixture={dataFixture}
          session={session}
          fetch={fetcher}
          {...ops}
        />
      ) : route.view === "health" ? (
        <HealthView
          enabled={dataEnabled && healthEnabled}
          fixture={dataFixture?.health}
          session={healthSession}
          fetch={fetcher}
        />
      ) : route.view === "knowledge" ? (
        <KnowledgeView
          route={route}
          navigate={navigate}
          enabled={dataEnabled && knowledgeEnabled}
          fixture={dataFixture?.knowledge}
          session={session}
          fetch={fetcher}
        />
      ) : (
        <DataWorkspace
          // Each sibling view starts clean; a record within Records is not
          // a new view, so opening one keeps the list's state.
          key={route.view}
          route={route}
          navigate={navigate}
          enabled={dataEnabled}
          fixture={dataFixture}
          session={session}
          fetch={fetcher}
          ops={ops}
        />
      )}
    </div>
  );
}
