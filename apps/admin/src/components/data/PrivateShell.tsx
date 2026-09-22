import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminOverview } from "../overview/AdminOverview";
import { DataWorkspace, type DataNavigate } from "./DataWorkspace";
import type { CatalogRecord } from "../astryx/EditorialApp";
import type { OpsViewProps } from "../astryx/ObservabilityWorkspace";
import type { DataFixture } from "../../lib/data-fixture-reader";
import { fixtureExtras, type DataExtras } from "../../lib/data-extras";
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
 * Health and Knowledge are read on the server, so they are drawn in place
 * only when this document already holds their cards. */
export function shellRoute(
  url: URL,
  { overview, extras }: { overview: boolean; extras?: DataExtras },
): Route | null {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return overview ? { view: "overview" } : null;
  const route = dataRoute(url);
  if (!route) return null;
  if (
    (route.view === "health" || route.view === "knowledge") &&
    !extras?.[route.view]
  )
    return null;
  return route;
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
  dataFixture,
  extras: loaded,
  session,
  fetch: fetcher,
  ...ops
}: {
  initialPath: string;
  /** The overview's recent Content; present only when `/` rendered this. */
  content?: CatalogRecord[];
  dataEnabled: boolean;
  dataFixture?: DataFixture;
  /** Health or Knowledge cards the server read for this page. */
  extras?: DataExtras;
  /** Test seams for the private session. */
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
} & OpsViewProps) {
  const overview = content !== undefined;
  const extras = useMemo(
    () =>
      loaded ?? (dataFixture ? fixtureExtras(dataFixture.extras) : undefined),
    [loaded, dataFixture],
  );
  const resolve = useCallback(
    (url: URL) => shellRoute(url, { overview, extras }),
    [overview, extras],
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
      ) : (
        <DataWorkspace
          // Each sibling view starts clean; a record within Records is not
          // a new view, so opening one keeps the list's state.
          key={route.view}
          route={route}
          navigate={navigate}
          enabled={dataEnabled}
          fixture={dataFixture}
          extras={extras}
          session={session}
          fetch={fetcher}
        />
      )}
    </div>
  );
}
