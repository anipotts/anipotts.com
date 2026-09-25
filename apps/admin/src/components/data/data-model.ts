/**
 * The reader's records and sources, parsed once into typed shapes, and the
 * one glyph map for record and card kinds. Everything a Data view shows
 * reads these; nothing downstream re-coerces reader JSON.
 */
import {
  ArchiveIcon,
  BarbellIcon,
  BookOpenTextIcon,
  BrowserIcon,
  CalendarBlankIcon,
  ChatCircleSlashIcon,
  ChatCircleTextIcon,
  ChatsCircleIcon,
  CpuIcon,
  FileTextIcon,
  FolderSimpleIcon,
  GitCommitIcon,
  HashIcon,
  HeartbeatIcon,
  LightbulbIcon,
  MapPinIcon,
  MicrophoneIcon,
  NotePencilIcon,
  SealCheckIcon,
  SignpostIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { TileRef } from "../../lib/marks";
import { OPS_V1_BOUNDS } from "../../lib/ops-v1";
import { recordHost } from "../../lib/data-record";
import { recordNaming, type Naming } from "../../lib/naming";
import { sentenceCase } from "../../lib/sentence-case";

export { effectiveDate } from "../../lib/data-record";

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
 * Knowledge and the overview; the reader's own kinds (System's adapters)
 * are listed so none reads as a raw token. */
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
  assertion: [SealCheckIcon, "Assertion"],
  browsing_day: [BrowserIcon, "Browsing day"],
  conversation_message: [ChatsCircleIcon, "Conversation message"],
  health_day: [HeartbeatIcon, "Health day"],
  health_day_private: [HeartbeatIcon, "Private health day"],
  legacy_assertion: [ArchiveIcon, "Legacy assertion"],
  legacy_event: [ArchiveIcon, "Legacy event"],
  message: [ChatCircleTextIcon, "Message"],
  message_retracted: [ChatCircleSlashIcon, "Retracted message"],
  voice_memo: [MicrophoneIcon, "Voice memo"],
  work_day: [GitCommitIcon, "Work day"],
  workout: [BarbellIcon, "Workout"],
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
  /** The device it came from: System's optional `host`, when it names one
   * of the owner's devices. */
  host: string | null;
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
    host: recordHost(item),
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

/**
 * A record as its row names it: the short title, the app tile (the browser
 * most of a browsing day came from, else its source's app) or, when the
 * source has no mark of its own, the glyph for its kind, and its device.
 */
export type RecordMark = Omit<Naming, "tile"> & {
  /** The kind's glyph, drawn when `tile` is null. */
  glyph: Icon;
  kindName: string;
  /** Null when neither the record nor its source has a mark. */
  tile: TileRef | null;
};

export function recordMark(record: DataRecord, now?: number): RecordMark {
  const naming = recordNaming(record, now);
  const [glyph, kindName] = kindGlyph(record.kind);
  const generic = naming.tile.id === null && naming.tile.kind === "source";
  return {
    ...naming,
    // "Untitled" reads as the record's own title when it has none.
    name: record.title ? naming.name : "Untitled",
    tile: generic ? null : naming.tile,
    glyph,
    kindName,
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
/** System's `collection` (system#236). Its fourth value, "unknown" (the
 * catalog entry names none), reads null here, as an older reader's absent
 * key does: nothing is derived from it. */
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
/** A status as read: System's own word, `unknown` for a value outside
 * SOURCE_STATUSES, or null when the reader sent none (an older reader). */
export type SourceStatusRead = SourceStatus | "unknown";
export const SOURCE_TRANSPORTS = [
  "launchd",
  "push",
  "manual",
  "derived",
] as const;
export type SourceTransport = (typeof SOURCE_TRANSPORTS)[number];

export type DataSourceRow = {
  id: string;
  records: number;
  revisions: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** System's catalog fields (store.py SOURCE_METADATA_VIEW), each null
   * until served. Only the ones a view reads are kept. */
  displayName: string | null;
  connector: SourceConnector | null;
  host: string | null;
  collection: SourceCollection | null;
  /** System's status for the source (personal_context_data_v1 serves one
   * for every source since system#231). Null only from an older reader. */
  status: SourceStatusRead | null;
  /** The ops catalog id that collects it, joined to the ops snapshot. */
  job: string | null;
  /** How it arrives. Read only to credit Apple Health: a health source is
   * Apple's only when the phone pushes it. */
  transport: SourceTransport | null;
  discoveredCount: number | null;
  lastSuccessAt: string | null;
  /** The newest record System holds, a detail only. */
  heldTo: string | null;
  /** Field names System sent that this client does not know yet, sorted.
   * Never read; only named, as ops-v1's `unknown_fields` are. */
  unknownFields: string[];
};

/** The fields a source row reads. */
const SOURCE_FIELDS = [
  "source_id",
  "status",
  "first_observed_at",
  "last_observed_at",
  "record_count",
  "revision_count",
  "display_name",
  "connector",
  "host",
  "collection",
  "job",
  "transport",
  "discovered_count",
  "last_success_at",
  "held_to",
];
/** Proposed catalog fields admin knows and deliberately leaves unread. */
const SOURCE_IGNORED_FIELDS = [
  "adapter",
  "held_from",
  "excluded_count",
  "failed_count",
];

/** Any other field's name, bounded, and `other` for a name not worth
 * printing, as ops-v1's `known` notes drift. */
function unknownSourceFields(item: Item): string[] {
  const drift = new Set<string>();
  for (const key of Object.keys(item)) {
    if (SOURCE_FIELDS.includes(key) || SOURCE_IGNORED_FIELDS.includes(key))
      continue;
    if (drift.size >= OPS_V1_BOUNDS.maxUnknownFields) break;
    drift.add(OPS_V1_BOUNDS.fieldName.test(key) ? key : "other");
  }
  return [...drift].sort();
}

/**
 * System's status. Absent or null (an older reader) reads null, "Status not
 * reported". Any other value outside SOURCE_STATUSES reads `unknown` for
 * this source alone: the reply is never rejected and the value is never
 * shown. This follows ops-v1, where a catalog entry with no readable state
 * is `unknown` and a host it does not know is `other`, rather than its
 * trigger rule, whose null would claim System said nothing.
 */
function sourceStatus(value: unknown): SourceStatusRead | null {
  if (value === undefined || value === null) return null;
  return oneOf(SOURCE_STATUSES, value) ?? "unknown";
}

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
 * A /v1/data/sources row. The six fields System serves parse (`status` since
 * system#231); the catalog fields a view reads parse when present and valid
 * and are null otherwise. The proposed fields admin leaves unread (adapter,
 * held span start, counts of excluded or failed items) are ignored, and any
 * other field is never read, only named in `unknownFields`.
 */
export function parseSource(value: unknown): DataSourceRow | null {
  const item = object(value);
  const id = text(item?.source_id);
  if (!item || !id) return null;
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
    status: sourceStatus(item.status),
    job: token(item.job),
    transport: oneOf(SOURCE_TRANSPORTS, item.transport),
    discoveredCount: optionalCount(item.discovered_count),
    lastSuccessAt: instant(item.last_success_at),
    heldTo: instant(item.held_to),
    unknownFields: unknownSourceFields(item),
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
