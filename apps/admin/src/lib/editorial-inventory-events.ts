import type {
  CatalogGroup,
  CatalogRecord,
} from "../components/astryx/EditorialApp";
import type { AdminSearchResult } from "../data/admin-search";
import {
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
export const RECORD_SAVED_EVENT = "editorial:record-saved";
export type EditorialRecordSaved = {
  record: EditorialRecord;
  title: string;
  summary: string;
  revision: number;
  updatedAt: string;
  changesPending: boolean;
  intendedVisibility?: string;
};
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
    typeof item.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(item.updatedAt) ||
    item.updatedAt.length > 64 ||
    !Number.isFinite(Date.parse(item.updatedAt)) ||
    typeof item.changesPending !== "boolean" ||
    (item.intendedVisibility !== undefined &&
      (typeof item.intendedVisibility !== "string" ||
        item.intendedVisibility.length > 64))
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
  };
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
  return (
    id === record.id &&
    (record.kind === "writing"
      ? collection === "writing"
      : record.kind === "work"
        ? collection === "projects"
        : [
            "home",
            "workPage",
            "writingPage",
            "systemsPage",
            "newsletterPage",
          ].includes(collection))
  );
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
  if (
    !matched.size ||
    [...matched].some(
      (href) => (current.revisions[href] ?? 0) >= saved.revision,
    )
  )
    return current;
  const revisions = { ...current.revisions };
  for (const href of matched) revisions[href] = saved.revision;
  const update = (item: CatalogRecord): CatalogRecord =>
    matched.has(item.href)
      ? {
          ...item,
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
            : (item.publishedUpdated ?? item.updated),
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
            currentFact: `${item.currentFact.split(";")[0]}${saved.changesPending ? "; changes pending" : ""}`,
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
