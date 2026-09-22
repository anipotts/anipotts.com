import {
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { libraryPaths } from "./content-library-state";
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

/** The page each old D1 page key held. */
const LEGACY_PAGE_KEYS: Record<string, keyof typeof PAGE_COLLECTIONS> = {
  home: "home",
  making: "work",
  projects: "work",
  writing: "writing",
  orchestrating: "systems",
  newsletter: "newsletter",
  newsletter_archive: "newsletter",
};

/** The retired `/content/edit/<page key>` diagnostics: a record lands on its
 * editor, a new one on the create page and anything else on Pages. */
export function legacyEditRedirect(pageKey = ""): string {
  const key = pageKey.replace(/%3a/i, ":");
  if (key === "new" || key === "writing:new") return "/content/new";
  const [, prefix, id] = /^(writing|project):(.+)$/.exec(key) ?? [];
  const record = editorialRecordSchema.safeParse({
    kind: prefix === "project" ? "work" : "writing",
    id,
  });
  if (prefix && record.success)
    return `/content/${recordCollection(record.data)}/${record.data.id}`;
  const page = Object.hasOwn(LEGACY_PAGE_KEYS, key) && LEGACY_PAGE_KEYS[key];
  return page
    ? `/content/${PAGE_COLLECTIONS[page]}/${page}`
    : libraryPaths.website;
}

/** The first saved source of a writing or project record. */
export function newRecordSource(record: EditorialRecord, title?: string) {
  return record.kind === "work"
    ? newProjectSource(record.id, title)
    : newWritingSource(title);
}
