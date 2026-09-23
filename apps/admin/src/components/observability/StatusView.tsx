import React, { useEffect, useMemo } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import {
  CircleDashedIcon,
  ClockIcon,
  HardDrivesIcon,
  MoonIcon,
  SunIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import { brandMark } from "@anipotts/brand/marks";
import {
  opsIsHost,
  opsOrdered,
  opsRenderedCounts,
  opsServices,
  type OpsServiceView,
  type OpsSnapshot,
  type OpsState,
} from "../../lib/ops-v1";
import {
  opsHostFacts,
  opsUnverified,
  opsSyncState,
  opsSyncRows,
  type OpsSyncRow,
  type OpsSyncState,
} from "../../lib/ops-view";
import {
  HEALTH_METRICS_ID,
  healthMetricsText,
  parseHealthMetrics,
} from "../../lib/health-metrics";
import { useLiveText } from "../../lib/live-clock";
import { deviceName } from "../../lib/naming";
import { sentenceCase } from "../../lib/sentence-case";
import { BrandTile } from "../BrandTile";
import { SplitView, useSplitView } from "../astryx/SplitView";
import {
  CELL_WIDTHS,
  CompactOnly,
  DataTable,
  DetailText,
  Duration,
  Figure,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateCell,
  StateNotice,
  TitleText,
  WorkspaceSection,
  badgeFor,
  leadWidth,
  type Column,
} from "../workspace/Workspace";
import { secondsText } from "../workspace/format";
import {
  DeviceTile,
  EntryState,
  EntryTile,
  LastSuccess,
  NextDue,
  TriggerMark,
  entryKind,
  entryNaming,
  OPS_WIDTHS,
  UnverifiedBadge,
  entryKeep,
} from "./cells";
import { EntryPanel, OPS_PANEL_ID } from "./EntryPanel";
import { OpsPage, type OpsData } from "./frame";
import { opsSelectionHref, useOpsSelection } from "./selection";

const STATUS_PATH = "/observability/status";

/** The anchor on an entry's Status row or host card. */
export function opsEntryAnchor(id: string) {
  return `entry-${id}`;
}

export function opsEntryHref(id: string) {
  return opsSelectionHref(STATUS_PATH, "entry", id);
}

const stateLabel = (state: OpsState) => badgeFor("ops", state).label;

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
export function opsView(snapshot: OpsSnapshot, lastKnown: boolean) {
  const ordered = opsOrdered(opsServices(snapshot));
  return lastKnown ? ordered.map(asLastKnown) : ordered;
}

function detailOf(service: OpsServiceView) {
  if (service.missingStatus) return "No status row from System";
  // health.metrics' `missing:<list>` reads as words; any other shape stays
  // System's own text.
  if (service.id === HEALTH_METRICS_ID)
    return (
      healthMetricsText(parseHealthMetrics(service.status.detail)) ??
      service.status.detail
    );
  return service.status.detail;
}

type Row = OpsServiceView & Record<string, unknown>;
type Select = {
  selected: string | null;
  open: (id: string, trigger: HTMLElement) => void;
};

/** A short detail, and a non-zero exit as a critical figure after it. */
function Reason({ service }: { service: OpsServiceView }) {
  const exit = service.status.last_exit;
  return (
    <span className="ops-reason">
      <DetailText>{detailOf(service)}</DetailText>
      {exit !== null && exit !== 0 && (
        <span className="ops-exit workspace-figure">exit {exit}</span>
      )}
    </span>
  );
}

/**
 * The Status columns. Beside an open panel the list keeps only the service,
 * its state, its last success and its next run, so nothing scrolls sideways.
 * The service column keeps room for its longest name (`leadRoom`); the detail
 * shares what is left and gives way first, its full text on hover.
 */
function statusColumns(
  {
    narrow,
    now,
    names,
    leadRoom,
  }: {
    narrow: boolean;
    now?: number;
    names: ReadonlyMap<string, string>;
    /** What the service column needs for its longest name (leadWidth). */
    leadRoom: number;
  },
  select: Select,
): Column<Row>[] {
  const lead: Column<Row> = {
    key: "name",
    header: "Service",
    render: (row) => {
      const naming = entryNaming(row, names);
      const exception = row.status.state !== "ok" || opsUnverified(row);
      return (
        <RowTitle
          mark={<EntryTile naming={naming} />}
          kind={entryKind(row, naming)}
          title={naming.name}
          keep={entryKeep(row, names)}
          anchorId={opsEntryAnchor(row.id)}
          href={opsEntryHref(row.id)}
          onSelect={(trigger) => select.open(row.id, trigger)}
          isPressed={select.selected === row.id}
          controls={select.selected === row.id ? OPS_PANEL_ID : undefined}
          tooltip={naming.tooltip}
          mobile={
            exception ? (
              <>
                <CompactOnly>
                  <EntryState service={row} />
                </CompactOnly>
                <Reason service={row} />
              </>
            ) : undefined
          }
          mobileBelow="large"
          end={
            <>
              <LastSuccess service={row} now={now} />
              {naming.device && <DeviceTile device={row.host} />}
            </>
          }
        />
      );
    },
  };
  const state: Column<Row> = {
    key: "state",
    header: "State",
    width: OPS_WIDTHS.state,
    render: (row) => <EntryState service={row} cell />,
  };
  const lastSuccess: Column<Row> = {
    key: "last_success",
    header: "Last success",
    width: CELL_WIDTHS.time,
    render: (row) => <LastSuccess service={row} now={now} />,
  };
  const next: Column<Row> = {
    key: "next",
    header: "Next run",
    width: CELL_WIDTHS.time,
    render: (row) => <NextDue service={row} now={now} />,
  };
  if (narrow) return [lead, state, lastSuccess];
  return [
    lead,
    // Kept at medium too: two services can share a name on two Macs.
    {
      key: "device",
      header: <span className="sr-only">Device</span>,
      width: OPS_WIDTHS.tile,
      render: (row) =>
        entryNaming(row).device ? <DeviceTile device={row.host} /> : null,
    },
    state,
    {
      key: "detail",
      header: "Detail",
      share: 0.5,
      reserve: leadRoom,
      hideBelow: "large",
      render: (row) => <Reason service={row} />,
    },
    lastSuccess,
    {
      key: "last_run",
      header: "Last run",
      width: CELL_WIDTHS.time,
      hideBelow: "wide",
      render: (row) =>
        row.status.last_run_at ? (
          <RelativeTime value={row.status.last_run_at} now={now} />
        ) : (
          <span className="sr-only">Not recorded</span>
        ),
    },
    {
      key: "duration",
      header: "Took",
      width: OPS_WIDTHS.figure,
      numeric: true,
      hideBelow: "wide",
      render: (row) => <Duration seconds={row.status.last_duration_s} />,
    },
    next,
    {
      key: "runs",
      header: "Runs",
      width: OPS_WIDTHS.figure,
      numeric: true,
      hideBelow: "wide",
      render: (row) => <Figure value={row.status.runs} />,
    },
    {
      key: "trigger",
      header: <span className="sr-only">Trigger</span>,
      width: OPS_WIDTHS.lastTile,
      hideBelow: "large",
      render: (row) => <TriggerMark entry={row} status={row.status} />,
    },
  ];
}

/** Non-ok states, most severe first, as the Status summary's order. */
const EXCEPTIONS: readonly OpsState[] = [
  "failing",
  "degraded",
  "stale",
  "unknown",
  "asleep",
];

/** One count chip per non-ok state, and one for entries never proven
 * (Unverified, which is never ok), so the summary never reads all clear
 * while a restore is unproven. An unverified entry counts once, as its row
 * reads. Problems first, then Unverified, then what is only unknown. */
function ExceptionCounts({ services }: { services: OpsServiceView[] }) {
  const unverified = services.filter(opsUnverified).length;
  const counts = opsRenderedCounts(
    services.filter((service) => !opsUnverified(service)),
  );
  const shown = EXCEPTIONS.filter((state) => counts[state] > 0);
  if (!shown.length && !unverified) return null;
  const chip = (state: OpsState) => {
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
  };
  const problem = (state: OpsState) =>
    state === "failing" || state === "degraded" || state === "stale";
  return (
    <ul className="ops-counts" aria-label="Not ok">
      {shown.filter(problem).map(chip)}
      {unverified > 0 && (
        <li key="unverified">
          <UnverifiedBadge count={unverified} />
        </li>
      )}
      {shown.filter((state) => !problem(state)).map(chip)}
    </ul>
  );
}

/** A host or sync as a card: a 28px tile, two lines, the whole card opens
 * the entry's panel. */
function Card({
  id,
  tile,
  title,
  keep,
  state,
  meta,
  end,
  tooltip,
  select,
  anchor,
}: {
  id: string;
  tile: React.ReactNode;
  title: string;
  /** The end of `title` that stays whole (TitleText). */
  keep?: string;
  state: React.ReactNode;
  meta: React.ReactNode;
  end?: React.ReactNode;
  tooltip: string;
  select: Select;
  anchor?: string;
}) {
  const open = select.selected === id;
  return (
    <li className="ops-card" id={anchor} data-open={open ? "true" : undefined}>
      <a
        href={opsEntryHref(id)}
        className="ops-card-link"
        title={tooltip}
        aria-current={open ? "true" : undefined}
        aria-controls={open ? OPS_PANEL_ID : undefined}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          )
            return;
          event.preventDefault();
          select.open(id, event.currentTarget);
        }}
      >
        <span className="ops-card-tile">{tile}</span>
        <span className="ops-card-body">
          <span className="ops-card-line">
            <TitleText title={title} keep={keep} className="ops-card-title" />
            <span className="ops-card-state">{state}</span>
          </span>
          <span className="ops-card-line ops-card-meta">
            <span className="ops-card-facts">{meta}</span>
            {end && <span className="ops-card-end">{end}</span>}
          </span>
        </span>
      </a>
    </li>
  );
}

/** A fact on a card's second line: a muted glyph and its value. */
function Fact({
  icon: Glyph,
  label,
  children,
}: {
  icon: typeof ClockIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="ops-fact" title={label}>
      <Glyph weight="regular" aria-hidden="true" />
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}

/** Disk use as a figure and a small meter in the host's own tone. */
function Disk({ percent, state }: { percent: number; state: OpsState }) {
  return (
    <Fact icon={HardDrivesIcon} label="Disk used">
      <span className="workspace-figure">{percent}%</span>
      <span
        className="ops-meter"
        data-tone={badgeFor("ops", state).tone}
        aria-hidden="true"
      >
        <span style={{ inlineSize: `${percent}%` }} />
      </span>
    </Fact>
  );
}

/** Hosts as cards: the device, its state, then disk, whether it is awake,
 * its uptime and how long ago it was sampled. */
function HostStrip({
  hosts,
  now,
  select,
}: {
  hosts: OpsServiceView[];
  now?: number;
  select: Select;
}) {
  if (!hosts.length) return null;
  return (
    <ul className="ops-cards ops-hosts" aria-label="Hosts">
      {hosts.map((host) => {
        const naming = entryNaming(host);
        const facts = opsHostFacts(host);
        return (
          <Card
            key={host.id}
            id={host.id}
            anchor={opsEntryAnchor(host.id)}
            select={select}
            tile={<EntryTile naming={naming} size={28} />}
            title={naming.name}
            tooltip={`${detailOf(host)}\n${host.id}`}
            state={<EntryState service={host} cell />}
            meta={
              <>
                {facts.disk !== null && (
                  <Disk percent={facts.disk} state={host.status.state} />
                )}
                {facts.awake !== null && (
                  <Fact icon={facts.awake ? SunIcon : MoonIcon} label="Awake">
                    {facts.awake ? "Awake" : "Asleep"}
                  </Fact>
                )}
                {facts.uptimeS !== null && (
                  <Fact icon={TimerIcon} label="Uptime">
                    <span className="workspace-figure">
                      {secondsText(facts.uptimeS)}
                    </span>
                  </Fact>
                )}
                {facts.disk === null && (
                  <span className="ops-card-detail">{detailOf(host)}</span>
                )}
              </>
            }
            end={
              facts.sampledAt ? (
                <Fact icon={ClockIcon} label="Sampled">
                  <RelativeTime value={facts.sampledAt} now={now} />
                </Fact>
              ) : undefined
            }
          />
        );
      })}
    </ul>
  );
}

type SyncKey =
  | `state:${Extract<OpsSyncState, { kind: "state" }>["state"]}`
  | Exclude<OpsSyncState["kind"], "state">;

/** A sync's state (opsSyncState): the row's own state chip whenever it is
 * not ok, so a failing or asleep sync never reads fresh; for an ok row, a
 * quiet dot when fresh and the Stale chip over its budget; a neutral mark
 * when System gives no budget or records no success. */
function SyncState({
  service,
  now,
}: {
  service: OpsServiceView;
  now?: number;
}) {
  // One string per judgement, so the card re-renders only when it changes.
  const key = useLiveText(
    (live) => {
      const judged = opsSyncState(service, live);
      return judged.kind === "state" ? `state:${judged.state}` : judged.kind;
    },
    Date.now(),
    now,
  ) as SyncKey;
  if (key === "unverified") return <UnverifiedBadge />;
  if (key.startsWith("state:"))
    return <StateCell domain="ops" state={key.slice("state:".length)} />;
  if (key === "fresh" || key === "stale")
    return <StateCell domain="freshness" state={key} />;
  // Without a budget System judges liveness only, so freshness is not
  // judged here either: the mark says so rather than reading as fresh.
  const unjudged = key === "unjudged";
  return (
    <span
      className="ops-unjudged"
      title={
        unjudged
          ? "System gives this sync no freshness budget"
          : "System has recorded no success for this sync"
      }
    >
      <CircleDashedIcon weight="regular" aria-hidden="true" />
      {unjudged ? "No budget" : "Not recorded"}
    </span>
  );
}

/** Where a sync runs, as its device tile and a name. */
function SyncWhere({ device, name }: { device: string | null; name: string }) {
  return (
    <span className="ops-fact ops-card-where">
      {device && <DeviceTile device={device} />}
      <span className="ops-card-detail">{name}</span>
    </span>
  );
}

/** Every synced app with its app tile and its state on line 1, then the
 * sync that carries it (its device tile and name) and its last success on
 * line 2, judged against that sync's own budget. */
function SyncGrid({
  rows,
  now,
  select,
  names,
}: {
  rows: OpsSyncRow[];
  now?: number;
  select: Select;
  names: ReadonlyMap<string, string>;
}) {
  if (!rows.length) return null;
  return (
    <WorkspaceSection title="Syncs" meta={String(rows.length)}>
      <ul className="ops-cards ops-syncs" aria-label="Syncs">
        {rows.map((row) => {
          const { service } = row;
          const naming = entryNaming(service, names);
          // The device tile names the host, so a name two Macs share drops
          // its ", ap-mini" beside it; the tooltip keeps the full name.
          const bare = entryNaming(service);
          const device = naming.device ? service.host : null;
          const budget = service.freshness_budget_s;
          const budgetText =
            budget === null
              ? "No freshness budget"
              : `Budget ${secondsText(budget)}`;
          const state = <SyncState service={service} now={now} />;
          if (row.app === null)
            // A multi-app pass: its own job, in job words, with no app mark
            // borrowing its freshness.
            return (
              <Card
                key={row.key}
                id={service.id}
                select={select}
                tile={<EntryTile naming={naming} size={28} />}
                title={naming.name}
                keep={entryKeep(service, names)}
                tooltip={`${naming.name}\n${budgetText}\n${service.id}`}
                state={state}
                meta={
                  device ? (
                    <SyncWhere device={device} name={deviceName(device)} />
                  ) : undefined
                }
                end={
                  <span className="ops-inline">
                    Last pass
                    <LastSuccess
                      service={service}
                      now={now}
                      empty="Not recorded"
                    />
                  </span>
                }
              />
            );
          const app = brandMark(row.app)?.label ?? sentenceCase(row.app);
          return (
            <Card
              key={row.key}
              id={service.id}
              select={select}
              tile={<BrandTile id={row.app} size={28} />}
              title={app}
              tooltip={`${app} via ${naming.name}\n${budgetText}\n${service.id}`}
              state={state}
              meta={
                <SyncWhere
                  device={device}
                  name={device ? bare.name : naming.name}
                />
              }
              end={
                <LastSuccess service={service} now={now} empty="Not recorded" />
              }
            />
          );
        })}
      </ul>
    </WorkspaceSection>
  );
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
      .querySelector<HTMLElement>(".workspace-row-link, .ops-card-link")
      ?.focus({ preventScroll: true });
    const timer = setTimeout(() => landed.removeAttribute("data-landed"), 2400);
    return () => clearTimeout(timer);
  }, [ready]);
}

function StatusList({
  services,
  now,
  lastKnown,
  select,
  panelOpen,
  names,
}: {
  services: OpsServiceView[];
  now?: number;
  lastKnown: boolean;
  select: Select;
  panelOpen: boolean;
  /** Names two entries share, with their host. */
  names: ReadonlyMap<string, string>;
}) {
  const beside = useSplitView();
  const narrow = beside && panelOpen;
  const hosts = services.filter(opsIsHost);
  const rows = services.filter((service) => !opsIsHost(service)) as Row[];
  const syncs = useMemo(() => opsSyncRows(services), [services]);
  const leadRoom = useMemo(
    () =>
      leadWidth(
        services
          .filter((service) => !opsIsHost(service))
          .map((service) => entryNaming(service, names).name),
      ),
    [services, names],
  );
  const columns = statusColumns({ narrow, now, names, leadRoom }, select);
  useAnchorLanding(services.length > 0);
  return (
    <VStack gap={6}>
      <div className="ops-overview">
        <HostStrip hosts={hosts} now={now} select={select} />
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
      <SyncGrid rows={syncs} now={now} select={select} names={names} />
    </VStack>
  );
}

export function StatusView({
  data,
  initial,
}: {
  data: OpsData;
  initial: string | null;
}) {
  const services = useMemo(
    () => (data.snapshot ? opsView(data.snapshot, data.stopped) : []),
    [data.snapshot, data.stopped],
  );
  const { selected, open, close, panel } = useOpsSelection(initial, {
    path: STATUS_PATH,
    param: "entry",
  });
  const current = selected
    ? (services.find((service) => service.id === selected) ?? null)
    : null;
  const select = { selected: current ? selected : null, open };
  return (
    <OpsPage data={data} view="status" count={services.length} retained>
      <SplitView
        className="ops-split"
        list={
          <StatusList
            services={services}
            now={data.fixedNow}
            lastKnown={data.stopped}
            select={select}
            panelOpen={Boolean(current)}
            names={data.names}
          />
        }
        panel={
          current && (
            <EntryPanel
              key={current.id}
              service={current}
              data={data}
              onClose={close}
              panelRef={panel}
              backLabel="Back to status"
            />
          )
        }
      />
    </OpsPage>
  );
}
