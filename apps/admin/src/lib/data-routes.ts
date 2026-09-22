/**
 * Data's routes, and where every retired Life and Knowledge URL lands.
 * Records, Sources, Health and Knowledge are sibling destinations. The kind
 * and source filters carry over; queries, record ids and cursors never do.
 */
export const DATA_RECORDS_PATH = "/data/records";
export const DATA_SOURCES_PATH = "/data/sources";
export const DATA_HEALTH_PATH = "/data/health";
export const DATA_KNOWLEDGE_PATH = "/data/knowledge";

/** The kind filter, in the order its chips show. `reader` is the value the
 * private reader's search takes (System's v1 bound is any short token). */
export const DATA_KINDS = {
  all: { label: "All kinds", reader: undefined },
  people: { label: "People", reader: "person" },
  projects: { label: "Projects", reader: "project" },
  places: { label: "Places", reader: "place" },
  events: { label: "Events", reader: "event" },
  notes: { label: "Notes", reader: "note" },
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
export type DataRoute =
  RecordsRoute | { view: "sources" | "health" | "knowledge" };

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
      return { view: "knowledge" };
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
    case "people":
    case "projects":
    case "places":
      return dataRecordsHref(section);
    case "sources":
      return DATA_SOURCES_PATH;
    case "health":
      return DATA_HEALTH_PATH;
    default:
      // overview, timeline (recent records), preview, aesthetics, unknown
      return DATA_RECORDS_PATH;
  }
}

/** The old `/knowledge?kind=` filter: people, projects and places are
 * records now; everything else was a knowledge card. */
export function knowledgeRedirect(kind: string | null): string {
  return kind === "people" || kind === "person"
    ? dataRecordsHref("people")
    : kind === "project" || kind === "projects"
      ? dataRecordsHref("projects")
      : kind === "place" || kind === "places"
        ? dataRecordsHref("places")
        : DATA_KNOWLEDGE_PATH;
}
