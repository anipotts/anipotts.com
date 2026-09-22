import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpLeftIcon,
  ArrowClockwiseIcon,
  BellSimpleIcon,
  BroadcastIcon,
  ClockCounterClockwiseIcon,
  LinkBreakIcon,
  ListBulletsIcon,
  PlugsIcon,
  PulseIcon,
  ShieldWarningIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  OPS_HOSTS_GROUP,
  OPS_V1_BOUNDS,
  formatDuration,
  opsFreshness,
  opsIsHost,
  opsOrdered,
  opsRenderedCounts,
  opsRunbookHref,
  opsSamplerStopped,
  opsServices,
  parseOpsSnapshot,
  type OpsCatalogEntry,
  type OpsServiceView,
  type OpsSnapshot,
  type OpsState,
} from "../../lib/ops-v1";
import {
  appendOpsEvents,
  deriveOpsAlerts,
  EMPTY_EVENT_LOG,
  humanize,
  opsActivitySource,
  opsRouteLabel,
  OPS_ADMIN_POLLING_SOURCE,
  parseOpsEvents,
  type OpsAlert,
  type OpsEvent,
  type OpsEventLog,
  type OpsTransitionEvent,
} from "../../lib/ops-events";
import type { OpsConnection, OpsStatusController } from "../../lib/ops-reader";
import { useOpsStatus } from "../hooks/useOpsStatus";
import {
  DataTable,
  DetailPanel,
  InlineNotice,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  SampleBadge,
  StateBadge,
  StateNotice,
  WorkspacePage,
  WorkspaceSection,
  FilterMenu,
  badgeFor,
  type Column,
} from "../workspace/Workspace";
import { BrandTile } from "../BrandTile";
import {
  deviceMark,
  linkMark,
  markLabel,
  opsMark,
  shortName,
  type TileRef,
} from "../../lib/marks";
import { brandMark } from "@anipotts/brand/marks";
import { sentenceCase } from "../../lib/sentence-case";
import { relativeAgo, useLiveText } from "../../lib/live-clock";
import "./operations-workspace.css";

/**
 * Observability, read-only, on System's ops_v1 snapshot and ops_events_v1
 * feed: Status shows the snapshot, Activity the events by day, and Alerts the
 * alerts derived from transitions, firing and resolved, each opening in
 * admin before its runbook.
 *
 * Only exceptions carry a mark: an ok entry draws no chip. Every row leads
 * with its brand, device or kind tile, the name drops the brand word the
 * tile already says, and ids ride in tooltips. The page renders only when
 * its data or its connection changes; times are leaves on the one shared
 * clock, and a fixture or a test reads a fixed clock that never ticks.
 */
export const OPS_VIEW_TITLES = {
  status: "Status",
  activity: "Activity",
  alerts: "Alerts",
} as const;
export type OpsView = keyof typeof OPS_VIEW_TITLES;

const stateLabel = (state: OpsState) => badgeFor("ops", state).label;

/** A state chip, drawn only for an exception: an ok entry carries its name
 * for assistive technology alone. */
export function OpsStateBadge({ state }: { state: OpsState }) {
  return (
    <span className="ops-state" data-state={state}>
      <StateBadge domain="ops" state={state} />
    </span>
  );
}

type Entry = Pick<OpsCatalogEntry, "id" | "name"> & {
  kind?: string | null;
  group?: string;
};

/** The tile for a catalog entry: its brand, device or kind. */
function OpsTile({ tile }: { tile: TileRef }) {
  return <BrandTile id={tile.id} kind={tile.kind} />;
}

/** What the tile stands for, as its tooltip and for assistive technology. */
function tileKind(entry: Entry, tile = opsMark(entry)) {
  return markLabel(tile) ?? sentenceCase(entry.kind || "entry");
}

/** The entry's name with the brand word its tile already says dropped:
 * "1password connect" beside the 1Password tile reads "Connect". Host names
 * keep their own spelling. */
function opsName(entry: Entry, tile = opsMark(entry)) {
  if (entry.kind === "host" || entry.group === OPS_HOSTS_GROUP)
    return entry.name;
  const short = shortName(entry.name, tile.id);
  return short === brandMark(tile.id)?.label ? short : sentenceCase(short);
}

/** A runbook's destination, and how its tooltip and link name it. */
function runbook(path: string) {
  const href = opsRunbookHref(path);
  const onGitHub = linkMark(href).id === "github";
  return {
    href,
    where: onGitHub ? "Runbook on GitHub" : "Runbook",
    spoken: onGitHub ? "runbook on GitHub" : "runbook",
  };
}

function detailOf(service: OpsServiceView) {
  return service.missingStatus
    ? "No status row from System"
    : service.status.detail;
}

/** The anchor on an entry's Status row or host tile. */
export function opsEntryAnchor(id: string) {
  return `entry-${id}`;
}

// Status

type Row = OpsServiceView & Record<string, unknown>;

/** Why an entry is in its state, and a non-zero exit as a critical figure. */
function Reason({ service }: { service: OpsServiceView }) {
  const exit = service.status.last_exit;
  return (
    <>
      <Text type="supporting" color="secondary" className="ops-reason">
        {detailOf(service)}
      </Text>
      {exit !== null && exit !== 0 && (
        <Text type="supporting" className="ops-exit workspace-figure">
          exit {exit}
        </Text>
      )}
    </>
  );
}

/** The last success, live, with the budget named only once it is over. */
function LastSuccess({
  service,
  now,
}: {
  service: OpsServiceView;
  now?: number;
}) {
  const over = useLiveText(
    (live) => {
      const freshness = opsFreshness(service, live);
      return freshness.kind === "budget" && freshness.overBudget
        ? formatDuration(freshness.budgetSeconds)
        : "";
    },
    Date.now(),
    now,
  );
  const at = service.status.last_success_at;
  if (!at) return null;
  return (
    <HStack gap={2} vAlign="center" wrap="nowrap">
      <RelativeTime value={at} now={now} />
      {over && (
        <Text type="supporting" weight="semibold" className="ops-over">
          over {over}
        </Text>
      )}
    </HStack>
  );
}

function statusColumns(withSchedule: boolean, now?: number): Column<Row>[] {
  return [
    {
      key: "name",
      header: "Service",
      render: (row) => {
        const tile = opsMark(row);
        const name = opsName(row, tile);
        const link = runbook(row.runbook);
        const exception = row.status.state !== "ok";
        return (
          <RowTitle
            mark={<OpsTile tile={tile} />}
            kind={tileKind(row, tile)}
            title={name}
            anchorId={opsEntryAnchor(row.id)}
            href={link.href}
            external
            linkLabel={`${name}, ${link.spoken}`}
            tooltip={`${link.where}\n${row.id}`}
            mobile={
              exception ? (
                <>
                  <OpsStateBadge state={row.status.state} />
                  <Reason service={row} />
                </>
              ) : undefined
            }
            end={
              row.status.last_success_at ? (
                <RelativeTime value={row.status.last_success_at} now={now} />
              ) : undefined
            }
          />
        );
      },
    },
    {
      key: "state",
      header: "State",
      width: 288,
      render: (row) => (
        <HStack
          gap={2}
          vAlign="center"
          wrap="nowrap"
          className="ops-state-cell"
        >
          <OpsStateBadge state={row.status.state} />
          <Reason service={row} />
        </HStack>
      ),
    },
    {
      key: "last_success",
      header: "Last success",
      width: 152,
      render: (row) => <LastSuccess service={row} now={now} />,
    },
    // Schedule is optional in ops_v1; the column shows only when at least
    // one entry carries it.
    ...(withSchedule
      ? [
          {
            key: "schedule",
            header: "Schedule",
            width: 176,
            hideBelow: "wide" as const,
            render: (row: Row) =>
              row.schedule ? <Text>{row.schedule}</Text> : null,
          },
        ]
      : []),
    {
      key: "owner",
      header: "Owner",
      width: 120,
      hideBelow: "wide",
      render: (row) => <Text>{row.owner}</Text>,
    },
  ];
}

/** Hosts on one line each: the device, its name, its figure and a chip
 * only when it is not ok. */
function HostStrip({ hosts }: { hosts: OpsServiceView[] }) {
  if (!hosts.length) return null;
  return (
    <ul className="ops-hosts" aria-label="Hosts">
      {hosts.map((host) => {
        const tile = opsMark(host);
        return (
          <li
            key={host.id}
            id={opsEntryAnchor(host.id)}
            className="ops-host"
            data-state={host.status.state}
          >
            <OpsTile tile={tile} />
            <Text weight="medium" className="ops-host-name">
              {opsName(host, tile)}
            </Text>
            <Text
              color="secondary"
              className="ops-host-detail workspace-figure"
            >
              {detailOf(host)}
            </Text>
            <OpsStateBadge state={host.status.state} />
          </li>
        );
      })}
    </ul>
  );
}

/** Non-ok states, most severe first, as the Status summary's order. */
const EXCEPTIONS: readonly OpsState[] = [
  "failing",
  "degraded",
  "stale",
  "unknown",
  "asleep",
];

/** One count chip per non-ok state; nothing when everything is ok. */
function ExceptionCounts({ services }: { services: OpsServiceView[] }) {
  const counts = opsRenderedCounts(services);
  const shown = EXCEPTIONS.filter((state) => counts[state] > 0);
  if (!shown.length) return null;
  return (
    <ul className="ops-counts" aria-label="Not ok">
      {shown.map((state) => {
        const badge = badgeFor("ops", state);
        const Glyph = badge.icon;
        return (
          <li key={state}>
            <StateBadge
              tone={badge.tone}
              label={`${counts[state]} ${badge.label}`}
              icon={
                Glyph ? (
                  <Glyph
                    weight="regular"
                    aria-hidden="true"
                    className="workspace-state-mark"
                  />
                ) : undefined
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Once the sampler stops, no value is current and none may read as ok:
 * every entry shows as unknown, with what System last reported kept as
 * detail.
 */
function asLastKnown(service: OpsServiceView): OpsServiceView {
  return {
    ...service,
    status: {
      ...service.status,
      state: "unknown",
      detail: service.missingStatus
        ? "No status row from System"
        : `Last known ${stateLabel(service.status.state).toLowerCase()}: ${service.status.detail}`,
    },
    missingStatus: false,
  };
}

/** Services in display order, as last known once the sampler stops. */
function opsView(snapshot: OpsSnapshot, lastKnown: boolean) {
  const ordered = opsOrdered(opsServices(snapshot));
  return lastKnown ? ordered.map(asLastKnown) : ordered;
}

/** A link into Status lands on its row: scrolled to, tinted for a moment
 * and focused. The rows draw only once the snapshot arrives, so the browser
 * cannot do this on load. */
function useAnchorLanding(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    const still = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView?.({
      block: "center",
      behavior: still ? "auto" : "smooth",
    });
    const landed = target.closest("tr") ?? target;
    landed.setAttribute("data-landed", "");
    target
      .querySelector<HTMLElement>(".workspace-row-link")
      ?.focus({ preventScroll: true });
    const timer = setTimeout(() => landed.removeAttribute("data-landed"), 2400);
    return () => clearTimeout(timer);
  }, [ready]);
}

function StatusBody({
  services,
  now,
  lastKnown,
}: {
  services: OpsServiceView[];
  now?: number;
  lastKnown: boolean;
}) {
  const hosts = services.filter(opsIsHost);
  const rows = services.filter((service) => !opsIsHost(service)) as Row[];
  const withSchedule = rows.some((row) => row.schedule);
  const columns = useMemo(
    () => statusColumns(withSchedule, now),
    [withSchedule, now],
  );
  useAnchorLanding(services.length > 0);
  return (
    <VStack gap={5}>
      <div className="ops-overview">
        <HostStrip hosts={hosts} />
        {!lastKnown && <ExceptionCounts services={services} />}
      </div>
      {rows.length ? (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey="id"
          label="Status entries"
          noun={["entry", "entries"]}
          footer={false}
          groupBy={(row) => row.group}
          groupLabel={sentenceCase}
        />
      ) : (
        <StateNotice kind="empty" title="No services in the catalog" />
      )}
    </VStack>
  );
}

// Connection, freshness and the page frame

const retryable = new Set([
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
};

/**
 * Everything an Observability view reads: the snapshot, the events (when
 * asked for), whether any of it is current, and the clock. A fixture stands
 * in for the reader and is read at its own generated_at, so its clock is
 * fixed and nothing ticks; a live view re-renders only when the sampler
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
      return appendOpsEvents(
        EMPTY_EVENT_LOG,
        parseOpsEvents(props.eventsFixture, 0).items,
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
  const fixedNow =
    props.now ??
    (fixtureMode
      ? preview
        ? Date.parse(preview.generated_at)
        : mounted
      : undefined);
  const snapshot = fixtureMode ? preview : state.snapshot;
  const events = fixtureMode ? previewEvents : state.events;
  const stopped =
    useLiveText(
      (now) => (snapshot && opsSamplerStopped(snapshot, now) ? "stopped" : ""),
      mounted,
      fixedNow,
    ) === "stopped";
  const current = !fixtureMode && state.connection === "connected" && !stopped;
  const retry =
    live && retryable.has(state.connection) ? () => live.start() : undefined;
  return {
    fixtureMode,
    state,
    snapshot,
    events,
    /** The fixed clock for a fixture or a test; undefined when live. */
    fixedNow,
    serverNow: mounted,
    stopped,
    current,
    retry,
  };
}

type OpsData = ReturnType<typeof useOpsData>;

/** An age that changes at most once a minute, so the meta line is quiet. */
function MinuteAgo({ at, data }: { at: number; data: OpsData }) {
  const text = useLiveText(
    (now) => relativeAgo(at, now, "minute"),
    data.serverNow,
    data.fixedNow,
  );
  return <span suppressHydrationWarning>{text}</span>;
}

/** The page's one status line: whether it is live, and the age of what it
 * shows (the snapshot on Status, the newest event elsewhere). */
function opsMeta(data: OpsData, view: OpsView): React.ReactNode {
  if (view === "status" && data.stopped) return "Last known values";
  const at =
    view === "status"
      ? data.snapshot?.generated_at
      : data.events?.recent.at(-1)?.at;
  if (!at) return undefined;
  const what = view === "status" ? "generated" : "latest event";
  const lead = data.fixtureMode
    ? sentenceCase(what)
    : `${data.current ? "Live" : "Not current"}, ${what}`;
  return (
    <>
      {lead} <MinuteAgo at={Date.parse(at)} data={data} />
    </>
  );
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
  unreachable: {
    title: "ap-mini unreachable",
    kept: "ap-mini unreachable",
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
  const notice = data.fixtureMode
    ? undefined
    : CONNECTION_NOTICES[state.connection];
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

/** Loading, shaped like what replaces it: the host line and the rows. */
function OpsSkeleton({ view }: { view: OpsView }) {
  return (
    <VStack gap={5}>
      {view === "status" && (
        <div className="ops-hosts" aria-hidden="true">
          <Skeleton width="16rem" height="var(--spacing-9)" radius={2} />
        </div>
      )}
      <LoadingSkeleton label={OPS_VIEW_TITLES[view].toLowerCase()} rows={8} />
    </VStack>
  );
}

// Activity

/** Rows per step of Activity; "Show more" adds another step. */
const ACTIVITY_STEP = 100;

type ActivityRow = {
  key: string;
  event: OpsEvent;
  source: { id: string; label: string };
  day: string;
} & Record<string, unknown>;

/** A local calendar day, as a sortable key. */
function dayKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Today", "Yesterday", then "Sat, Sep 19". */
function dayLabel(key: string, now: number) {
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now - 86_400_000)) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  return DAY.format(new Date(year!, month! - 1, day!));
}

type Catalog = ReadonlyMap<string, OpsCatalogEntry>;

function catalogOf(snapshot: OpsSnapshot | null): Catalog {
  return new Map((snapshot?.catalog ?? []).map((entry) => [entry.id, entry]));
}

/** An event's tile: the entry's mark for a transition; for a reader access,
 * the device that read, or the tailnet when System names none. */
function eventTile(event: OpsEvent, catalog: Catalog): TileRef {
  if (event.kind === "access")
    return event.device && event.device !== "other"
      ? deviceMark(event.device)
      : { id: "tailscale", kind: "web" };
  const entry = catalog.get(event.subject);
  return opsMark(entry ?? { id: event.subject });
}

function eventTitle(event: OpsEvent, catalog: Catalog, tile: TileRef) {
  if (event.kind === "access") return opsRouteLabel(event.subject);
  const entry = catalog.get(event.subject);
  return entry ? opsName(entry, tile) : event.subject;
}

function eventKind(event: OpsEvent, tile: TileRef, catalog: Catalog) {
  if (event.kind === "access")
    return event.device
      ? `Reader access from ${event.device}`
      : "Reader access";
  if (event.kind === "other") return humanize(event.rawKind);
  const entry = catalog.get(event.subject);
  return entry ? tileKind(entry, tile) : "Transition";
}

/** Line 2: what happened, never the id (that is the tooltip). */
function eventSecondary(event: OpsEvent) {
  if (event.kind === "access") return `${event.ms} ms`;
  if (event.kind === "other")
    return [humanize(event.rawKind), event.detail].filter(Boolean).join(", ");
  return event.detail ?? undefined;
}

function eventTooltip(event: OpsEvent) {
  if (event.kind !== "transition") return event.subject;
  const to = stateLabel(event.to);
  return event.from === null
    ? `${event.subject}\nFirst seen ${to.toLowerCase()}`
    : `${event.subject}\n${stateLabel(event.from)} to ${to.toLowerCase()}`;
}

/** Whether an event has a chip: a non-ok new state, or an access failure. */
function eventHasState(event: OpsEvent) {
  return event.kind === "transition"
    ? !badgeFor("ops", event.to).isDefault
    : event.kind === "access" && event.status >= 400;
}

/** A transition's new state, or an access failure's code. A 2xx or 3xx
 * access needs no chip. */
function EventState({ event }: { event: OpsEvent }) {
  if (event.kind === "transition") return <OpsStateBadge state={event.to} />;
  if (event.kind !== "access" || event.status < 400) return null;
  return (
    <StateBadge
      tone={event.status >= 500 ? "critical" : "warning"}
      label={String(event.status)}
    />
  );
}

function activityColumns(catalog: Catalog): Column<ActivityRow>[] {
  return [
    {
      key: "event",
      header: "Event",
      render: ({ event }) => {
        const tile = eventTile(event, catalog);
        return (
          <RowTitle
            mark={<OpsTile tile={tile} />}
            kind={eventKind(event, tile, catalog)}
            title={eventTitle(event, catalog, tile)}
            tooltip={eventTooltip(event)}
            secondary={eventSecondary(event)}
            mobile={
              eventHasState(event) ? <EventState event={event} /> : undefined
            }
            end={<RelativeTime value={event.at} format="time" />}
          />
        );
      },
    },
    {
      key: "state",
      header: "State",
      width: 128,
      render: ({ event }) => <EventState event={event} />,
    },
    {
      key: "source",
      header: "Source",
      width: 176,
      hideBelow: "large",
      render: ({ source }) => <Text color="secondary">{source.label}</Text>,
    },
    {
      key: "at",
      header: "When",
      width: 96,
      render: ({ event }) => <RelativeTime value={event.at} format="time" />,
    },
  ];
}

function ActivityView({ data }: { data: OpsData }) {
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState(ACTIVITY_STEP);
  const catalog = useMemo(() => catalogOf(data.snapshot), [data.snapshot]);
  const rows = useMemo((): ActivityRow[] => {
    const events = [...(data.events?.recent ?? [])].reverse();
    return events.map((event) => ({
      key: String(event.seq),
      event,
      source: opsActivitySource(event, catalog),
      day: dayKey(Date.parse(event.at)),
    }));
  }, [data.events, catalog]);
  // Each source once, with its count; admin's own polling goes last.
  const sources = useMemo(() => {
    const seen = new Map<string, { label: string; count: number }>();
    for (const { source } of rows) {
      const entry = seen.get(source.id) ?? { label: source.label, count: 0 };
      entry.count += 1;
      seen.set(source.id, entry);
    }
    const polling = (id: string) => (id === OPS_ADMIN_POLLING_SOURCE ? 1 : 0);
    return [...seen].sort(
      (a, b) =>
        polling(a[0]) - polling(b[0]) || a[1].label.localeCompare(b[1].label),
    );
  }, [rows]);
  const columns = useMemo(() => activityColumns(catalog), [catalog]);
  // "All sources" leaves out admin's own ops polling; the menu lists it
  // with its count, so nothing is hidden quietly.
  const everything = rows.filter(
    (row) => row.source.id !== OPS_ADMIN_POLLING_SOURCE,
  );
  const shown =
    source === "all"
      ? everything
      : rows.filter((row) => row.source.id === source);
  const visible = shown.slice(0, limit);
  const today = data.fixedNow ?? Date.now();
  const choose = (next: string) => {
    setSource(next);
    setLimit(ACTIVITY_STEP);
  };
  return (
    <OpsPage
      data={data}
      view="activity"
      count={shown.length}
      retained
      actions={
        <FilterMenu
          label="Source"
          icon={BroadcastIcon}
          value={
            source === "all"
              ? "All"
              : (sources.find(([id]) => id === source)?.[1].label ?? "Source")
          }
          isActive={source !== "all"}
        >
          <DropdownMenuRadioGroup
            label="Event source"
            value={source}
            onChange={choose}
          >
            <DropdownMenuRadioItem
              value="all"
              label="All sources"
              endContent={<MenuCount value={everything.length} />}
            />
            {sources.map(([id, { label, count }]) => (
              <DropdownMenuRadioItem
                key={id}
                value={id}
                label={label}
                endContent={<MenuCount value={count} />}
              />
            ))}
          </DropdownMenuRadioGroup>
        </FilterMenu>
      }
    >
      {visible.length ? (
        <VStack gap={4}>
          <DataTable
            rows={visible}
            columns={columns}
            rowKey="key"
            label="Activity, newest first"
            noun={["event", "events"]}
            footer={false}
            interactive={false}
            groupBy={(row) => row.day}
            groupLabel={(key) => dayLabel(key, today)}
          />
          {shown.length > visible.length && (
            <Button
              label="Show more"
              size="sm"
              variant="secondary"
              onClick={() => setLimit((value) => value + ACTIVITY_STEP)}
            />
          )}
        </VStack>
      ) : (
        <StateNotice
          kind="empty"
          icon={ListBulletsIcon}
          title={rows.length ? "No events from this source" : "No events yet"}
          action={
            rows.length ? (
              <Button
                label="All sources"
                size="sm"
                onClick={() => choose("all")}
              />
            ) : undefined
          }
        />
      )}
    </OpsPage>
  );
}

function MenuCount({ value }: { value: number }) {
  return <span className="ops-menu-count workspace-figure">{value}</span>;
}

// Alerts

export type AlertRow = OpsAlert & {
  name: string;
  kind: string | null;
  runbook: string | null;
} & Record<string, unknown>;

/** Alerts with the catalog's name, kind and runbook, firing first. */
export function opsAlertRows(
  events: OpsEventLog | null,
  snapshot: OpsSnapshot | null,
): AlertRow[] {
  const catalog = catalogOf(snapshot);
  return deriveOpsAlerts(events?.transitions ?? []).map((alert) => {
    const entry = catalog.get(alert.subject);
    return {
      ...alert,
      name: entry ? opsName(entry) : alert.subject,
      kind: entry?.kind ?? null,
      runbook: entry?.runbook ?? null,
    };
  });
}

/** An alert opens in admin first; its runbook is an action there. */
export function opsAlertHref(subject: string) {
  return `/observability/alerts?alert=${encodeURIComponent(subject)}`;
}

/** The alert a URL opens, when it names a well-formed catalog id. */
export function opsAlertParam(search: string): string | null {
  const id = new URLSearchParams(search).get("alert");
  return id && OPS_V1_BOUNDS.id.test(id) ? id : null;
}

/**
 * Firing or resolved alerts in the compact row every admin table uses. The
 * whole row opens the alert in admin; on the Alerts page it opens in place.
 * Firing rows read their state and since when; resolved rows read the state
 * they were in and when it cleared.
 */
export function AlertsTable({
  rows,
  resolved = false,
  now,
  selected,
  onSelect,
}: {
  rows: AlertRow[];
  resolved?: boolean;
  now?: number;
  selected?: string | null;
  onSelect?: (subject: string, trigger: HTMLElement) => void;
}) {
  const columns: Column<AlertRow>[] = [
    {
      key: "alert",
      header: "Alert",
      render: (row) => {
        const tile = opsMark({ id: row.subject, kind: row.kind });
        return (
          <RowTitle
            mark={<OpsTile tile={tile} />}
            kind={markLabel(tile) ?? sentenceCase(row.kind ?? "alert")}
            title={row.name}
            href={opsAlertHref(row.subject)}
            onSelect={
              onSelect ? (trigger) => onSelect(row.subject, trigger) : undefined
            }
            isPressed={onSelect ? selected === row.subject : undefined}
            controls={
              onSelect && selected === row.subject ? ALERT_DETAIL : undefined
            }
            tooltip={row.detail ? `${row.subject}\n${row.detail}` : row.subject}
            mobile={
              <>
                <AlertState row={row} />
                {row.detail && (
                  <Text
                    type="supporting"
                    color="secondary"
                    className="ops-reason"
                  >
                    {row.detail}
                  </Text>
                )}
              </>
            }
            end={
              <RelativeTime
                value={resolved ? row.resolvedAt : row.since}
                now={now}
              />
            }
          />
        );
      },
    },
    {
      key: "state",
      header: "State",
      width: 144,
      render: (row) => <AlertState row={row} />,
    },
    {
      key: resolved ? "resolved" : "since",
      header: resolved ? "Resolved" : "Since",
      width: 112,
      render: (row) => (
        <RelativeTime value={resolved ? row.resolvedAt : row.since} now={now} />
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey="subject"
      label={resolved ? "Resolved alerts" : "Firing alerts"}
      noun={["alert", "alerts"]}
      footer={false}
    />
  );
}

/** A firing alert's state chip; a resolved one names the state it was in,
 * with no chip, since it is no longer an exception. */
function AlertState({ row }: { row: AlertRow }) {
  return row.status === "firing" ? (
    <OpsStateBadge state={row.state} />
  ) : (
    <Text type="supporting" color="secondary">
      {stateLabel(row.state)}
    </Text>
  );
}

const ALERT_DETAIL = "ops-alert-detail";

/** The open alert: its state and times, its recent transitions, and the
 * runbook and Status entry as actions. */
function AlertDetail({
  row,
  data,
  onClose,
  panelRef,
}: {
  row: AlertRow;
  data: OpsData;
  onClose: () => void;
  panelRef: React.Ref<HTMLElement>;
}) {
  const link = row.runbook ? runbook(row.runbook) : null;
  const history = useMemo(
    () =>
      (data.events?.transitions ?? [])
        .filter((event) => event.subject === row.subject)
        .slice(-8)
        .reverse()
        .map((event) => ({ ...event, key: String(event.seq) })),
    [data.events, row.subject],
  );
  const firing = row.status === "firing";
  // A firing alert's state is its badge; a resolved one names what it was.
  const fields: Array<[string, React.ReactNode]> = firing
    ? []
    : [["Problem", stateLabel(row.state)]];
  fields.push([
    firing ? "Since" : "Began",
    <RelativeTime value={row.since} now={data.fixedNow} />,
  ]);
  if (row.resolvedAt)
    fields.push([
      "Resolved",
      <RelativeTime value={row.resolvedAt} now={data.fixedNow} />,
    ]);
  if (row.detail) fields.push(["Detail", row.detail]);
  fields.push(["Entry", <code className="ops-id">{row.subject}</code>]);
  return (
    <DetailPanel
      id={ALERT_DETAIL}
      panelRef={panelRef}
      title={row.name}
      badge={
        firing ? (
          <OpsStateBadge state={row.state} />
        ) : (
          <StateBadge domain="alert" state="resolved" />
        )
      }
      back={
        <div className="ops-detail-back">
          <Button
            label="Back to alerts"
            tooltip="Back to alerts"
            isIconOnly
            size="sm"
            variant="ghost"
            icon={<ArrowBendUpLeftIcon weight="regular" aria-hidden="true" />}
            onClick={onClose}
          />
        </div>
      }
      fields={fields}
    >
      <HStack gap={2} wrap="wrap">
        {link && (
          <Button
            label={link.where}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            variant="secondary"
            icon={
              <BrandTile id={linkMark(link.href).id} kind="web" size={20} />
            }
          />
        )}
        <Button
          label="Open in Status"
          href={`/observability/status#${opsEntryAnchor(row.subject)}`}
          size="sm"
          variant="ghost"
          icon={<PulseIcon weight="regular" aria-hidden="true" />}
        />
      </HStack>
      {history.length > 0 && (
        <WorkspaceSection title="History">
          <DataTable
            rows={history}
            rowKey="key"
            label={`${row.name} history`}
            noun={["change", "changes"]}
            footer={false}
            interactive={false}
            columns={[
              {
                key: "change",
                header: "Change",
                render: (event: OpsTransitionEvent) => (
                  <RowTitle
                    kind="Transition"
                    title={
                      event.from === null
                        ? `First seen ${stateLabel(event.to).toLowerCase()}`
                        : `${stateLabel(event.from)} to ${stateLabel(event.to).toLowerCase()}`
                    }
                    secondary={event.detail ?? undefined}
                    end={<RelativeTime value={event.at} now={data.fixedNow} />}
                  />
                ),
              },
              {
                key: "at",
                header: "When",
                width: 112,
                render: (event: OpsTransitionEvent) => (
                  <RelativeTime value={event.at} now={data.fixedNow} />
                ),
              },
            ]}
          />
        </WorkspaceSection>
      )}
    </DetailPanel>
  );
}

/** Which alert is open, kept in the URL (`?alert=`) with real history:
 * opening pushes, Back or Escape closes, and focus returns to the row. */
function useAlertSelection(initial: string | null) {
  const [selected, setSelected] = useState(initial);
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);
  useEffect(() => {
    const read = () => {
      const next = opsAlertParam(window.location.search);
      setSelected(next);
      if (!next) trigger.current?.focus({ preventScroll: true });
    };
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const node = panel.current;
    node?.scrollIntoView?.({ block: "start" });
    node?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
    // `close` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const open = (subject: string, from: HTMLElement) => {
    trigger.current = from;
    if (subject === selected) return;
    window.history.pushState({ opsAlert: subject }, "", opsAlertHref(subject));
    pushed.current = true;
    setSelected(subject);
  };
  function close() {
    if (pushed.current && window.history.state?.opsAlert) {
      pushed.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", "/observability/alerts");
    setSelected(null);
    trigger.current?.focus({ preventScroll: true });
  }
  return { selected, open, close, panel };
}

function AlertsView({
  data,
  initial,
}: {
  data: OpsData;
  initial: string | null;
}) {
  const rows = useMemo(
    () => opsAlertRows(data.events, data.snapshot),
    [data.events, data.snapshot],
  );
  const { selected, open, close, panel } = useAlertSelection(initial);
  const firing = rows.filter((row) => row.status === "firing");
  const resolved = rows.filter((row) => row.status === "resolved");
  const current = selected
    ? rows.find((row) => row.subject === selected)
    : undefined;
  return (
    <OpsPage data={data} view="alerts" retained>
      {rows.length ? (
        <div
          className="workspace-split"
          data-detail-open={current ? "true" : "false"}
        >
          <VStack gap={6} className="workspace-split-list">
            <WorkspaceSection
              title="Firing"
              meta={firing.length ? String(firing.length) : undefined}
            >
              {firing.length ? (
                <AlertsTable
                  rows={firing}
                  now={data.fixedNow}
                  selected={selected}
                  onSelect={open}
                />
              ) : (
                <StateNotice
                  kind="empty"
                  icon={BellSimpleIcon}
                  title="Nothing firing"
                />
              )}
            </WorkspaceSection>
            {resolved.length > 0 && (
              <WorkspaceSection title="Resolved" meta={String(resolved.length)}>
                <AlertsTable
                  rows={resolved}
                  resolved
                  now={data.fixedNow}
                  selected={selected}
                  onSelect={open}
                />
              </WorkspaceSection>
            )}
          </VStack>
          {current && (
            <AlertDetail
              row={current}
              data={data}
              onClose={close}
              panelRef={panel}
            />
          )}
        </div>
      ) : (
        <StateNotice kind="empty" icon={BellSimpleIcon} title="No alerts" />
      )}
    </OpsPage>
  );
}

// Views

/** Title, count, the live line, the one notice, then the view. */
function OpsPage({
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
    <div className="operations-workspace">
      <WorkspacePage
        title={OPS_VIEW_TITLES[view]}
        count={count}
        meta={retained ? opsMeta(data, view) : undefined}
        badge={data.fixtureMode ? <SampleBadge /> : undefined}
        actions={actions}
      >
        <OpsNotice data={data} view={view} retained={retained} />
        {children}
      </WorkspacePage>
    </div>
  );
}

function StatusView({ data }: { data: OpsData }) {
  const services = useMemo(
    () => (data.snapshot ? opsView(data.snapshot, data.stopped) : []),
    [data.snapshot, data.stopped],
  );
  return (
    <OpsPage data={data} view="status" count={services.length} retained>
      <StatusBody
        services={services}
        now={data.fixedNow}
        lastKnown={data.stopped}
      />
    </OpsPage>
  );
}

/**
 * Observability's three views. `enabled` is true only when the server's
 * PRIVATE_READER_ENABLED and PRIVATE_READER_OPS_ENABLED flags are both
 * "true". Fixtures are the development-only previews and never ship.
 */
export function ObservabilityWorkspace({
  view = "status",
  alert = null,
  ...props
}: OpsViewProps & { view?: OpsView; alert?: string | null }) {
  const data = useOpsData(props, view !== "status");
  // Activity and Alerts read the catalog for names and runbooks; with no
  // snapshot and no events there is nothing to show but the notice.
  const eventsRead =
    Boolean(data.events) &&
    (data.fixtureMode ||
      data.state.checkedAt !== null ||
      (data.events?.cursor ?? 0) > 0);
  const hasData = view === "status" ? Boolean(data.snapshot) : eventsRead;
  if (hasData && view === "status") return <StatusView data={data} />;
  if (hasData && view === "activity") return <ActivityView data={data} />;
  if (hasData && view === "alerts")
    return <AlertsView data={data} initial={alert} />;
  const waiting =
    !data.fixtureMode &&
    (data.state.connection === "idle" ||
      data.state.connection === "connecting" ||
      (view !== "status" &&
        data.state.connection === "connected" &&
        !data.state.eventsStale));
  return (
    <OpsPage data={data} view={view} retained={false}>
      {waiting && <OpsSkeleton view={view} />}
      {data.fixtureMode && (
        <StateNotice
          kind="error"
          icon={WarningCircleIcon}
          title="Fixture rejected"
        />
      )}
    </OpsPage>
  );
}
