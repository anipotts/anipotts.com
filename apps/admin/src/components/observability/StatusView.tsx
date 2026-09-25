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
  opsDetailText,
  opsHostFacts,
  opsUnverified,
  opsSyncState,
  opsSyncRows,
  type OpsSyncRow,
  type OpsSyncState,
} from "../../lib/ops-view";
import { useLiveText } from "../../lib/live-clock";
import { deviceName } from "../../lib/naming";
import { sentenceCase } from "../../lib/sentence-case";
import { BrandTile } from "../BrandTile";
import { SplitView } from "../astryx/SplitView";
import {
  CELL_WIDTHS,
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
  YieldOnly,
  badgeFor,
  chipWidth,
  leadWidth,
  stateWidth,
  titleWidth,
  type Column,
} from "../workspace/Workspace";
import { secondsText } from "../workspace/format";
import {
  DeviceTile,
  EntryState,
  EntryTile,
  LastRun,
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

const detailOf = opsDetailText;

type Row = OpsServiceView & Record<string, unknown>;
type Select = {
  selected: string | null;
  open: (id: string, trigger: HTMLElement) => void;
};

/** A detail on at most two lines, ending after a whole word (its full text
 * on hover), and a non-zero exit as a critical figure after it. On line 2
 * (phones, medium) it reads whole. */
function Reason({ service }: { service: OpsServiceView }) {
  const exit = service.status.last_exit;
  return (
    <span className="ops-reason">
      <DetailText lines={2}>{detailOf(service)}</DetailText>
      {exit !== null && exit !== 0 && (
        <span className="ops-exit workspace-figure">exit {exit}</span>
      )}
    </span>
  );
}

/**
 * The Status columns. Beside an open panel the list keeps only the service,
 * its state, its last success and its next run, so nothing scrolls sideways.
 * The service column always keeps room for its longest name (`leadRoom`),
 * and a name that still meets less room wraps rather than losing a word.
 * The detail takes what is left, up to what holds its longest reason on two
 * lines (`reasonWant`); a longer reason ends after a whole word on line 2,
 * its full text on hover.
 */
export function statusColumns(
  {
    narrow,
    now,
    names,
    leadRoom,
    reasonWant,
    stateColumn = OPS_WIDTHS.state,
  }: {
    narrow: boolean;
    /** The State column's width (opsStateWidth): its widest chip. */
    stateColumn?: number;
    now?: number;
    names: ReadonlyMap<string, string>;
    /** What the service column needs for its longest name (leadWidth). */
    leadRoom: number;
    /** What the detail would like: the longest reason a row that is not ok
     * gives, with its exit code, on two lines (reasonWant). */
    reasonWant: number;
  },
  select: Select,
): Column<Row>[] {
  const lead: Column<Row> = {
    key: "name",
    header: "Service",
    // Where the table is too narrow for its longest name, Next run gives
    // way first, then State moves to line 2.
    room: narrow ? undefined : leadRoom,
    render: (row) => {
      const naming = entryNaming(row, names);
      const exception = row.status.state !== "ok" || opsUnverified(row);
      return (
        <RowTitle
          mark={<EntryTile naming={naming} />}
          kind={entryKind(row, naming)}
          title={naming.name}
          // A name two Macs share carries its host in words, device column
          // or not: the tile alone is too small to tell them apart.
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
                <YieldOnly column="state">
                  <EntryState service={row} />
                </YieldOnly>
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
    width: stateColumn,
    yieldOrder: narrow ? undefined : 2,
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
    yieldOrder: 1,
    render: (row) => <NextDue service={row} now={now} />,
  };
  if (narrow)
    return [lead, state, { ...lastSuccess, width: OPS_WIDTHS.lastTime }];
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
      // Names never give way to a reason: the reason wraps and clamps.
      reserve: leadRoom,
      want: reasonWant,
      hideBelow: "large",
      render: (row) => <Reason service={row} />,
    },
    lastSuccess,
    {
      key: "last_run",
      header: "Last run",
      width: CELL_WIDTHS.time,
      hideBelow: "wide",
      render: (row) => <LastRun service={row} now={now} />,
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

/** The State column's width: the widest cell its rows draw, a quiet dot
 * for ok and a chip otherwise ("Unverified" for a check never proven), so a
 * column of dots gives the service names the room. */
export function opsStateWidth(services: readonly OpsServiceView[]): number {
  return stateWidth(
    "ops",
    services
      .filter((service) => !opsUnverified(service))
      .map((service) => service.status.state),
    services.some(opsUnverified) ? [chipWidth("Unverified")] : [],
  );
}

/** A cell's inset, and the gap before an exit code. */
const REASON_CHROME = 24;
const EXIT_GAP = 8;
/** The most the detail asks for past its even share. */
const REASON_WANT_MAX = 480;

/**
 * The width that holds the longest reason on two lines: each row that is
 * not ok (or never proven), its detail and its exit code (titleWidth errs
 * wide). Two lines of half the text each can still lose up to one word to
 * the wrap, so the longest word is added. The Detail column takes this
 * before its even share when the table has room, never out of the service
 * column's room, so "keepalive export_failed exit 1" reads whole where it
 * fits and ends after a whole word where it does not. Ok rows' details may
 * clamp.
 */
export function reasonWant(services: readonly OpsServiceView[]): number {
  let widest = 0;
  for (const service of services) {
    if (service.status.state === "ok" && !opsUnverified(service)) continue;
    const text = detailOf(service);
    const exit = service.status.last_exit;
    const longestWord = Math.max(
      0,
      ...text.split(/\s+/).map((word) => titleWidth(word)),
    );
    const width =
      titleWidth(text) / 2 +
      longestWord +
      (exit !== null && exit !== 0 ? EXIT_GAP + titleWidth(`exit ${exit}`) : 0);
    widest = Math.max(widest, width);
  }
  return widest
    ? Math.min(REASON_WANT_MAX, Math.ceil(REASON_CHROME + widest))
    : 0;
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
  const noBudget = key === "unjudged";
  return (
    <span
      className="ops-unjudged"
      title={
        noBudget
          ? "System gives this sync no freshness budget"
          : "Not judged: System has recorded no success for this sync"
      }
    >
      <CircleDashedIcon weight="regular" aria-hidden="true" />
      {noBudget ? "No budget" : "Not judged"}
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
 * line 2, judged against that sync's own budget. Line 1's end is always the
 * state or the budget, line 2's end always the time. A sync whose success
 * time is not an arrival (health.ingest, A-38) reads "Not recorded" in its
 * time slot, as Data Health withholds it. */
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
                // The device beside it names the host, so the bare name.
                title={device ? bare.name : naming.name}
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
          // One tile per thing: an entry the table draws with another mark
          // (Session transcripts to R2 is Cloudflare's, where it lands) keeps
          // that mark and its name here, the app it carries in the tooltip.
          const own = naming.tile.id !== row.app;
          return (
            <Card
              key={row.key}
              id={service.id}
              select={select}
              tile={
                own ? (
                  <EntryTile naming={naming} size={28} />
                ) : (
                  <BrandTile id={row.app} size={28} />
                )
              }
              // The device beside it names the host, so the bare name.
              title={own ? (device ? bare.name : naming.name) : app}
              tooltip={`${app} via ${naming.name}\n${budgetText}\n${service.id}`}
              state={state}
              meta={
                own ? (
                  device ? (
                    <SyncWhere device={device} name={deviceName(device)} />
                  ) : undefined
                ) : (
                  <SyncWhere
                    device={device}
                    name={device ? bare.name : naming.name}
                  />
                )
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
  // An open panel sits beside the list from 960px, and below that the list
  // steps aside (styles/shell.css), so whenever a panel is open the list
  // that shows is the short one. Decided without measuring, the server
  // writes the layout the browser keeps.
  const narrow = panelOpen;
  const hosts = services.filter(opsIsHost);
  const rows = services.filter((service) => !opsIsHost(service)) as Row[];
  const syncs = useMemo(() => opsSyncRows(services), [services]);
  // The detail's reserve is for the names rows draw, a shared name's host
  // included.
  const leadRoom = useMemo(
    () =>
      leadWidth(
        services
          .filter((service) => !opsIsHost(service))
          .map((service) => entryNaming(service, names).name),
      ),
    [services, names],
  );
  const want = useMemo(() => reasonWant(rows), [rows]);
  const stateColumn = useMemo(() => opsStateWidth(rows), [rows]);
  const columns = statusColumns(
    { narrow, now, names, leadRoom, reasonWant: want, stateColumn },
    select,
  );
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
