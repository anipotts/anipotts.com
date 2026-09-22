import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { DATA_VIEW_TITLES, type DataRoute } from "../../lib/data-routes";
import type { DataFixture } from "../../lib/data-fixture-reader";
import { fixtureExtras, type DataExtras } from "../../lib/data-extras";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import { SampleBadge, WorkspacePage } from "../workspace/Workspace";
import { useDataSession } from "./useDataSession";
import {
  DataSessionControl,
  SessionNotice,
  type DataNavigate,
} from "./DataNotices";
import { RecordsExplorer, RecordsToolbar } from "./RecordsView";
import { CardsExplorer, SourcesExplorer } from "./SourcesView";
import "./data-workspace.css";

export type { DataNavigate } from "./DataNotices";

/** The content width at which a record opens beside its list: about
 * 1024px, which a 1280px window with the full sidebar just holds. */
const SPLIT_MIN_WIDTH = 960;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Whether the element is wide enough to hold the list and a record side by
 * side. CSS lays the split out with a container query at the same width;
 * this decides the parts CSS cannot, such as the record's heading level. */
function useSplit(ref: RefObject<HTMLElement | null>): boolean {
  const [split, setSplit] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () =>
      setSplit(node.getBoundingClientRect().width >= SPLIT_MIN_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return split;
}

/**
 * The Data workspace. Records, Sources, Health and Knowledge are siblings.
 * Records and Sources read the private reader through one session that
 * opens on its own, is shared by every Data view in this document, and is
 * memory only. Health and Knowledge are read on the server from D1 and need
 * no session.
 */
export function DataWorkspace({
  route,
  navigate,
  enabled,
  fixture,
  extras,
  session: injected,
  fetch: fetcher,
}: {
  route: DataRoute;
  navigate: DataNavigate;
  enabled: boolean;
  fixture?: DataFixture;
  /** Health or Knowledge cards, read on the server for this page. */
  extras?: DataExtras;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const readerView = route.view === "records" || route.view === "sources";
  const session = useDataSession({
    enabled: enabled && readerView,
    fixture: readerView ? fixture : undefined,
    session: injected,
    fetch: fetcher,
  });
  const [count, setCount] = useState<number | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);
  const split = useSplit(frame);
  const ready = session.status === "ready" && session.reader;
  const recordOpen = route.view === "records" && route.id !== null;
  const label = DATA_VIEW_TITLES[route.view].toLowerCase();
  let body: React.ReactNode;
  if (!readerView) {
    const view = route.view as "health" | "knowledge";
    body = (
      <CardsExplorer
        view={view}
        set={(extras ?? fixtureExtras(fixture?.extras))[view]}
        onCount={setCount}
      />
    );
  } else if (!ready) {
    body = (
      <>
        {route.view === "records" && session.status === "opening" && (
          <div className="data-records-list">
            <RecordsToolbar disabled route={route} navigate={navigate} />
          </div>
        )}
        <SessionNotice session={session} label={label} />
      </>
    );
  } else if (route.view === "records") {
    body = (
      <RecordsExplorer
        key={session.generation}
        reader={session.reader!}
        route={route}
        navigate={navigate}
        split={split}
        onCount={setCount}
      />
    );
  } else {
    body = (
      <SourcesExplorer
        key={session.generation}
        reader={session.reader!}
        onCount={setCount}
      />
    );
  }
  return (
    <div
      ref={frame}
      className="data-workspace"
      data-view={route.view}
      data-record-open={ready && recordOpen ? "true" : "false"}
    >
      <WorkspacePage
        title={DATA_VIEW_TITLES[route.view]}
        count={ready || !readerView ? count : undefined}
        badge={
          session.fixture || (!readerView && fixture) ? (
            <SampleBadge />
          ) : undefined
        }
        actions={
          readerView && session.status !== "off" ? (
            <DataSessionControl session={session} />
          ) : undefined
        }
      >
        {body}
      </WorkspacePage>
    </div>
  );
}
