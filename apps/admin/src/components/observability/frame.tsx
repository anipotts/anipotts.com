import React, { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowClockwiseIcon,
  ClockCounterClockwiseIcon,
  LinkBreakIcon,
  PlugsIcon,
  ShieldWarningIcon,
  BracketsCurlyIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  opsSamplerStopped,
  parseOpsSnapshot,
  type OpsSnapshot,
} from "../../lib/ops-v1";
import {
  appendOpsEvents,
  EMPTY_EVENT_LOG,
  parseOpsEvents,
  type OpsEventLog,
} from "../../lib/ops-events";
import type {
  OpsConnection,
  OpsStatusController,
  OpsStatusState,
} from "../../lib/ops-reader";
import { READER_HOP_TITLES } from "../../lib/reader-reach";
import { useOpsStatus } from "../hooks/useOpsStatus";
import { relativeAgo, useLiveText } from "../../lib/live-clock";
import { opsDistinctNames } from "../../lib/ops-view";
import { sentenceCase } from "../../lib/sentence-case";
import {
  InlineNotice,
  LoadingSkeleton,
  SampleBadge,
  type FixtureOrigin,
  StateBadge,
  StateNotice,
  WorkspacePage,
} from "../workspace/Workspace";

/**
 * The frame every Observability view shares: what it reads (the snapshot,
 * the events, whether either is current, the clock), the page header with
 * its one live line, and the one notice for a connection that is not
 * connected, a stopped sampler or events that are not current.
 */
export const OPS_VIEW_TITLES = {
  status: "Status",
  activity: "Activity",
  alerts: "Alerts",
} as const;
export type OpsView = keyof typeof OPS_VIEW_TITLES;

const retryable = new Set([
  "unissued",
  "unreachable",
  "unavailable",
  "rejected",
  "denied",
  "ended",
]);

export type OpsViewProps = {
  enabled: boolean;
  /** Development only: System's snapshot sample. Never ships. */
  fixture?: unknown;
  /** Development only: a synthetic events page. Never ships. */
  eventsFixture?: unknown;
  controller?: OpsStatusController;
  /** Test seam for a fixed clock. */
  now?: number;
  /** Server render time, so the first client render matches the markup. */
  renderedAt?: number;
  /** Development only: whether the fixtures are the committed samples or a
   * local replay, for the page's Sample data or Replay mark. */
  fixtureOrigin?: FixtureOrigin;
};

/**
 * Everything an Observability view reads: the snapshot, the events (when
 * asked for), whether any of it is current, and the clock. A fixture stands
 * in for the reader and is read from its own generated_at, its clock
 * running forward from there; a live view re-renders only when the sampler
 * flips between running and stopped.
 */
export function useOpsData(props: OpsViewProps, withEvents: boolean) {
  const preview = useMemo(() => {
    if (props.fixture === undefined) return null;
    try {
      return parseOpsSnapshot(props.fixture);
    } catch {
      return null;
    }
  }, [props.fixture]);
  const previewEvents = useMemo((): OpsEventLog | null => {
    if (props.eventsFixture === undefined) return null;
    try {
      const page = parseOpsEvents(props.eventsFixture, 0);
      return appendOpsEvents(
        EMPTY_EVENT_LOG,
        page.items,
        page.unknownFields,
        page.lastSeq,
        page.skipped,
      );
    } catch {
      return null;
    }
  }, [props.eventsFixture]);
  const fixtureMode = props.fixture !== undefined;
  const { state, controller: live } = useOpsStatus({
    enabled: props.enabled && !fixtureMode,
    controller: props.controller,
    events: withEvents,
  });
  const [mounted] = useState(() => props.renderedAt ?? Date.now());
  // A fixture's clock starts at its own generated_at and runs forward from
  // there on the shared clock, so its ages and the page clock tick like the
  // live page's instead of standing still. A test's `now` stays fixed.
  const anchor = fixtureMode
    ? preview
      ? Date.parse(preview.generated_at)
      : mounted
    : undefined;
  const elapsed = Number(
    useLiveText(
      (live) => String(Math.max(0, Math.floor((live - mounted) / 1000)) * 1000),
      mounted,
      anchor !== undefined && props.now === undefined ? undefined : mounted,
    ),
  );
  const fixedNow =
    props.now ?? (anchor === undefined ? undefined : anchor + elapsed);
  const snapshot = fixtureMode ? preview : state.snapshot;
  const events = fixtureMode ? previewEvents : state.events;
  // A fixture's sampler is judged at the fixture's own moment: its clock
  // running on is the page's, not a sampler that stopped.
  const stopped =
    useLiveText(
      (now) => (snapshot && opsSamplerStopped(snapshot, now) ? "stopped" : ""),
      mounted,
      props.now ?? anchor,
    ) === "stopped";
  const current = !fixtureMode && state.connection === "connected" && !stopped;
  const retry =
    live && retryable.has(state.connection) ? () => live.start() : undefined;
  const names = useMemo(
    () => opsDistinctNames(snapshot?.catalog ?? []),
    [snapshot],
  );
  return {
    fixtureMode,
    state,
    snapshot,
    events,
    /** Names two entries share, with their host (opsDistinctNames). */
    names,
    /** The fixed clock for a fixture or a test; undefined when live. */
    fixedNow,
    serverNow: mounted,
    stopped,
    current,
    retry,
  };
}

export type OpsData = ReturnType<typeof useOpsData>;

/** An age that changes at most once a minute, so the meta line is quiet. */
function MinuteAgo({ at, data }: { at: number; data: OpsData }) {
  const text = useLiveText(
    (now) => relativeAgo(at, now, "minute"),
    data.serverNow,
    data.fixedNow,
  );
  return <span suppressHydrationWarning>{text}</span>;
}

/** Alerts have no rules behind them: System keeps no alert rules and sends
 * no notification, so admin derives each alert from the state changes it
 * reads (deriveOpsAlerts), and the page says so (A-31). */
const ALERTS_SOURCE = "derived from state changes";
export const OPS_ALERTS_SOURCE = sentenceCase(ALERTS_SOURCE);

/** The page's one status line: whether it is live, and the age of what it
 * shows (the snapshot on Status, the newest event elsewhere). Alerts lead
 * with where they come from. */
function opsMeta(data: OpsData, view: OpsView): React.ReactNode {
  if (view === "status" && data.stopped) return "Last known values";
  const at =
    view === "status"
      ? data.snapshot?.generated_at
      : latestEventAt(data.events);
  const source = view === "alerts" ? ALERTS_SOURCE : null;
  if (!at) return source ? OPS_ALERTS_SOURCE : undefined;
  const what =
    view === "status" ? "generated" : source ? "latest" : "latest event";
  const parts = [
    ...(data.fixtureMode ? [] : [data.current ? "live" : "not current"]),
    ...(source ? [source] : []),
    what,
  ];
  const lead = sentenceCase(parts.join(", "));
  return (
    <>
      {lead} <MinuteAgo at={Date.parse(at)} data={data} />
    </>
  );
}

/** The newest event by when it happened: a run's finish can arrive after
 * later events. */
function latestEventAt(events: OpsEventLog | null): string | undefined {
  let latest: string | undefined;
  for (const event of events?.recent ?? [])
    if (!latest || event.at > latest) latest = event.at;
  return latest;
}

function SamplerStopped({ at, data }: { at: string; data: OpsData }) {
  const age = useLiveText(
    (now) => relativeAgo(Date.parse(at), now, "minute"),
    data.serverNow,
    data.fixedNow,
  );
  return (
    <InlineNotice
      tone="warning"
      icon={ClockCounterClockwiseIcon}
      title={`Sampler stopped ${age}`}
    />
  );
}

/** Each unconnected state's notice: its title standing alone, and the
 * title above retained content where the state keeps any. */
const CONNECTION_NOTICES: Partial<
  Record<
    OpsConnection,
    {
      title: string;
      kept?: string;
      kind: React.ComponentProps<typeof StateNotice>["kind"];
      icon?: Icon;
    }
  >
> = {
  off: { title: "Reader off", kind: "not-connected", icon: PlugsIcon },
  unissued: {
    title: READER_HOP_TITLES.unissued,
    kept: READER_HOP_TITLES.unissued,
    kind: "error",
    icon: PlugsIcon,
  },
  // Titled by the hop that failed (opsConnectionNotice).
  unreachable: {
    title: READER_HOP_TITLES.reader,
    kind: "not-connected",
    icon: LinkBreakIcon,
  },
  unavailable: {
    title: "No snapshot yet",
    kept: "No current snapshot",
    kind: "error",
  },
  rejected: { title: "Snapshot rejected", kind: "error" },
  denied: { title: "Access refused", kind: "error", icon: ShieldWarningIcon },
  ended: { title: "Session ended", kind: "not-connected" },
};

/** An unconnected state's notice. An unreachable reader names the hop that
 * failed (A-26): only a request that got no reply in time is "ap-mini
 * unreachable". */
export function opsConnectionNotice(state: OpsStatusState) {
  const notice = CONNECTION_NOTICES[state.connection];
  if (!notice || state.connection !== "unreachable") return notice;
  const title = READER_HOP_TITLES[state.hop ?? "reader"];
  return { ...notice, title, kept: title };
}

/**
 * The page's one notice: the connection when it is not connected, else a
 * stopped sampler, else events that are not current. With content retained
 * it sits above it; with nothing to show it stands in its place.
 */
function OpsNotice({
  data,
  view,
  retained,
}: {
  data: OpsData;
  view: OpsView;
  retained: boolean;
}) {
  const { state } = data;
  const notice = data.fixtureMode ? undefined : opsConnectionNotice(state);
  if (notice) {
    const retry = data.retry && (
      <Button
        label={state.connection === "ended" ? "Open again" : "Try again"}
        size="sm"
        variant="secondary"
        icon={<ArrowClockwiseIcon weight="regular" aria-hidden="true" />}
        onClick={data.retry}
      />
    );
    return retained && notice.kept ? (
      <InlineNotice
        tone="warning"
        icon={notice.icon}
        title={notice.kept}
        action={retry}
      />
    ) : (
      <StateNotice
        kind={notice.kind}
        icon={notice.icon}
        title={notice.title}
        action={retry}
      />
    );
  }
  if (data.stopped && data.snapshot)
    return <SamplerStopped at={data.snapshot.generated_at} data={data} />;
  if (!data.fixtureMode && view !== "status" && state.eventsStale)
    return retained ? (
      <InlineNotice tone="warning" title="Events not current" />
    ) : (
      <StateNotice kind="error" title="Events not current" />
    );
  return null;
}

/** "1 event unreadable", "3 events unreadable". */
export function opsUnreadTitle(count: number): string {
  return `${count} ${count === 1 ? "event" : "events"} unreadable`;
}

/**
 * Why the events on screen may be incomplete, or null when they are whole:
 * none were read, the last read failed, or some were skipped as unreadable.
 * A run history or change list says this instead of an empty state that
 * would imply nothing ran or changed.
 */
export function opsEventsGap(
  data: Pick<OpsData, "events" | "fixtureMode" | "state">,
): string | null {
  if (!data.events) return "No events read";
  if (!data.fixtureMode && data.state.eventsStale) return "Events not current";
  if (data.events.skipped > 0) return opsUnreadTitle(data.events.skipped);
  return null;
}

/** Loading, shaped like what replaces it: the host line and the rows. */
export function OpsSkeleton({ view }: { view: OpsView }) {
  return (
    <VStack gap={5}>
      {view === "status" && (
        <div className="ops-hosts" aria-hidden="true">
          <Skeleton width="16rem" height="var(--spacing-12)" radius={2} />
        </div>
      )}
      <LoadingSkeleton label={OPS_VIEW_TITLES[view].toLowerCase()} rows={8} />
    </VStack>
  );
}

/** Field names System sent that this client does not read yet, from the
 * snapshot and the events. */
export function opsUnknownFields(data: OpsData): string[] {
  return [
    ...new Set([
      ...(data.snapshot?.unknown_fields ?? []),
      ...(data.events?.unknownFields ?? []),
    ]),
  ].sort();
}

/** One quiet chip when System sends fields this client does not read yet,
 * so an admin release can catch up; the names are its tooltip. Nothing
 * when there are none. */
function DriftChip({ fields }: { fields: string[] }) {
  if (!fields.length) return null;
  const label = `${fields.length} new System ${fields.length === 1 ? "field" : "fields"}`;
  return (
    <span className="ops-drift" title={fields.join("\n")}>
      <StateBadge
        tone="neutral"
        label={label}
        icon={
          <BracketsCurlyIcon
            weight="regular"
            aria-hidden="true"
            className="workspace-state-mark"
          />
        }
      />
      <span className="sr-only">: {fields.join(", ")}</span>
    </span>
  );
}

/** One quiet chip beside the drift chip while events were skipped as
 * unreadable: a skipped event may have been a change of state, so Activity,
 * Alerts and Status, whose entries hold the run history, never read as
 * complete while one is unread. */
function UnreadChip({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ops-drift ops-unread" title={opsUnreadTitle(count)}>
      <StateBadge
        tone="neutral"
        label={opsUnreadTitle(count)}
        icon={
          <WarningCircleIcon
            weight="regular"
            aria-hidden="true"
            className="workspace-state-mark"
          />
        }
      />
    </span>
  );
}

/** Title, count, the live line, the one notice, then the view. */
export function OpsPage({
  data,
  view,
  count,
  retained,
  actions,
  children,
}: {
  data: OpsData;
  view: OpsView;
  count?: number;
  retained: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="observability-workspace">
      <WorkspacePage
        title={OPS_VIEW_TITLES[view]}
        count={count}
        clock={data.fixedNow}
        meta={retained ? opsMeta(data, view) : undefined}
        badge={
          <>
            {data.fixtureMode && <SampleBadge from={["snapshot", "events"]} />}
            <DriftChip fields={opsUnknownFields(data)} />
            <UnreadChip count={data.events?.skipped ?? 0} />
          </>
        }
        actions={actions}
      >
        <OpsNotice data={data} view={view} retained={retained} />
        {children}
      </WorkspacePage>
    </div>
  );
}

/** The catalog by id, for names and runbooks on event rows. */
export type OpsCatalog = ReadonlyMap<string, OpsSnapshot["catalog"][number]>;

export function catalogOf(snapshot: OpsSnapshot | null): OpsCatalog {
  return new Map((snapshot?.catalog ?? []).map((entry) => [entry.id, entry]));
}
