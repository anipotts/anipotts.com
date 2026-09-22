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
import { markLabel, sourceMark, type TileRef } from "../../lib/marks";
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

export type DataSourceRow = {
  id: string;
  records: number;
  revisions: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
};

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
