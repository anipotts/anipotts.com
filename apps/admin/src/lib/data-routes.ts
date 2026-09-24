/**
 * Data's routes, and where every retired Life and Knowledge URL lands.
 * Records, Sources, Health and Knowledge are sibling destinations. The kind
 * and source filters carry over; queries, record ids, entity ids and cursors
 * never do.
 */
const DATA_RECORDS_PATH = "/data/records";
const DATA_SOURCES_PATH = "/data/sources";
const DATA_HEALTH_PATH = "/data/health";
const DATA_KNOWLEDGE_PATH = "/data/knowledge";

/**
 * The kind filter, in the order its chips show: the kinds System's adapters
 * really write (ledger A-30), each keyed and read by its own name, since
 * the reader's search takes one exact kind. In order of what they hold:
 * activity, people, notes and documents, then the legacy vault archive.
 * The store's other kinds (handle classifications, connections, group
 * memberships, assertions, moments, profiles) stay under All kinds.
 * Counts in the store on 2026-09-22 (read-only): legacy_event 5,610,
 * message 5,000, document 2,751, contact 969, work_day 435, note 424,
 * browsing_day 212, voice_memo 44.
 */
export const DATA_KINDS = {
  all: { label: "All kinds", reader: undefined },
  browsing_day: { label: "Browsing", reader: "browsing_day" },
  work_day: { label: "Work days", reader: "work_day" },
  message: { label: "Messages", reader: "message" },
  contact: { label: "Contacts", reader: "contact" },
  note: { label: "Notes", reader: "note" },
  voice_memo: { label: "Voice memos", reader: "voice_memo" },
  document: { label: "Documents", reader: "document" },
  // The legacy vaults' events, as Sources names the family.
  legacy_event: { label: "Legacy", reader: "legacy_event" },
} as const;
export type DataKind = keyof typeof DATA_KINDS;
export type ReaderKind = NonNullable<(typeof DATA_KINDS)[DataKind]["reader"]>;
export const READER_KINDS = Object.values(DATA_KINDS)
  .map((kind) => kind.reader)
  .filter((kind): kind is ReaderKind => kind !== undefined);

export function dataKind(value: string | null | undefined): DataKind {
  return value && Object.hasOwn(DATA_KINDS, value)
    ? (value as DataKind)
    : "all";
}

/** The life wiki's kinds (lib/private-reader-knowledge.ts), in the order
 * their chips show. */
export const KNOWLEDGE_KINDS = {
  person: { label: "People", one: "Person" },
  project: { label: "Projects", one: "Project" },
  place: { label: "Places", one: "Place" },
  topic: { label: "Topics", one: "Topic" },
} as const;
export type EntityKind = keyof typeof KNOWLEDGE_KINDS;

export function entityKind(
  value: string | null | undefined,
): EntityKind | null {
  return value && Object.hasOwn(KNOWLEDGE_KINDS, value)
    ? (value as EntityKind)
    : null;
}

/** An entity id in a path segment. System has not fixed the format, so
 * this bounds it to one URL-safe segment. */
export const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** A reader source id, as the reader's bounds allow one in a URL. */
const SOURCE_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const RECORD_ID = /^rec-[0-9a-f]{32}$/;

export function dataSource(value: string | null | undefined): string | null {
  return value && SOURCE_ID.test(value) ? value : null;
}

/** The list filters a Records URL carries. */
export type RecordsFilter = { kind?: DataKind; source?: string | null };

function filterQuery({ kind = "all", source = null }: RecordsFilter) {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (source) params.set("source", source);
  return params.size ? `?${params}` : "";
}

export function dataRecordsHref(filter: RecordsFilter | DataKind = {}): string {
  const value = typeof filter === "string" ? { kind: filter } : filter;
  return `${DATA_RECORDS_PATH}${filterQuery(value)}`;
}

/** `/data/records/<id>` for a reader record id, keeping the list filters. */
export function dataRecordHref(
  id: string,
  filter: RecordsFilter | DataKind = {},
): string {
  const value = typeof filter === "string" ? { kind: filter } : filter;
  return `${DATA_RECORDS_PATH}/${encodeURIComponent(id)}${filterQuery(value)}`;
}

export type DataView = "records" | "sources" | "health" | "knowledge";

export type RecordsRoute = {
  view: "records";
  id: string | null;
  kind: DataKind;
  source: string | null;
};
/** The life wiki: the entity list, filtered by kind, or one entity. */
export type KnowledgeRoute = {
  view: "knowledge";
  id: string | null;
  kind: EntityKind | null;
};
export type DataRoute =
  RecordsRoute | KnowledgeRoute | { view: "sources" } | { view: "health" };

/** `/data/knowledge`, with its kind filter. */
export function knowledgeHref(kind: EntityKind | null = null): string {
  return kind ? `${DATA_KNOWLEDGE_PATH}?kind=${kind}` : DATA_KNOWLEDGE_PATH;
}

/** `/data/knowledge/<id>` for an entity, keeping the kind filter. */
export function knowledgeEntityHref(
  id: string,
  kind: EntityKind | null = null,
): string {
  return `${DATA_KNOWLEDGE_PATH}/${id}${kind ? `?kind=${kind}` : ""}`;
}

export const DATA_VIEW_TITLES: Record<DataView, string> = {
  records: "Records",
  sources: "Sources",
  health: "Health",
  knowledge: "Knowledge",
};

/** A Data URL as a route, or null for one that is not a Data page. A record
 * id the reader would refuse is not a page either. */
export function dataRoute(url: URL): DataRoute | null {
  const path = url.pathname.replace(/\/$/, "");
  switch (path) {
    case DATA_SOURCES_PATH:
      return { view: "sources" };
    case DATA_HEALTH_PATH:
      return { view: "health" };
    case DATA_KNOWLEDGE_PATH:
      return {
        view: "knowledge",
        id: null,
        kind: entityKind(url.searchParams.get("kind")),
      };
  }
  const entity = /^\/data\/knowledge\/([^/]+)$/.exec(path);
  if (entity) {
    const id = entity[1]!;
    // The entity id is its own URL segment, never a decoded one.
    return ENTITY_ID.test(id)
      ? {
          view: "knowledge",
          id,
          kind: entityKind(url.searchParams.get("kind")),
        }
      : null;
  }
  const kind = dataKind(url.searchParams.get("kind"));
  const source = dataSource(url.searchParams.get("source"));
  if (path === DATA_RECORDS_PATH)
    return { view: "records", id: null, kind, source };
  const match = /^\/data\/records\/([^/]+)$/.exec(path);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
  return RECORD_ID.test(id) ? { view: "records", id, kind, source } : null;
}

/** The old `/life/<section>` pages. */
export function lifeRedirect(section: string | undefined): string {
  switch (section) {
    // The retired Life taxonomy: its people are System's contacts, and no
    // adapter writes projects or places.
    case "people":
      return dataRecordsHref("contact");
    case "sources":
      return DATA_SOURCES_PATH;
    case "health":
      return DATA_HEALTH_PATH;
    default:
      // overview, timeline (recent records), preview, aesthetics, unknown
      return DATA_RECORDS_PATH;
  }
}

/** The old `/knowledge?kind=` filter lands on the life wiki's own kind:
 * people, projects, places and topics each have entity pages there. Any
 * other card kind lands on the wiki itself. */
export function knowledgeRedirect(kind: string | null): string {
  const value = (kind ?? "").toLowerCase();
  const singular: Record<string, EntityKind> = {
    people: "person",
    person: "person",
    projects: "project",
    project: "project",
    places: "place",
    place: "place",
    locations: "place",
    topics: "topic",
    topic: "topic",
  };
  return knowledgeHref(
    Object.hasOwn(singular, value) ? singular[value]! : null,
  );
}
