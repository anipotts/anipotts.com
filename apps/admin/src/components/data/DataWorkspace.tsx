import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { DATA_VIEW_TITLES, type RecordsRoute } from "../../lib/data-routes";
import type { DataFixture } from "../../lib/data-fixture-reader";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import { SampleBadge, WorkspacePage } from "../workspace/Workspace";
import { useDataSession } from "./useDataSession";
import {
  DataSessionControl,
  SessionNotice,
  type DataNavigate,
} from "./DataNotices";
import { RecordsExplorer, RecordsToolbar } from "./RecordsView";
import { SourcesExplorer } from "./SourcesView";
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
 * Records and Sources, which read the private reader through one session
 * that opens on its own, is shared by every Data view in this document, and
 * is memory only. Health and Knowledge are their own views (HealthView,
 * KnowledgeView), siblings in the same shell.
 */
export function DataWorkspace({
  route,
  navigate,
  enabled,
  fixture,
  session: injected,
  fetch: fetcher,
}: {
  route: RecordsRoute | { view: "sources" };
  navigate: DataNavigate;
  enabled: boolean;
  fixture?: DataFixture;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const session = useDataSession({
    enabled,
    fixture,
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
  if (!ready) {
    body = (
      <>
        {route.view === "records" && session.status === "opening" && (
          <div className="workspace-split-list">
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
        count={ready ? count : undefined}
        badge={session.fixture ? <SampleBadge /> : undefined}
        actions={
          session.status !== "off" ? (
            <DataSessionControl session={session} />
          ) : undefined
        }
      >
        {body}
      </WorkspacePage>
    </div>
  );
}
