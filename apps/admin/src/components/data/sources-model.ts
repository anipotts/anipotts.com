/**
 * Sources by connector. Each reader source row resolves a connector family,
 * a device, a lifecycle and a state; rows of one family in one lifecycle
 * fold into one row with their accounts nested (Gmail x3, Contacts x3).
 *
 * System's catalog fields (`display_name`, `connector`, `host`,
 * `collection`, `status`, `job`, `last_success_at`, `held_to`) decide when
 * present. Until System serves them, the id's words stand in for the
 * connector and the device. A count never decides a lifecycle: with neither
 * `collection` nor `status`, a source with nothing recorded is discovery
 * inventory, and one with records is only "Status not reported", never
 * Connected or Live. An excluded source sits in its own group near the
 * bottom, whatever its counts say.
 *
 * Nothing here guesses a schedule or a freshness. A live source mirrors the
 * ops job that collects it (`job`, joined to the ops snapshot): an ok job is
 * Live, and stale, failing, degraded and asleep read as themselves. No job,
 * a job the snapshot does not list, an unknown one, or no current snapshot
 * reads a neutral Unjudged. A multi-app pass (SYNC_JOBS: pro.pc-send) never
 * judges a source, in any state: its receipt proves a pass finished, not that
 * this source's data arrived (Messages held nothing past May 2024 under a
 * green pass, S-3), so its sources read Unjudged until System serves a
 * per-source arrival (XA-12). `held_to` is only the newest record, never a
 * staleness signal.
 *
 * Times: `last_success_at` is the only sync time ("Last sync");
 * `last_observed_at` is when the newest record was observed ("Last seen"),
 * never a sync.
 */
import { brandMark } from "@anipotts/brand/marks";
import type { TileRef } from "../../lib/marks";
import {
  caseWords,
  hostDevice,
  idDevice,
  isDeviceWord,
  keyLabel,
  SYNC_JOBS,
  sourceNaming,
  withoutOwner,
} from "../../lib/naming";
import {
  SOURCE_CONNECTORS,
  type DataSourceRow,
  type SourceConnector,
} from "./data-model";

export const CONNECTOR_LABELS: Record<SourceConnector, string> = {
  browsing: "Browsing",
  messages: "Messages",
  contacts: "Contacts",
  mail: "Mail",
  calendar: "Calendar",
  notes: "Notes",
  media: "Media",
  agent_transcripts: "Agent transcripts",
  code: "Code",
  health: "Health",
  legacy_vaults: "Legacy vaults",
  other: "Other",
};

/** Words in a source id that name its connector, in the order they are
 * tried: "brain-pro-vault" is a legacy vault, "meeting-notes" notes. */
const CONNECTOR_WORDS: ReadonlyArray<[SourceConnector, readonly string[]]> = [
  ["health", ["health"]],
  ["browsing", ["browsing", "browser", "chrome", "safari", "atlas"]],
  ["mail", ["gmail", "mail", "email"]],
  ["calendar", ["calendar"]],
  ["messages", ["messages", "message", "imessage", "sms", "whatsapp"]],
  ["contacts", ["contacts", "contact", "connection"]],
  ["agent_transcripts", ["claude", "codex", "chatgpt", "transcripts"]],
  [
    "legacy_vaults",
    ["vault", "vaults", "legacy", "brain", "rudy", "silver", "outboxes"],
  ],
  ["notes", ["notes", "note", "ideas", "meeting", "obsidian", "granola"]],
  ["media", ["photos", "photo", "voice", "memos", "spotify"]],
  ["code", ["github", "git"]],
];

const words = (id: string) =>
  withoutOwner(id.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** The connector family from System, else from the id's words. */
export function sourceConnector(source: DataSourceRow): SourceConnector {
  if (source.connector) return source.connector;
  const found = new Set(words(source.id));
  for (const [connector, names] of CONNECTOR_WORDS)
    if (names.some((name) => found.has(name))) return connector;
  return "other";
}

/** The device from System's `host`, else a device word in the id. */
export function sourceHost(source: DataSourceRow): string | null {
  if (source.host) return hostDevice(source.host) ? source.host : null;
  return idDevice(source.id);
}

/** Lifecycles, in the order their groups show. `connected` is a source
 * System gives a status but no lifecycle. `unreported` is one System says
 * nothing about but that holds records. `excluded` holds what System
 * withdrew: it sits after the others, just above the folded discovered
 * group. */
export type SourceGroup =
  "live" | "connected" | "imported" | "unreported" | "excluded" | "discovered";
export const SOURCE_GROUPS: Record<SourceGroup, string> = {
  live: "Live",
  connected: "Connected",
  imported: "Imported once",
  unreported: "Status not reported",
  excluded: "Excluded",
  discovered: "Discovered, not connected",
};
export const DISCOVERED_GROUP = SOURCE_GROUPS.discovered;

export function sourceGroup(source: DataSourceRow): SourceGroup {
  if (source.status === "excluded") return "excluded";
  if (source.collection === "live") return "live";
  if (source.collection === "one_shot") return "imported";
  if (source.collection === "discovered" || source.status === "discovered")
    return "discovered";
  // Only with no word from System at all do the counts say anything, and
  // then only that nothing was recorded. An enrolled source that is empty
  // keeps its own lifecycle.
  if (source.collection === null && source.status === null)
    return source.records === 0 && source.revisions === 0
      ? "discovered"
      : "unreported";
  return "connected";
}

/** Groups whose rows hold nothing to open or count: an excluded source's
 * records are withdrawn, a discovered one never had any. */
export function holdsRecords(group: SourceGroup): boolean {
  return group !== "excluded" && group !== "discovered";
}

/**
 * A source's state, most severe first. `live` and `connected` and
 * `imported` and `discovered` are the ordinary states of their groups and
 * show as a quiet mark; the rest are exceptions and show as chips.
 */
export const SOURCE_STATES = [
  "failed",
  "stale",
  "degraded",
  "unavailable",
  "paused",
  "pending",
  "asleep",
  "excluded",
  "unjudged",
  "live",
  "connected",
  "imported",
  "unreported",
  "discovered",
] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

/** When System last recorded the source syncing: its own `last_success_at`
 * only. The newest record's observation is not a sync (lastSeen). */
export function lastSync(source: DataSourceRow): string | null {
  return source.lastSuccessAt;
}

/** When System observed the source's newest record: "Last seen", never a
 * sync. For an excluded source it can be the exclusion itself (S-20), so
 * excluded rows show none. */
export function lastSeen(source: DataSourceRow): string | null {
  return source.lastObservedAt;
}

/** The ops job that collects a source, as the snapshot reports it. */
export type SourceJob = {
  /** The job's own state from System ("ok", "stale", "failing", ...). */
  state: string;
};
export type SourceJobs = ReadonlyMap<string, SourceJob>;

/** A live source mirrors its job's own state. Anything that cannot be
 * joined (no job, no snapshot, a job the snapshot does not list, or an
 * unknown state) is Unjudged, never Live, and so is a source collected by a
 * multi-app pass (SYNC_JOBS), whose state says nothing about one source. */
function liveState(
  source: DataSourceRow,
  jobs: SourceJobs | null,
): SourceState {
  if (source.job && SYNC_JOBS.includes(source.job)) return "unjudged";
  const job = source.job ? jobs?.get(source.job) : undefined;
  switch (job?.state) {
    case "ok":
      return "live";
    case "stale":
      return "stale";
    case "failing":
      return "failed";
    case "degraded":
      return "degraded";
    case "asleep":
      return "asleep";
    default:
      return "unjudged";
  }
}

export function sourceState(
  source: DataSourceRow,
  jobs: SourceJobs | null = null,
): SourceState {
  const status = source.status;
  if (status === "excluded") return "excluded";
  if (status === "failed") return "failed";
  if (status === "paused") return "paused";
  const group = sourceGroup(source);
  if (group === "discovered")
    return status === "unavailable" ? "unavailable" : "discovered";
  if (status === "unavailable") return "unavailable";
  if (group === "live") return liveState(source, jobs);
  if (status === "pending") return "pending";
  if (group === "unreported") return "unreported";
  return group === "imported" ? "imported" : "connected";
}

export function worstState(states: readonly SourceState[]): SourceState {
  let worst: SourceState = "discovered";
  for (const state of states)
    if (SOURCE_STATES.indexOf(state) < SOURCE_STATES.indexOf(worst))
      worst = state;
  return worst;
}

/** One reader source, resolved. */
export type SourceEntry = {
  source: DataSourceRow;
  connector: SourceConnector;
  group: SourceGroup;
  name: string;
  tile: TileRef;
  /** The device id (ap-pro, ap-mini), when one resolves. */
  device: string | null;
  tooltip: string;
};

export function sourceEntry(source: DataSourceRow): SourceEntry {
  const naming = sourceNaming({
    id: source.id,
    host: sourceHost(source),
    displayName: source.displayName,
    connector: source.connector,
    transport: source.transport,
  });
  return {
    source,
    connector: sourceConnector(source),
    group: sourceGroup(source),
    name: naming.name,
    tile: naming.tile,
    device: naming.device?.id ?? null,
    tooltip: source.id,
  };
}

/** Source names by id, from the catalog, for pages that name a record's
 * source (Records, the overview, the record panel), so a source reads the
 * same there as on Sources. */
export type SourceNames = ReadonlyMap<
  string,
  { name: string; tile: TileRef; device: string | null }
>;
export function sourceNames(sources: readonly DataSourceRow[]): SourceNames {
  return new Map(
    sources.map((source) => {
      const entry = sourceEntry(source);
      return [
        source.id,
        { name: entry.name, tile: entry.tile, device: entry.device },
      ];
    }),
  );
}

/** A nested account's label inside its family row: what tells it apart
 * from its siblings. The family's words go ("gmail-nyu" under Gmail is
 * "NYU"), and an account that differs only by device reads as the device. */
export function accountName(
  entry: SourceEntry,
  family: { label: string; tile: TileRef | null },
): string {
  if (entry.source.displayName) return entry.source.displayName;
  const drop = new Set([
    ...words(family.label),
    ...words(CONNECTOR_LABELS[entry.connector]),
    ...(family.tile?.id
      ? [
          family.tile.id,
          ...(brandMark(family.tile.id)?.aliases ?? []),
          ...words(brandMark(family.tile.id)?.label ?? ""),
        ]
      : []),
  ]);
  const rest = words(entry.source.id).filter(
    (word) => !drop.has(word) && !isDeviceWord(word),
  );
  if (!rest.length)
    return entry.device
      ? (brandMark(entry.device)?.label ?? entry.name)
      : entry.name;
  return caseWords(keyLabel(rest.join(" ")));
}

/** Accounts that read the same under one family ("Codex" on two Macs) take
 * their device's name too, so every nested row names itself. */
function distinctNames(rows: SourceRow[]): SourceRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return rows.map((row) =>
    (counts.get(row.name) ?? 0) > 1 && row.device
      ? {
          ...row,
          name: `${row.name} on ${brandMark(row.device)?.label ?? row.device}`,
        }
      : row,
  );
}

/** One table row: a source on its own, a family that folds several, or an
 * account nested under an open family. */
export type SourceRow = {
  /** Unique in the table. */
  key: string;
  kind: "source" | "family" | "account";
  group: SourceGroup;
  connector: SourceConnector;
  name: string;
  /** The shared app tile; null for a family of different apps, which
   * shows its connector's glyph. */
  tile: TileRef | null;
  device: string | null;
  tooltip: string;
  state: SourceState;
  /** System's own `last_success_at` for the source. */
  lastSync: string | null;
  /** When the newest record was observed. */
  lastSeen: string | null;
  /** System's `held_to`: the newest record it holds. A detail only, never
   * a staleness signal. */
  newest: string | null;
  records: number;
  revisions: number;
  /** Items System found but has not recorded. */
  discovered: number | null;
  /** The reader source id a row opens Records for; families open none, and
   * nor does an excluded source, whose records System withdrew. */
  sourceId: string | null;
  /** A family's accounts, by the names they read under it. */
  accounts: SourceRow[];
};

const same = <T>(values: T[]): T | null =>
  values.length && values.every((value) => value === values[0])
    ? values[0]!
    : null;

const newest = (values: Array<string | null>): string | null =>
  values.reduce<string | null>((best, value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return best;
    return !best || Date.parse(value) > Date.parse(best) ? value : best;
  }, null);

function sourceRow(
  entry: SourceEntry,
  jobs: SourceJobs | null,
  kind: "source" | "account",
  name = entry.name,
): SourceRow {
  const { source } = entry;
  const holds = holdsRecords(entry.group);
  return {
    key: `${kind}:${source.id}`,
    kind,
    group: entry.group,
    connector: entry.connector,
    name,
    tile: entry.tile,
    device: entry.device,
    tooltip: entry.tooltip,
    state: sourceState(source, jobs),
    lastSync: holds ? lastSync(source) : null,
    lastSeen: holds ? lastSeen(source) : null,
    newest: holds ? source.heldTo : null,
    records: source.records,
    revisions: source.revisions,
    discovered: source.discoveredCount,
    sourceId: holds || entry.group === "discovered" ? source.id : null,
    accounts: [],
  };
}

const GROUP_ORDER = Object.keys(SOURCE_GROUPS) as SourceGroup[];
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en");

/**
 * The table's rows: grouped by lifecycle (Live, Connected, Imported once,
 * Status not reported, Excluded, then Discovered), one row per connector family in each,
 * families in connector order. Sources of the Other family never fold: they are
 * different things, not accounts of one connector.
 */
export function sourceRows(
  sources: readonly DataSourceRow[],
  jobs: SourceJobs | null = null,
): SourceRow[] {
  const buckets = new Map<string, SourceEntry[]>();
  for (const source of sources) {
    const entry = sourceEntry(source);
    const key =
      entry.connector === "other"
        ? `${entry.group}:other:${source.id}`
        : `${entry.group}:${entry.connector}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }
  const rows: SourceRow[] = [];
  for (const [key, entries] of buckets) {
    if (entries.length === 1) {
      rows.push(sourceRow(entries[0]!, jobs, "source"));
      continue;
    }
    const [first] = entries as [SourceEntry];
    const shared = same(entries.map((entry) => entry.tile.id));
    const tile = shared ? first.tile : null;
    const label =
      (shared && brandMark(shared)?.label) || CONNECTOR_LABELS[first.connector];
    const accounts = distinctNames(
      entries.map((entry) =>
        sourceRow(entry, jobs, "account", accountName(entry, { label, tile })),
      ),
    ).sort(byName);
    const discovered = entries.map((entry) => entry.source.discoveredCount);
    rows.push({
      key: `family:${key}`,
      kind: "family",
      group: first.group,
      connector: first.connector,
      name: label,
      tile,
      device: same(entries.map((entry) => entry.device)),
      tooltip: entries.map((entry) => entry.source.id).join(", "),
      state: worstState(accounts.map((row) => row.state)),
      lastSync: newest(accounts.map((row) => row.lastSync)),
      lastSeen: newest(accounts.map((row) => row.lastSeen)),
      newest: newest(accounts.map((row) => row.newest)),
      records: accounts.reduce((sum, row) => sum + row.records, 0),
      revisions: accounts.reduce((sum, row) => sum + row.revisions, 0),
      discovered: discovered.some((value) => value !== null)
        ? discovered.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : null,
      sourceId: null,
      accounts,
    });
  }
  const connectorOrder = (connector: SourceConnector) =>
    SOURCE_CONNECTORS.indexOf(connector);
  return rows.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      connectorOrder(a.connector) - connectorOrder(b.connector) ||
      byName(a, b),
  );
}
