import type {
  CatalogGroup,
  CatalogRecord,
} from "../components/astryx/EditorialApp";
import type { AdminSearchResult } from "../data/admin-search";
import {
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/record";
import { collectionKind } from "./editorial-collections";
export const RECORD_SAVED_EVENT = "editorial:record-saved";
export const RECORD_CREATED_EVENT = "editorial:record-created";
export type EditorialRecordSaved = {
  record: EditorialRecord;
  title: string;
  summary: string;
  revision: number;
  updatedAt: string;
  changesPending: boolean;
  intendedVisibility?: string;
  /** Set when this revision reached the website. The row stops showing
   * pending changes and takes the published time. */
  publishedAt?: string;
};
export type EditorialRecordCreated = {
  record: Extract<EditorialRecord, { kind: "writing" | "work" }>;
  title: string;
  summary: string;
  revision: number;
  updatedAt: string;
};
function isoTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}
export function parseEditorialRecordSaved(
  value: unknown,
): EditorialRecordSaved | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const record = editorialRecordSchema.safeParse(item.record);
  if (
    !record.success ||
    typeof item.title !== "string" ||
    !item.title.trim() ||
    item.title.length > 2048 ||
    typeof item.summary !== "string" ||
    item.summary.length > 16000 ||
    !Number.isSafeInteger(item.revision) ||
    (item.revision as number) < 1 ||
    !isoTime(item.updatedAt) ||
    typeof item.changesPending !== "boolean" ||
    (item.intendedVisibility !== undefined &&
      (typeof item.intendedVisibility !== "string" ||
        item.intendedVisibility.length > 64)) ||
    (item.publishedAt !== undefined &&
      (!isoTime(item.publishedAt) || item.changesPending))
  )
    return null;
  return {
    record: record.data,
    title: item.title,
    summary: item.summary,
    revision: item.revision as number,
    updatedAt: new Date(item.updatedAt).toISOString(),
    changesPending: item.changesPending,
    ...(typeof item.intendedVisibility === "string"
      ? { intendedVisibility: item.intendedVisibility }
      : {}),
    ...(typeof item.publishedAt === "string"
      ? { publishedAt: new Date(item.publishedAt).toISOString() }
      : {}),
  };
}
export function parseEditorialRecordCreated(
  value: unknown,
): EditorialRecordCreated | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const saved = parseEditorialRecordSaved({ ...item, changesPending: true });
  if (
    !saved ||
    (saved.record.kind !== "writing" && saved.record.kind !== "work") ||
    "publishedAt" in item
  )
    return null;
  return {
    record: saved.record,
    title: saved.title,
    summary: saved.summary,
    revision: saved.revision,
    updatedAt: saved.updatedAt,
  };
}
export function dispatchEditorialRecordCreated(
  value: EditorialRecordCreated,
): boolean {
  const detail = parseEditorialRecordCreated(value);
  if (!detail) return false;
  window.dispatchEvent(new CustomEvent(RECORD_CREATED_EVENT, { detail }));
  return true;
}
export function dispatchEditorialRecordSaved(
  value: EditorialRecordSaved,
): boolean {
  const detail = parseEditorialRecordSaved(value);
  if (!detail) return false;
  window.dispatchEvent(new CustomEvent(RECORD_SAVED_EVENT, { detail }));
  return true;
}
export type InventoryView = {
  groups?: CatalogGroup[];
  searchEntries?: AdminSearchResult[];
  revisions: Record<string, number>;
};
export function createInventoryView(
  groups?: CatalogGroup[],
  searchEntries?: AdminSearchResult[],
): InventoryView {
  const revisions: Record<string, number> = {};
  for (const group of groups ?? [])
    for (const record of group.records)
      revisions[record.href] = Math.max(
        revisions[record.href] ?? 0,
        record.privateRevision ?? 0,
      );
  return { groups, searchEntries, revisions };
}
function matchesRecord(
  collection: string,
  id: string,
  record: EditorialRecord,
) {
  return id === record.id && collectionKind(collection) === record.kind;
}
function matchesHref(href: string, record: EditorialRecord) {
  const match = /^\/content\/([^/]+)\/([^/?#]+)(?:[?#]|$)/.exec(href);
  if (!match) return false;
  try {
    return matchesRecord(match[1]!, decodeURIComponent(match[2]!), record);
  } catch {
    return false;
  }
}
export function applyEditorialRecordSaved(
  current: InventoryView,
  value: unknown,
): InventoryView {
  const saved = parseEditorialRecordSaved(value);
  if (!saved) return current;
  const matched = new Set<string>();
  for (const group of current.groups ?? [])
    for (const item of group.records)
      if (matchesHref(item.href, saved.record)) matched.add(item.href);
  for (const item of current.searchEntries ?? [])
    if (item.domain === "content" && matchesHref(item.href, saved.record))
      matched.add(item.href);
  // A newer revision always wins. The same revision applies once more only
  // when it reaches the website, which clears its pending state.
  const published = saved.publishedAt !== undefined;
  if (
    !matched.size ||
    [...matched].some((href) => {
      const known = current.revisions[href] ?? 0;
      return published ? known > saved.revision : known >= saved.revision;
    })
  )
    return current;
  const publishedUpdated = published
    ? { at: saved.publishedAt!, source: "cms" as const }
    : undefined;
  const visibilityIsStatus =
    saved.record.kind === "writing" || saved.record.kind === "work";
  const revisions = { ...current.revisions };
  for (const href of matched) revisions[href] = saved.revision;
  const status = (item: { status: string }) =>
    published && visibilityIsStatus && saved.intendedVisibility
      ? saved.intendedVisibility
      : item.status;
  const update = (item: CatalogRecord): CatalogRecord =>
    matched.has(item.href)
      ? {
          ...item,
          ...(publishedUpdated
            ? { status: status(item), publishedUpdated }
            : {}),
          title: saved.title,
          summary: saved.summary,
          changesPending: saved.changesPending,
          // Field-level comparisons are recomputed by the server projection.
          changedFields: undefined,
          privateRevision: saved.revision,
          privateUpdatedAt: saved.updatedAt,
          intendedVisibility: saved.intendedVisibility,
          updated: saved.changesPending
            ? { at: saved.updatedAt, source: "private" }
            : (publishedUpdated ?? item.publishedUpdated ?? item.updated),
        }
      : item;
  return {
    ...current,
    revisions,
    groups: current.groups?.map((group) => ({
      ...group,
      records: group.records.map(update),
    })),
    searchEntries: current.searchEntries?.map((item) =>
      matched.has(item.href) && item.domain === "content"
        ? {
            ...item,
            label: saved.title,
            currentFact: `${published ? status({ status: item.currentFact.split(";")[0]! }) : item.currentFact.split(";")[0]}${saved.changesPending ? "; changes pending" : ""}`,
            freshness: saved.updatedAt,
            source: "private and published content inventory",
            keywords: [
              saved.record.id,
              item.kind,
              saved.summary,
              item.currentFact.split(";")[0]!,
            ],
          }
        : item,
    ),
  };
}

/** Insert a newly created writing draft, the way the server projection lists a
 * private-only draft, unless the row already exists. */
export function applyEditorialRecordCreated(
  current: InventoryView,
  value: unknown,
): InventoryView {
  const created = parseEditorialRecordCreated(value);
  if (!created) return current;
  const project = created.record.kind === "work";
  const collection = project ? "projects" : "writing";
  const href = `/content/${collection}/${encodeURIComponent(created.record.id)}`;
  const exists =
    current.groups?.some((group) =>
      group.records.some((item) => item.href === href),
    ) ||
    current.searchEntries?.some(
      (item) => item.domain === "content" && item.href === href,
    );
  if (exists)
    return applyEditorialRecordSaved(current, {
      ...created,
      changesPending: true,
    });
  const row: CatalogRecord = {
    collection,
    id: created.record.id,
    title: created.title,
    summary: created.summary,
    section: project ? "work" : "writing",
    status: "draft",
    href,
    updated: { at: created.updatedAt, source: "private" },
    changesPending: true,
    privateRevision: created.revision,
    privateUpdatedAt: created.updatedAt,
    intendedVisibility: project ? "hidden" : "draft",
    capabilities: { editable: true, previewable: true, reviewOnly: false },
  };
  return {
    ...current,
    revisions: { ...current.revisions, [href]: created.revision },
    groups: current.groups?.map((group) =>
      group.name === "pages" || group.name === (project ? "work" : "writing")
        ? { ...group, records: [...group.records, row] }
        : group,
    ),
    searchEntries: current.searchEntries && [
      ...current.searchEntries,
      {
        id: `content:${collection}:${created.record.id}`,
        label: created.title,
        domain: "content",
        kind: collection,
        currentFact: "draft; changes pending",
        source: "private and published content inventory",
        freshness: created.updatedAt,
        href,
        keywords: [created.record.id, collection, created.summary, "draft"],
      },
    ],
  };
}
