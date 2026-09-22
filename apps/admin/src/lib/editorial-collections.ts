import type { EditorialRecord } from "@anipotts/content/editorial/source";
import { newProjectSource } from "./project-draft";
import { newWritingSource } from "./writing-draft";

/** Each page record id and the content collection that stores it. */
export const PAGE_COLLECTIONS = {
  home: "home",
  work: "workPage",
  writing: "writingPage",
  systems: "systemsPage",
  newsletter: "newsletterPage",
} as const;

const pageCollectionNames = new Set<string>(Object.values(PAGE_COLLECTIONS));

/** The collection that stores a record; undefined for an unknown page. */
export function recordCollection(record: EditorialRecord): string | undefined {
  if (record.kind === "writing") return "writing";
  if (record.kind === "work") return "projects";
  return Object.hasOwn(PAGE_COLLECTIONS, record.id)
    ? PAGE_COLLECTIONS[record.id as keyof typeof PAGE_COLLECTIONS]
    : undefined;
}

/** The record kind a collection stores; undefined outside the editor. */
export function collectionKind(
  collection: string,
): EditorialRecord["kind"] | undefined {
  if (collection === "writing") return "writing";
  if (collection === "projects") return "work";
  return pageCollectionNames.has(collection) ? "page" : undefined;
}

/** The first saved source of a writing or project record. */
export function newRecordSource(record: EditorialRecord, title?: string) {
  return record.kind === "work"
    ? newProjectSource(record.id, title)
    : newWritingSource(title);
}
