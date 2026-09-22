import React, { useEffect, useMemo, useRef, useState } from "react";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  AddressBookIcon,
  ArchiveIcon,
  BrowserIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  ChatCircleTextIcon,
  CircleDashedIcon,
  ChatsCircleIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  DatabaseIcon,
  EnvelopeSimpleIcon,
  HeartbeatIcon,
  ImagesSquareIcon,
  MoonIcon,
  NotePencilIcon,
  PauseIcon,
  ProhibitIcon,
  RowsIcon,
  SpinnerGapIcon,
  StackSimpleIcon,
  WarningCircleIcon,
  WarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { DataResult } from "../../data/personal-context";
import { DataReadSession, type DataReader } from "../../lib/data-read-session";
import { opsServices } from "../../lib/ops-v1";
import { useOpsData, type OpsViewProps } from "../observability/frame";
import { dataRecordsHref, dataSource } from "../../lib/data-routes";
import { deviceName } from "../../lib/naming";
import { BrandTile } from "../BrandTile";
import {
  CELL_WIDTHS,
  DataTable,
  Figure,
  InlineNotice,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateNotice,
  type Column,
  type Tone,
} from "../workspace/Workspace";
import type { DataSourceRow } from "./data-model";
import { ReadNotice } from "./DataNotices";
import { readSourceCatalog } from "./source-catalog";
import {
  DISCOVERED_GROUP,
  SOURCE_GROUPS,
  sourceGroup,
  sourceRows,
  type SourceJobs,
  type SourceRow,
  type SourceState,
} from "./sources-model";
import "./sources.css";

type Failure = Exclude<DataResult, { state: "ready" }>;
type TableRow = SourceRow & Record<string, unknown>;

/** A connector's glyph, for a family whose accounts are different apps. */
const CONNECTOR_GLYPHS: Record<SourceRow["connector"], Icon> = {
  browsing: BrowserIcon,
  messages: ChatCircleTextIcon,
  contacts: AddressBookIcon,
  mail: EnvelopeSimpleIcon,
  calendar: CalendarBlankIcon,
  notes: NotePencilIcon,
  media: ImagesSquareIcon,
  agent_transcripts: ChatsCircleIcon,
  code: CodeIcon,
  health: HeartbeatIcon,
  legacy_vaults: ArchiveIcon,
  other: DatabaseIcon,
};

/** Each state's name and mark. A group's ordinary state is a quiet dot where
 * a chip's dot sits; every other state is its chip. */
const STATES: Record<
  SourceState,
  { label: string; tone: Tone; quiet?: true; icon?: Icon }
> = {
  live: { label: "Live", tone: "positive", quiet: true },
  connected: { label: "Connected", tone: "neutral", quiet: true },
  imported: { label: "Imported once", tone: "neutral", quiet: true },
  unreported: { label: "Status not reported", tone: "neutral", quiet: true },
  discovered: { label: "Not connected", tone: "neutral", quiet: true },
  // A live source whose job cannot be joined: neither Live nor a problem.
  unjudged: { label: "Unjudged", tone: "neutral", icon: CircleDashedIcon },
  stale: { label: "Stale", tone: "warning", icon: ClockCounterClockwiseIcon },
  degraded: { label: "Degraded", tone: "warning", icon: WarningIcon },
  asleep: { label: "Asleep", tone: "rest", icon: MoonIcon },
  failed: { label: "Failed", tone: "critical", icon: WarningCircleIcon },
  unavailable: { label: "Unavailable", tone: "neutral", icon: ProhibitIcon },
  paused: { label: "Paused", tone: "rest", icon: PauseIcon },
  pending: { label: "Syncing", tone: "neutral", icon: SpinnerGapIcon },
  excluded: { label: "Excluded", tone: "neutral", icon: ProhibitIcon },
};

const DOTS: Record<
  Tone,
  "success" | "neutral" | "accent" | "warning" | "error"
> = {
  positive: "success",
  neutral: "neutral",
  calm: "neutral",
  rest: "accent",
  warning: "warning",
  critical: "error",
};

/** A source's state: a quiet dot for its group's ordinary state, else its
 * chip. With `exceptionsOnly` (a phone's line 2) the dot is left out. */
export function SourceStateMark({
  state,
  exceptionsOnly = false,
}: {
  state: SourceState;
  exceptionsOnly?: boolean;
}) {
  const badge = STATES[state];
  if (badge.quiet) {
    if (exceptionsOnly) return null;
    return (
      <span
        className="workspace-state-quiet"
        data-tone={badge.tone}
        role="img"
        aria-label={badge.label}
        title={badge.label}
      >
        <StatusDot
          variant={DOTS[badge.tone]}
          label={badge.label}
          aria-hidden="true"
        />
      </span>
    );
  }
  const Glyph = badge.icon ?? WarningCircleIcon;
  return (
    <StateBadge
      tone={badge.tone}
      label={badge.label}
      icon={
        <Glyph
          weight="regular"
          aria-hidden="true"
          className="workspace-state-mark"
          data-tone={badge.tone}
        />
      }
    />
  );
}

function Device({ id }: { id: string | null }) {
  if (!id) return null;
  return <BrandTile id={id} kind="device" size={20} label={deviceName(id)} />;
}

/** Whether a row shows System's counts. A discovered source has none to
 * show. An excluded one shows what System reports, so a count that
 * disagrees with its withdrawn records stays visible for System to fix. */
const showsCounts = (row: SourceRow) => row.group !== "discovered";

/** Records and revisions as glyph and number pairs for a phone's line 2,
 * named in full for assistive technology. */
function Figures({ row }: { row: SourceRow }) {
  if (!showsCounts(row)) return null;
  const name = `${row.records} ${row.records === 1 ? "record" : "records"}, ${row.revisions} ${row.revisions === 1 ? "revision" : "revisions"}`;
  return (
    <span className="data-figures" aria-label={name} title={name}>
      <span>
        <RowsIcon weight="regular" aria-hidden="true" />
        {row.records.toLocaleString("en-US")}
      </span>
      <span>
        <StackSimpleIcon weight="regular" aria-hidden="true" />
        {row.revisions.toLocaleString("en-US")}
      </span>
    </span>
  );
}

/** What System found for a discovered source, when it says. */
const foundText = (row: SourceRow) =>
  row.group === "discovered" && row.discovered
    ? `${row.discovered.toLocaleString("en-US")} found`
    : null;

/** System's newest held record, as a quiet detail: never a freshness. */
function newestRecord(row: SourceRow) {
  if (!row.newest) return undefined;
  return (
    <span className="sources-newest">
      Newest record <RelativeTime value={row.newest} />
    </span>
  );
}

/** A phone's line 2: an exception's chip and the figures. */
function PhoneDetail({ row }: { row: SourceRow }) {
  if (STATES[row.state].quiet && row.group === "discovered") return null;
  return (
    <>
      <SourceStateMark state={row.state} exceptionsOnly />
      <Figures row={row} />
    </>
  );
}

/**
 * A family's lead cell: the kit's row (workspace.css) with a button that
 * folds its accounts in and out, their count beside the name and a caret
 * that turns. Line 2 names the accounts.
 */
function FamilyTitle({
  row,
  open,
  onToggle,
}: {
  row: SourceRow;
  open: boolean;
  onToggle: () => void;
}) {
  const accounts = row.accounts.map((account) => account.name).join(", ");
  const found = foundText(row);
  const Glyph = CONNECTOR_GLYPHS[row.connector];
  return (
    <div className="workspace-row sources-family">
      <span className="workspace-row-mark" title={row.name}>
        {row.tile ? (
          <BrandTile id={row.tile.id} kind={row.tile.kind} />
        ) : (
          <Glyph weight="regular" aria-hidden="true" />
        )}
        <span className="sr-only">{row.name}</span>
      </span>
      <div className="workspace-row-body">
        <div className="workspace-row-line">
          <button
            type="button"
            className="workspace-row-link sources-family-toggle"
            data-row-link=""
            aria-expanded={open}
            aria-label={`${row.name}, ${row.accounts.length} accounts`}
            title={row.tooltip}
            onClick={onToggle}
          >
            <span className="workspace-row-title">{row.name}</span>
            <span className="workspace-count sources-family-count">
              {row.accounts.length}
            </span>
            <CaretRightIcon
              weight="bold"
              aria-hidden="true"
              className="sources-family-caret"
            />
          </button>
          <Text
            type="supporting"
            color="secondary"
            className="workspace-row-end"
          >
            <Device id={row.device} />
            {row.lastSync && <RelativeTime value={row.lastSync} />}
          </Text>
        </div>
        <div className="workspace-row-meta">
          {!(STATES[row.state].quiet && row.group === "discovered") && (
            <span className="workspace-row-detail">
              <PhoneDetail row={row} />
            </span>
          )}
          <Text
            type="supporting"
            color="secondary"
            className="workspace-row-secondary"
          >
            <span title={accounts}>
              {found ? `${accounts}, ${found}` : accounts}
            </span>
          </Text>
        </div>
      </div>
    </div>
  );
}

/** A source on its own, or an account under its family. Either opens
 * Records filtered to it. */
function SourceTitle({ row, family }: { row: SourceRow; family?: string }) {
  const href =
    row.sourceId && dataSource(row.sourceId)
      ? dataRecordsHref({ source: row.sourceId })
      : undefined;
  const label = family ? `${family} ${row.name}` : row.name;
  const detail = <PhoneDetail row={row} />;
  const title = (
    <RowTitle
      mark={
        row.tile ? (
          <BrandTile id={row.tile.id} kind={row.tile.kind} />
        ) : undefined
      }
      icon={row.tile ? undefined : CONNECTOR_GLYPHS[row.connector]}
      kind={row.tooltip}
      title={row.name}
      tooltip={row.tooltip}
      href={href}
      linkLabel={`${label} records`}
      end={row.device ? <Device id={row.device} /> : undefined}
      time={row.lastSync}
      mobile={
        STATES[row.state].quiet && row.group === "discovered"
          ? undefined
          : detail
      }
      secondary={foundText(row) ?? newestRecord(row)}
    />
  );
  return row.kind === "account" ? (
    <div className="sources-account">{title}</div>
  ) : (
    title
  );
}

/** The ops jobs sources name, each with its state and freshness budget,
 * from the ops snapshot (the reader's own gate, or the development
 * fixture). Mounted only when some source names a job. */
function JobStates({
  ops,
  onJobs,
}: {
  ops: OpsViewProps;
  onJobs: (jobs: SourceJobs | null) => void;
}) {
  // A stopped sampler's states are only last known, so nothing is judged.
  const { snapshot, stopped } = useOpsData(ops, false);
  useEffect(() => {
    onJobs(
      snapshot && !stopped
        ? new Map(
            opsServices(snapshot).map((service) => [
              service.id,
              { state: service.status.state },
            ]),
          )
        : null,
    );
  }, [snapshot, stopped, onJobs]);
  return null;
}

/** Every family and source, with each open family's accounts under it. */
function tableRows(rows: SourceRow[], open: ReadonlySet<string>): TableRow[] {
  return rows.flatMap((row) =>
    row.kind === "family" && open.has(row.key) ? [row, ...row.accounts] : [row],
  ) as TableRow[];
}

/**
 * Sources by connector. A source or an account opens Records filtered to
 * it; a family folds its accounts in and out. Sources found but never
 * connected sit last, folded.
 */
export function SourcesExplorer({
  reader,
  onCount,
  ops,
}: {
  reader: DataReader;
  onCount?: (count: number | undefined) => void;
  /** The ops reader's gate and fixtures, for the jobs sources name. */
  ops?: OpsViewProps;
}) {
  const [sources, setSources] = useState<DataSourceRow[] | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const session = useRef(new DataReadSession());
  async function read() {
    setBusy(true);
    const catalog = await readSourceCatalog(reader, session.current);
    if (!catalog) return;
    setBusy(false);
    setTotal(catalog.total);
    setFailure(catalog.failure);
    setIncomplete(catalog.incomplete);
    setSources(catalog.sources);
  }
  useEffect(() => {
    void read();
    const current = session.current;
    return () => current.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader]);
  useEffect(
    () => onCount?.(failure ? undefined : total),
    [total, failure, onCount],
  );
  // A live source is judged through the ops job that collects it; the
  // snapshot is read only when some source names a job.
  const [jobs, setJobs] = useState<SourceJobs | null>(null);
  const wantsJobs =
    Boolean(ops?.enabled || ops?.fixture !== undefined) &&
    Boolean(sources?.some((source) => source.job));
  const rows = useMemo(
    () => (sources ? sourceRows(sources, jobs) : []),
    [sources, jobs],
  );
  // The folded group counts the sources it holds, not the rows it draws.
  const discovered = useMemo(
    () =>
      sources?.filter((source) => sourceGroup(source) === "discovered")
        .length ?? 0,
    [sources],
  );
  if (!sources) return <LoadingSkeleton label="sources" columns={4} />;
  if (failure && !sources.length)
    return <ReadNotice result={failure} onRetry={() => void read()} />;
  if (!rows.length) return <StateNotice kind="empty" title="No sources yet" />;
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const familyOf = new Map(
    rows.flatMap((row) =>
      row.accounts.map((account) => [account.key, row.name] as const),
    ),
  );
  // A device column only when some row has a device to show.
  const anyDevice = rows.some(
    (row) => row.device || row.accounts.some((account) => account.device),
  );
  const columns: Column<TableRow>[] = [
    {
      key: "source",
      header: "Source",
      render: (row) =>
        row.kind === "family" ? (
          <FamilyTitle
            row={row}
            open={open.has(row.key)}
            onToggle={() => toggle(row.key)}
          />
        ) : (
          <SourceTitle row={row} family={familyOf.get(row.key)} />
        ),
    },
    ...(anyDevice
      ? [
          {
            key: "device",
            header: <span className="sr-only">Device</span>,
            width: CELL_WIDTHS.tile,
            hideBelow: "large" as const,
            render: (row: TableRow) => <Device id={row.device} />,
          },
        ]
      : []),
    {
      key: "state",
      header: "State",
      width: CELL_WIDTHS.state,
      render: (row) => <SourceStateMark state={row.state} />,
    },
    {
      key: "records",
      header: "Records",
      width: CELL_WIDTHS.figure,
      numeric: true,
      render: (row) => <Figure value={showsCounts(row) ? row.records : null} />,
    },
    {
      key: "revisions",
      header: "Revisions",
      // "Revisions" is wider than a figure cell's label room.
      width: CELL_WIDTHS.time,
      numeric: true,
      hideBelow: "large",
      render: (row) => (
        <Figure value={showsCounts(row) ? row.revisions : null} />
      ),
    },
    {
      key: "last",
      header: "Last sync",
      width: CELL_WIDTHS.time,
      // No time System did not record: an excluded source's is withdrawn, a
      // discovered one was never connected, anything else is not recorded.
      render: (row) =>
        row.group === "excluded" ? (
          <span className="sr-only">Withdrawn</span>
        ) : row.group === "discovered" && !row.lastSync ? (
          <span className="sr-only">Not connected</span>
        ) : (
          <RelativeTime value={row.lastSync} empty="Not recorded" />
        ),
    },
  ];
  return (
    <VStack gap={3} aria-busy={busy} className="sources-view">
      {wantsJobs && ops && <JobStates ops={ops} onJobs={setJobs} />}
      <DataTable
        rows={tableRows(rows, open)}
        rowKey="key"
        label="Sources"
        noun={["source", "sources"]}
        footer={false}
        columns={columns}
        groupBy={(row) => SOURCE_GROUPS[row.group]}
        foldGroup={DISCOVERED_GROUP}
        foldCount={discovered}
      />
      {incomplete && (
        <InlineNotice tone="warning" title="More sources unreadable" />
      )}
    </VStack>
  );
}
