import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowClockwiseIcon,
  BellSimpleIcon,
  ClockCounterClockwiseIcon,
  KeyIcon,
  LinkBreakIcon,
  MoonIcon,
  PlugsIcon,
  PulseIcon,
  ShieldWarningIcon,
  SparkleIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  OPS_V1_STATES,
  formatDuration,
  opsFreshness,
  opsIsHost,
  opsOrdered,
  opsRenderedCounts,
  opsRunbookHref,
  opsSamplerStopped,
  opsServices,
  opsSnapshotAge,
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
  opsAccessSummary,
  opsActivitySource,
  parseOpsEvents,
  type OpsAlert,
  type OpsEvent,
  type OpsEventLog,
} from "../../lib/ops-events";
import {
  useOpsStatus,
  type OpsStatusController,
  type OpsStatusState,
} from "../../lib/ops-reader";
import {
  DataTable,
  InlineNotice,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateNotice,
  WorkspacePage,
  WorkspaceSection,
  FilterBar,
  SampleBadge,
  type Column,
  type Tone,
} from "../workspace/Workspace";
import "./operations-workspace.css";

/**
 * The state is always spoken as text. The dot adds colour for sighted
 * scanning and is hidden from assistive technology. Neither `unknown` nor
 * `asleep` ever takes the ok treatment. `asleep` (ap-pro at night) is calm:
 * a moon in place of the dot, so it reads apart from failing and unknown.
 */
export const STATE_PRESENTATION: Record<
  OpsState,
  {
    label: string;
    variant: "success" | "warning" | "error" | "neutral";
    tone: Tone;
  }
> = {
  ok: { label: "OK", variant: "success", tone: "positive" },
  degraded: { label: "Degraded", variant: "warning", tone: "warning" },
  failing: { label: "Failing", variant: "error", tone: "critical" },
  stale: { label: "Stale", variant: "warning", tone: "warning" },
  asleep: { label: "Asleep", variant: "neutral", tone: "calm" },
  unknown: { label: "Unknown", variant: "neutral", tone: "neutral" },
};

export function OpsStateBadge({ state }: { state: OpsState }) {
  const { label, tone } = STATE_PRESENTATION[state];
  return (
    <span className="ops-state" data-state={state}>
      <StateBadge
        tone={tone}
        label={label}
        icon={
          state === "asleep" ? (
            <MoonIcon
              weight="regular"
              aria-hidden="true"
              className="ops-asleep-mark"
            />
          ) : undefined
        }
      />
    </span>
  );
}

function ago(seconds: number) {
  return seconds < 5 ? "just now" : `${formatDuration(seconds)} ago`;
}

function Freshness({ service, now }: { service: OpsServiceView; now: number }) {
  const freshness = opsFreshness(service, now);
  if (freshness.kind === "never")
    return <Text color="secondary">No success recorded</Text>;
  return (
    <VStack gap={0}>
      <Text className="workspace-time">{ago(freshness.ageSeconds)}</Text>
      {freshness.kind === "liveness" ? (
        // A null budget is never judged stale: services by liveness, and
        // irregular jobs (health ingest follows phone use) by age alone.
        <Text type="supporting" color="secondary">
          {service.kind === "service" ? "Liveness only" : "No freshness budget"}
        </Text>
      ) : freshness.overBudget ? (
        <Text type="supporting" weight="semibold">
          Over its {formatDuration(freshness.budgetSeconds)} budget
        </Text>
      ) : (
        <Text type="supporting" color="secondary">
          Within its {formatDuration(freshness.budgetSeconds)} budget
        </Text>
      )}
    </VStack>
  );
}

function lastSuccessLine(service: OpsServiceView, now: number) {
  const freshness = opsFreshness(service, now);
  return freshness.kind === "never"
    ? "No success recorded"
    : `Last success ${ago(freshness.ageSeconds)}`;
}

function detailOf(service: OpsServiceView) {
  return service.missingStatus
    ? "No status row from System"
    : service.status.detail;
}

function Runbook({ runbook, name }: { runbook: string; name: string }) {
  return (
    <Link
      href={opsRunbookHref(runbook)}
      isExternalLink
      referrerPolicy="no-referrer"
      className="ops-runbook"
      aria-label={`Runbook for ${name}`}
    >
      Runbook
    </Link>
  );
}

type Row = OpsServiceView & Record<string, unknown>;

function statusColumns(services: Row[], now: number): Column<Row>[] {
  return [
    {
      key: "name",
      header: "Service",
      render: (row) => (
        <RowTitle
          icon={PulseIcon}
          kind={row.kind}
          title={row.name}
          secondary={<span className="ops-id">{row.id}</span>}
          mobile={
            <>
              <OpsStateBadge state={row.status.state} />
              <Text
                type="supporting"
                color="secondary"
                className="workspace-time"
              >
                {lastSuccessLine(row, now)}
              </Text>
            </>
          }
        />
      ),
    },
    {
      key: "state",
      header: "State",
      width: 208,
      render: (row) => (
        <VStack gap={1}>
          <OpsStateBadge state={row.status.state} />
          <Text type="supporting" color="secondary">
            {detailOf(row)}
          </Text>
        </VStack>
      ),
    },
    {
      key: "last_success",
      header: "Last success",
      width: 176,
      render: (row) => <Freshness service={row} now={now} />,
    },
    // Schedule is optional in ops_v1; the column shows only when at least
    // one entry carries it.
    ...(services.some((row) => row.schedule)
      ? [
          {
            key: "schedule",
            header: "Schedule",
            width: 128,
            hideBelow: 1440 as const,
            render: (row: Row) =>
              row.schedule ? (
                <Text>{row.schedule}</Text>
              ) : (
                <Text color="secondary">Not set</Text>
              ),
          },
        ]
      : []),
    {
      key: "last_exit",
      header: "Last exit",
      width: 88,
      hideBelow: 1024,
      render: (row) =>
        row.status.last_exit === null ? (
          <Text color="secondary">None</Text>
        ) : (
          <Text className="workspace-figure">{row.status.last_exit}</Text>
        ),
    },
    {
      key: "owner",
      header: "Owner",
      width: 104,
      hideBelow: 1440,
      render: (row) => <Text>{row.owner}</Text>,
    },
    {
      key: "runbook",
      header: "Runbook",
      width: 96,
      render: (row) => <Runbook runbook={row.runbook} name={row.name} />,
    },
  ];
}

function HostStrip({ hosts, now }: { hosts: OpsServiceView[]; now: number }) {
  if (!hosts.length) return null;
  return (
    <ul className="workspace-tiles ops-host-strip" aria-label="Hosts">
      {hosts.map((host) => {
        return (
          <li
            key={host.id}
            className="workspace-tile ops-host"
            data-state={host.status.state}
          >
            <VStack gap={2}>
              <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                <Text weight="semibold">{host.name}</Text>
                <OpsStateBadge state={host.status.state} />
              </HStack>
              <Text type="supporting" color="secondary">
                {detailOf(host)}
              </Text>
              <Text
                type="supporting"
                color="secondary"
                className="workspace-time"
              >
                {lastSuccessLine(host, now)}
              </Text>
            </VStack>
          </li>
        );
      })}
    </ul>
  );
}

/** "14 entries: 9 ok, 1 degraded" in the order the states are defined. */
export function opsCountsSummary(services: OpsServiceView[]) {
  const counts = opsRenderedCounts(services);
  const parts = OPS_V1_STATES.filter((state) => counts[state] > 0).map(
    (state) =>
      `${counts[state]} ${STATE_PRESENTATION[state].label.toLowerCase()}`,
  );
  return `${services.length} ${services.length === 1 ? "entry" : "entries"}: ${parts.join(", ")}`;
}

/**
 * Once the sampler stops, no value is current and none may read as ok:
 * every entry shows as unknown, with what System last reported kept as
 * detail.
 */
function asLastKnown(service: OpsServiceView): OpsServiceView {
  const was = STATE_PRESENTATION[service.status.state].label;
  return {
    ...service,
    status: {
      ...service.status,
      state: "unknown",
      detail: service.missingStatus
        ? "No status row from System"
        : `Last known ${was.toLowerCase()}: ${service.status.detail}`,
    },
    missingStatus: false,
  };
}

/** Services in display order, as last known once the sampler stops. */
export function opsView(snapshot: OpsSnapshot, lastKnown: boolean) {
  const ordered = opsOrdered(opsServices(snapshot));
  return lastKnown ? ordered.map(asLastKnown) : ordered;
}

function StatusBody({
  snapshot,
  now,
  lastKnown,
}: {
  snapshot: OpsSnapshot;
  now: number;
  lastKnown: boolean;
}) {
  const services = useMemo(
    () => opsView(snapshot, lastKnown),
    [snapshot, lastKnown],
  );
  const hosts = services.filter(opsIsHost);
  const rows = services.filter((service) => !opsIsHost(service)) as Row[];
  const groups = [...new Set(rows.map((row) => row.group))];
  const columns = statusColumns(rows, now);
  return (
    <VStack gap={6}>
      <Text color="secondary" className="ops-summary workspace-figure">
        {lastKnown
          ? `${services.length} ${services.length === 1 ? "entry" : "entries"}, none current until the sampler resumes`
          : opsCountsSummary(services)}
      </Text>
      <HostStrip hosts={hosts} now={now} />
      {rows.length ? (
        groups.map((group) => {
          const members = rows.filter((row) => row.group === group);
          return (
            <WorkspaceSection
              key={group}
              title={group.charAt(0).toUpperCase() + group.slice(1)}
              meta={`${members.length} ${members.length === 1 ? "entry" : "entries"}`}
            >
              <DataTable
                rows={members}
                columns={columns}
                rowKey="id"
                label={`${group} services`}
                noun={["entry", "entries"]}
                footer={false}
                interactive={false}
              />
            </WorkspaceSection>
          );
        })
      ) : (
        <StateNotice kind="empty" title="No services in the catalog." />
      )}
    </VStack>
  );
}

const retryable = new Set([
  "unreachable",
  "unavailable",
  "rejected",
  "denied",
  "ended",
]);

/** Reader connection states, in the kit's notices. Retained content keeps an
 * inline notice above it; with nothing to show, the notice stands alone. */
export function ConnectionNotice({
  state,
  onRetry,
}: {
  state: OpsStatusState;
  onRetry?: () => void;
}) {
  const retry = onRetry ? (
    <Button
      label={state.connection === "ended" ? "Open again" : "Try again"}
      size="sm"
      variant="secondary"
      icon={<ArrowClockwiseIcon weight="regular" aria-hidden="true" />}
      onClick={onRetry}
    />
  ) : undefined;
  switch (state.connection) {
    case "off":
      return (
        <StateNotice
          kind="not-connected"
          icon={PlugsIcon}
          title="Not connected."
        />
      );
    case "idle":
    case "connecting":
      return state.snapshot ? null : (
        <Text role="status" color="secondary">
          Connecting to the reader on ap-mini
        </Text>
      );
    case "unreachable":
      return state.snapshot ? (
        <InlineNotice
          tone="warning"
          icon={LinkBreakIcon}
          title="Reader unreachable. Showing the last snapshot."
          action={retry}
        />
      ) : (
        <StateNotice
          kind="not-connected"
          title="Not connected."
          action={retry}
        />
      );
    case "unavailable":
      return state.snapshot ? (
        <InlineNotice
          tone="warning"
          title="No current snapshot. Showing the last one."
          action={retry}
        />
      ) : (
        <StateNotice kind="error" title="No snapshot yet." action={retry} />
      );
    case "rejected":
      return (
        <StateNotice kind="error" title="Snapshot rejected." action={retry} />
      );
    case "denied":
      return (
        <StateNotice
          kind="error"
          icon={ShieldWarningIcon}
          title="Access refused."
          action={retry}
        />
      );
    case "ended":
      return (
        <StateNotice
          kind="not-connected"
          title="Session ended."
          action={retry}
        />
      );
    default:
      return null;
  }
}

/**
 * The clock for ages. It starts at the server's render time so hydration
 * matches, then ticks while the tab is visible. A fixed clock never ticks.
 */
export function useNow(fixed?: number, renderedAt?: number) {
  const [now, setNow] = useState(() => fixed ?? renderedAt ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    tick();
    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fixed]);
  return now;
}

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
 * asked for), the clock and whether any of it is current. A fixture stands
 * in for the reader and is read at its own generated_at.
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
  const clock = useNow(props.now, props.renderedAt);
  const now =
    preview && props.now === undefined
      ? Date.parse(preview.generated_at)
      : clock;
  const snapshot = fixtureMode ? preview : state.snapshot;
  const events = fixtureMode ? previewEvents : state.events;
  const generatedAge = snapshot ? opsSnapshotAge(snapshot, now) : null;
  const stopped = snapshot ? opsSamplerStopped(snapshot, now) : false;
  const current = !fixtureMode && state.connection === "connected" && !stopped;
  const retry =
    live && retryable.has(state.connection) ? () => live.start() : undefined;
  return {
    fixtureMode,
    state,
    snapshot,
    events,
    now,
    generatedAge,
    stopped,
    current,
    retry,
  };
}

type OpsData = ReturnType<typeof useOpsData>;

function generatedLine(data: OpsData) {
  if (data.generatedAge === null) return undefined;
  if (data.stopped) return "Last known values";
  if (data.fixtureMode) return `Generated ${ago(data.generatedAge)}`;
  return `${data.current ? "Live" : "Not current"}, generated ${ago(data.generatedAge)}`;
}

function SamplerStopped({ data }: { data: OpsData }) {
  if (!data.stopped || data.generatedAge === null) return null;
  return (
    <InlineNotice
      tone="warning"
      icon={ClockCounterClockwiseIcon}
      title={`Sampler stopped ${ago(data.generatedAge)}`}
    />
  );
}

/** The part of a view that is not the data: connection and staleness. */
function OpsNotices({ data }: { data: OpsData }) {
  return (
    <>
      <SamplerStopped data={data} />
      {!data.fixtureMode && (
        <ConnectionNotice state={data.state} onRetry={data.retry} />
      )}
      {!data.fixtureMode && data.state.eventsStale && data.events && (
        <InlineNotice tone="warning" title="Events not current." />
      )}
    </>
  );
}

const EVENT_ICONS: Record<OpsEvent["kind"], Icon> = {
  transition: PulseIcon,
  access: KeyIcon,
  other: SparkleIcon,
};

type ActivityRow = { key: string; event: OpsEvent; source: string } & Record<
  string,
  unknown
>;

function eventTitle(event: OpsEvent, catalog: Map<string, OpsCatalogEntry>) {
  if (event.kind === "access") return opsAccessSummary(event);
  const name = catalog.get(event.subject)?.name ?? event.subject;
  if (event.kind === "other") return `${name}: ${event.rawKind}`;
  const to = STATE_PRESENTATION[event.to].label.toLowerCase();
  return event.from === null
    ? `${name}: first seen ${to}`
    : `${name}: ${STATE_PRESENTATION[event.from].label.toLowerCase()} to ${to}`;
}

function eventSecondary(event: OpsEvent) {
  if (event.kind === "access") return undefined;
  return event.detail ? `${event.subject}, ${event.detail}` : event.subject;
}

function ActivityBody({ data }: { data: OpsData }) {
  const [source, setSource] = useState("all");
  const catalog = useMemo(
    () => new Map((data.snapshot?.catalog ?? []).map((e) => [e.id, e])),
    [data.snapshot],
  );
  const rows = useMemo((): ActivityRow[] => {
    const events = [...(data.events?.recent ?? [])].reverse();
    return events.map((event) => ({
      key: String(event.seq),
      event,
      source: opsActivitySource(event, catalog).id,
    }));
  }, [data.events, catalog]);
  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const found = opsActivitySource(row.event, catalog);
      seen.set(found.id, found.label);
    }
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, catalog]);
  const shown =
    source === "all" ? rows : rows.filter((row) => row.source === source);
  const sourceLabel = new Map(sources);
  const columns: Column<ActivityRow>[] = [
    {
      key: "event",
      header: "Event",
      render: ({ event }) => (
        <RowTitle
          icon={EVENT_ICONS[event.kind]}
          kind={event.kind === "access" ? "Reader access" : "Transition"}
          title={eventTitle(event, catalog)}
          secondary={eventSecondary(event)}
        />
      ),
    },
    {
      key: "state",
      header: "State",
      width: 140,
      hideBelow: 1024,
      render: ({ event }) =>
        event.kind === "transition" ? (
          <OpsStateBadge state={event.to} />
        ) : event.kind === "access" ? (
          <StateBadge
            tone={
              event.status >= 500
                ? "critical"
                : event.status >= 400
                  ? "warning"
                  : "neutral"
            }
            label={String(event.status)}
          />
        ) : null,
    },
    {
      key: "source",
      header: "Source",
      width: 176,
      hideBelow: 1280,
      render: ({ source: id }) => (
        <Text color="secondary">{sourceLabel.get(id) ?? id}</Text>
      ),
    },
    {
      key: "at",
      header: "When",
      width: 112,
      render: ({ event }) => <RelativeTime value={event.at} />,
    },
  ];
  return (
    <VStack gap={5}>
      <FilterBar>
        <DropdownMenu
          button={{
            label:
              source === "all"
                ? "Source"
                : (sourceLabel.get(source) ?? "Source"),
            tooltip: `Source: ${source === "all" ? "All" : sourceLabel.get(source)}`,
            size: "sm",
            variant: "secondary",
          }}
          menuWidth="max-content"
        >
          <DropdownMenuRadioGroup
            label="Event source"
            value={source}
            onChange={setSource}
          >
            <DropdownMenuRadioItem value="all" label="All sources" />
            {sources.map(([id, label]) => (
              <DropdownMenuRadioItem key={id} value={id} label={label} />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      </FilterBar>
      {shown.length ? (
        <DataTable
          rows={shown}
          columns={columns}
          rowKey="key"
          label="Activity, newest first"
          noun={["event", "events"]}
          interactive={false}
        />
      ) : (
        <StateNotice
          kind="empty"
          title={rows.length ? "No events from this source." : "No events yet."}
          action={
            rows.length ? (
              <Button
                label="All sources"
                size="sm"
                onClick={() => setSource("all")}
              />
            ) : undefined
          }
        />
      )}
    </VStack>
  );
}

type AlertRow = OpsAlert & { name: string; runbook: string | null } & Record<
    string,
    unknown
  >;

/** Alerts with the catalog's name and runbook, firing first. */
export function opsAlertRows(
  events: OpsEventLog | null,
  snapshot: OpsSnapshot | null,
): AlertRow[] {
  const catalog = new Map((snapshot?.catalog ?? []).map((e) => [e.id, e]));
  return deriveOpsAlerts(events?.transitions ?? []).map((alert) => ({
    ...alert,
    name: catalog.get(alert.subject)?.name ?? alert.subject,
    runbook: catalog.get(alert.subject)?.runbook ?? null,
  }));
}

export function AlertsTable({
  rows,
  compact = false,
}: {
  rows: AlertRow[];
  compact?: boolean;
}) {
  const columns: Column<AlertRow>[] = [
    {
      key: "entry",
      header: "Entry",
      render: (row) => (
        <RowTitle
          icon={BellSimpleIcon}
          kind={row.status === "firing" ? "Firing alert" : "Resolved alert"}
          title={row.name}
          secondary={row.detail ? `${row.subject}, ${row.detail}` : row.subject}
          mobile={
            <>
              <AlertState row={row} />
              <RelativeTime value={row.since} />
            </>
          }
        />
      ),
    },
    {
      key: "state",
      header: "State",
      width: 160,
      render: (row) => <AlertState row={row} />,
    },
    {
      key: "since",
      header: "Since",
      width: 112,
      hideBelow: 1024,
      render: (row) => <RelativeTime value={row.since} />,
    },
    ...(compact
      ? []
      : [
          {
            key: "resolved",
            header: "Resolved",
            width: 112,
            hideBelow: 1024 as const,
            render: (row: AlertRow) =>
              row.resolvedAt ? (
                <RelativeTime value={row.resolvedAt} />
              ) : (
                <Text color="secondary">Firing</Text>
              ),
          },
        ]),
    {
      key: "runbook",
      header: "Runbook",
      width: 96,
      render: (row) =>
        row.runbook ? (
          <Runbook runbook={row.runbook} name={row.name} />
        ) : (
          <Text color="secondary">None</Text>
        ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey="subject"
      label={compact ? "Firing alerts" : "Alerts, firing first"}
      noun={["alert", "alerts"]}
      interactive={false}
      footer={!compact}
      figures={
        compact
          ? undefined
          : [
              ["firing", rows.filter((row) => row.status === "firing").length],
              [
                "resolved",
                rows.filter((row) => row.status === "resolved").length,
              ],
            ]
      }
    />
  );
}

function AlertState({ row }: { row: AlertRow }) {
  return row.status === "firing" ? (
    <OpsStateBadge state={row.state} />
  ) : (
    <StateBadge tone="positive" label="Resolved" />
  );
}

function AlertsBody({ data }: { data: OpsData }) {
  const rows = useMemo(
    () => opsAlertRows(data.events, data.snapshot),
    [data.events, data.snapshot],
  );
  return rows.length ? (
    <AlertsTable rows={rows} />
  ) : (
    <StateNotice kind="empty" icon={BellSimpleIcon} title="No alerts." />
  );
}

const TITLES = { status: "Status", activity: "Activity", alerts: "Alerts" };

/**
 * Observability, read-only, on System's ops_v1 snapshot and ops_events_v1
 * feed. Status shows the snapshot; Activity and Alerts also read events.
 *
 * `enabled` is true only when the server's PRIVATE_READER_ENABLED and
 * PRIVATE_READER_OPS_ENABLED flags are both "true". Fixtures are the
 * development-only previews and never ship.
 */
export function ObservabilityWorkspace({
  view = "status",
  ...props
}: OpsViewProps & { view?: keyof typeof TITLES }) {
  const data = useOpsData(props, view !== "status");
  // Activity and Alerts read the catalog for names and runbooks; with no
  // snapshot and no events there is nothing to show but the notice.
  const eventsRead =
    Boolean(data.events) &&
    (data.fixtureMode ||
      data.state.checkedAt !== null ||
      (data.events?.cursor ?? 0) > 0);
  const hasData = view === "status" ? Boolean(data.snapshot) : eventsRead;
  return (
    <div className="operations-workspace">
      <WorkspacePage
        title={TITLES[view]}
        meta={generatedLine(data)}
        badge={data.fixtureMode ? <SampleBadge /> : undefined}
      >
        <OpsNotices data={data} />
        {hasData && view === "status" && data.snapshot && (
          <StatusBody
            snapshot={data.snapshot}
            now={data.now}
            lastKnown={data.stopped}
          />
        )}
        {hasData && view === "activity" && <ActivityBody data={data} />}
        {hasData && view === "alerts" && <AlertsBody data={data} />}
        {!hasData && data.fixtureMode && (
          <StateNotice
            kind="error"
            icon={WarningCircleIcon}
            title="Fixture rejected."
          />
        )}
      </WorkspacePage>
    </div>
  );
}
