/**
 * The reader's records and sources, parsed once into typed shapes, and the
 * one glyph map for record and card kinds. Everything a Data view shows
 * reads these; nothing downstream re-coerces reader JSON.
 */
import {
  BookOpenTextIcon,
  CalendarBlankIcon,
  CpuIcon,
  FileTextIcon,
  FolderSimpleIcon,
  HashIcon,
  HeartbeatIcon,
  LightbulbIcon,
  MapPinIcon,
  NotePencilIcon,
  SignpostIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import { markLabel, sourceMark, type TileRef } from "../../lib/marks";
import { sentenceCase } from "../../lib/sentence-case";

type Item = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" && value !== ""
    ? value
    : typeof value === "number"
      ? String(value)
      : null;
const count = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
const object = (value: unknown): Item | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Item)
    : null;

/** Record and card kinds, as a glyph and a name. One map for Records,
 * Knowledge and the overview. */
const KINDS: Record<string, [Icon, string]> = {
  person: [UserIcon, "Person"],
  contact: [UserIcon, "Person"],
  project: [FolderSimpleIcon, "Project"],
  place: [MapPinIcon, "Place"],
  event: [CalendarBlankIcon, "Event"],
  moment: [CalendarBlankIcon, "Moment"],
  note: [NotePencilIcon, "Note"],
  decision: [SignpostIcon, "Decision"],
  concept: [LightbulbIcon, "Concept"],
  system: [CpuIcon, "System"],
  reference: [BookOpenTextIcon, "Reference"],
  health: [HeartbeatIcon, "Health"],
  topic: [HashIcon, "Topic"],
};

export function kindGlyph(kind: unknown): [Icon, string] {
  if (typeof kind === "string" && Object.hasOwn(KINDS, kind))
    return KINDS[kind]!;
  return [
    FileTextIcon,
    typeof kind === "string" && kind ? sentenceCase(kind) : "Record",
  ];
}

/** A source as a tile and a short name. A branded source reads as its
 * brand ("synthetic-contacts" is Contacts); others read as their id in
 * words. The raw id belongs in the tooltip. */
export type SourceLabel = { id: string; tile: TileRef; name: string };

export function sourceLabel(id: string): SourceLabel {
  const tile = sourceMark(id);
  return {
    id,
    tile,
    name: markLabel(tile) ?? sentenceCase(id.replace(/[-_.]+/g, " ")),
  };
}

type DataRevision = {
  id: string;
  version: string | null;
  observedAt: string | null;
};

export type DataRecord = {
  id: string;
  revisionId: string | null;
  kind: string | null;
  title: string | null;
  /** The reader's match excerpt, on search results only. */
  excerpt: string | null;
  body: string | null;
  source: string | null;
  sourceUri: string | null;
  status: string;
  tier: string | null;
  observedAt: string | null;
  occurredAt: string | null;
  datePrecision: string | null;
  nextBodyOffset: number | null;
  historyLimit: number | null;
  origins: number;
  revisions: DataRevision[];
  assertion: Item | null;
  metadata: Item | null;
  /** The reader's own object, for body paging. */
  raw: Item;
};

export function parseRecord(value: unknown): DataRecord | null {
  const item = object(value);
  const id = text(item?.record_id);
  if (!item || !id) return null;
  const revisions = Array.isArray(item.revisions)
    ? item.revisions.flatMap((entry): DataRevision[] => {
        const revision = object(entry);
        const revisionId = text(revision?.revision_id);
        return revision && revisionId
          ? [
              {
                id: revisionId,
                version: text(revision.source_version),
                observedAt: text(revision.observed_at),
              },
            ]
          : [];
      })
    : [];
  const next = item.next_body_offset;
  return {
    id,
    revisionId: text(item.revision_id),
    kind: text(item.kind),
    title: text(item.title),
    excerpt: text(item.search_excerpt),
    body: text(item.body),
    source: text(item.source_id),
    sourceUri: text(object(item.provenance)?.source_uri),
    status: text(item.status) ?? "unknown",
    tier: text(item.tier),
    observedAt: text(item.observed_at),
    occurredAt: text(item.occurred_at),
    datePrecision: text(item.date_precision),
    nextBodyOffset:
      typeof next === "number" && Number.isSafeInteger(next) ? next : null,
    historyLimit:
      typeof item.history_limit === "number" ? item.history_limit : null,
    origins: Array.isArray(item.origins) ? item.origins.length : 0,
    revisions,
    assertion: object(item.assertion),
    metadata: object(item.metadata),
    raw: item,
  };
}

/** System's source catalog vocabulary. Each optional field is read only
 * when its value is one of these; anything else reads as absent, so the
 * row falls back to what its id and counts say. */
export const SOURCE_CONNECTORS = [
  "browsing",
  "messages",
  "contacts",
  "mail",
  "calendar",
  "notes",
  "media",
  "agent_transcripts",
  "code",
  "health",
  "legacy_vaults",
  "other",
] as const;
export type SourceConnector = (typeof SOURCE_CONNECTORS)[number];
export const SOURCE_COLLECTIONS = ["live", "one_shot", "discovered"] as const;
export type SourceCollection = (typeof SOURCE_COLLECTIONS)[number];
export const SOURCE_STATUSES = [
  "discovered",
  "unavailable",
  "pending",
  "partial",
  "current",
  "failed",
  "excluded",
  "paused",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export type DataSourceRow = {
  id: string;
  records: number;
  revisions: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** System's proposed catalog fields (round 2), each null until served. */
  displayName: string | null;
  connector: SourceConnector | null;
  host: string | null;
  collection: SourceCollection | null;
  status: SourceStatus | null;
  coverage: string | null;
  adapter: string | null;
  /** The ops catalog id that collects it. */
  job: string | null;
  transport: string | null;
  launchdLabel: string | null;
  intervalSeconds: number | null;
  discoveredCount: number | null;
  excludedCount: number | null;
  failedCount: number | null;
  lastSuccessAt: string | null;
  heldFrom: string | null;
  heldTo: string | null;
};

const oneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
): T | null =>
  typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T)
    : null;
/** A short catalog word or label, bounded so nothing long reaches a row. */
const label = (value: unknown, max = 120): string | null =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : null;
const token = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)
    ? value
    : null;
const instant = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
const optionalCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

/**
 * A /v1/data/sources row. The five fields System serves today always parse;
 * the proposed catalog fields parse when present and valid and are null
 * otherwise. Any other field is ignored, as it always was.
 */
export function parseSource(value: unknown): DataSourceRow | null {
  const item = object(value);
  const id = text(item?.source_id);
  if (!item || !id) return null;
  const interval = optionalCount(item.interval_s);
  return {
    id,
    records: count(item.record_count),
    revisions: count(item.revision_count),
    firstObservedAt: text(item.first_observed_at),
    lastObservedAt: text(item.last_observed_at),
    displayName: label(item.display_name),
    connector: oneOf(SOURCE_CONNECTORS, item.connector),
    host: token(item.host),
    collection: oneOf(SOURCE_COLLECTIONS, item.collection),
    status: oneOf(SOURCE_STATUSES, item.status),
    coverage: token(item.coverage),
    adapter: token(item.adapter),
    job: token(item.job),
    transport: token(item.transport),
    launchdLabel: token(item.launchd_label),
    intervalSeconds: interval !== null && interval > 0 ? interval : null,
    discoveredCount: optionalCount(item.discovered_count),
    excludedCount: optionalCount(item.excluded_count),
    failedCount: optionalCount(item.failed_count),
    lastSuccessAt: instant(item.last_success_at),
    heldFrom: instant(item.held_from),
    heldTo: instant(item.held_to),
  };
}

/** A ready page's items, parsed, with any unusable item left out. */
export function parseItems<T>(
  data: Item,
  parse: (value: unknown) => T | null,
): T[] {
  return Array.isArray(data.items)
    ? data.items.flatMap((value) => {
        const parsed = parse(value);
        return parsed ? [parsed] : [];
      })
    : [];
}

/** An effective date at its own precision: a day, a month or a year, read in
 * UTC so a date never shifts across a timezone. */
export function effectiveDate(
  value: string | null,
  precision: string | null,
): string | null {
  if (!value) return null;
  const ms = Date.parse(value.length === 4 ? `${value}-01-01` : value);
  if (!Number.isFinite(ms)) return value;
  const options: Intl.DateTimeFormatOptions =
    precision === "year" || value.length === 4
      ? { year: "numeric" }
      : precision === "month" || value.length === 7
        ? { year: "numeric", month: "long" }
        : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(ms);
}

/** Evidence as label and value pairs, one level deep. */
export function evidenceFields(value: Item): Array<[string, string]> {
  return Object.entries(value).map(([key, entry]) => [
    sentenceCase(key),
    typeof entry === "string"
      ? entry
      : entry === null || entry === undefined
        ? "None"
        : typeof entry === "object"
          ? JSON.stringify(entry)
          : String(entry),
  ]);
}
