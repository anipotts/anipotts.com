import React, { useEffect, useState } from "react";
import { AdminOverview } from "../overview/AdminOverview";
import { DataWorkspace, type SourcesView } from "./DataWorkspace";
import type { CatalogRecord } from "../astryx/EditorialApp";
import type { OpsViewProps } from "../astryx/ObservabilityWorkspace";
import type { DataFixture } from "../../lib/data-fixture-reader";
import type { DataExtras } from "../../lib/data-extras";
import { dataKind } from "../../lib/data-routes";
import { PRIVATE_READER_BOUNDS } from "../../lib/private-reader-fetch";
import {
  onClientLinkClick,
  registerClientRoutes,
} from "../../lib/client-routes";

type Route =
  | { page: "overview" }
  | { page: "records"; id: string | null; kind: ReturnType<typeof dataKind> }
  | { page: "sources"; view: SourcesView };

/** The routes this island draws, or null for a route that needs a document. */
export function shellRoute(url: URL, overview: boolean): Route | null {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return overview ? { page: "overview" } : null;
  if (path === "/data/sources") {
    const view = url.searchParams.get("view");
    return {
      page: "sources",
      view: view === "health" || view === "knowledge" ? view : "reader",
    };
  }
  const kind = dataKind(url.searchParams.get("kind"));
  if (path === "/data/records") return { page: "records", id: null, kind };
  const match = /^\/data\/records\/([^/]+)$/.exec(path);
  const id = match ? decodeURIComponent(match[1]!) : "";
  return PRIVATE_READER_BOUNDS.recordId.test(id)
    ? { page: "records", id, kind }
    : null;
}

const TITLES = { overview: "Overview", records: "Records", sources: "Sources" };

/**
 * One mounted shell for the overview and Data. Moving between them, or
 * opening a record from the overview, stays in this document, so the private
 * session (module memory, see lib/private-session-store.ts) is never opened
 * twice. The overview is only drawn where the server loaded its Content.
 */
export function PrivateShell({
  initialPath,
  content,
  dataEnabled,
  dataFixture,
  extras,
  ...ops
}: {
  initialPath: string;
  /** The overview's recent Content; present only when `/` rendered this. */
  content?: CatalogRecord[];
  dataEnabled: boolean;
  dataFixture?: DataFixture;
  extras?: DataExtras;
} & OpsViewProps) {
  const overview = content !== undefined;
  const [route, setRoute] = useState<Route>(
    () =>
      shellRoute(new URL(initialPath, "https://admin.invalid"), overview) ?? {
        page: "records",
        id: null,
        kind: "all",
      },
  );
  useEffect(() => {
    const show = (url: URL) => {
      const next = shellRoute(url, overview);
      if (!next) return;
      setRoute(next);
      document.title = `${TITLES[next.page]} | Anipotts Admin`;
      document.getElementById("astryx-app-shell-main")?.scrollTo(0, 0);
    };
    const unregister = registerClientRoutes({
      handles: (url) => shellRoute(url, overview) !== null,
      show,
    });
    const back = () => show(new URL(window.location.href));
    window.addEventListener("popstate", back);
    return () => {
      unregister();
      window.removeEventListener("popstate", back);
    };
  }, [overview]);
  return (
    <div onClickCapture={onClientLinkClick}>
      {route.page === "overview" ? (
        <AdminOverview
          content={content ?? []}
          dataEnabled={dataEnabled}
          dataFixture={dataFixture}
          {...ops}
        />
      ) : (
        <DataWorkspace
          // Records and Sources are separate views; a record within Records
          // is not, so opening one keeps the list's state.
          key={route.page}
          view={route.page}
          enabled={dataEnabled}
          fixture={dataFixture}
          extras={extras}
          recordId={route.page === "records" ? route.id : null}
          kind={route.page === "records" ? route.kind : "all"}
          sourcesView={route.page === "sources" ? route.view : "reader"}
        />
      )}
    </div>
  );
}
