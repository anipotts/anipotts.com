/**
 * Data's routes, and where every retired Life and Knowledge URL lands. The
 * kind filter carries over; queries, record ids and cursors never do.
 */
export const DATA_RECORDS_PATH = "/data/records";
export const DATA_SOURCES_PATH = "/data/sources";

export const DATA_KINDS = {
  all: { label: "All kinds", reader: undefined },
  people: { label: "People", reader: "person" },
  projects: { label: "Projects", reader: "project" },
  places: { label: "Places", reader: "place" },
} as const;
export type DataKind = keyof typeof DATA_KINDS;

export function dataKind(value: string | null | undefined): DataKind {
  return value && Object.hasOwn(DATA_KINDS, value)
    ? (value as DataKind)
    : "all";
}

export function dataRecordsHref(kind: DataKind = "all"): string {
  return kind === "all"
    ? DATA_RECORDS_PATH
    : `${DATA_RECORDS_PATH}?kind=${kind}`;
}

/** `/data/records/<id>` for a reader record id, keeping the kind filter. */
export function dataRecordHref(id: string, kind: DataKind = "all"): string {
  const path = `${DATA_RECORDS_PATH}/${encodeURIComponent(id)}`;
  return kind === "all" ? path : `${path}?kind=${kind}`;
}

/** The old `/life/<section>` pages. */
export function lifeRedirect(section: string | undefined): string {
  switch (section) {
    case "people":
    case "projects":
    case "places":
      return dataRecordsHref(section);
    case "sources":
    case "health":
      return DATA_SOURCES_PATH;
    default:
      // overview, timeline (recent records), preview, aesthetics, unknown
      return DATA_RECORDS_PATH;
  }
}

/** The old `/knowledge?kind=` filter. */
export function knowledgeRedirect(kind: string | null): string {
  return kind === "people" || kind === "person"
    ? dataRecordsHref("people")
    : kind === "project" || kind === "projects"
      ? dataRecordsHref("projects")
      : kind === "place" || kind === "places"
        ? dataRecordsHref("places")
        : DATA_RECORDS_PATH;
}
