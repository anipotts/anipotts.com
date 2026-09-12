import { editorialRecordSummary } from "./editorial-record-summary";
import { createHash } from "node:crypto";
import {
  editorialRecordPath,
  editorialRecordSchema,
  parseEditorialSource,
  validateEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import type { Draft } from "../editorial/draft-store";
import type { CatalogRecord } from "../components/astryx/EditorialApp";

export type InventoryEntry = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  body?: string;
};
export type ProjectedRecord = CatalogRecord & {
  collection: string;
  id: string;
  changesPending: boolean;
  changedFields?: string[];
  privateRevision?: number;
  privateUpdatedAt?: string;
  publishedUpdated?: CatalogRecord["updated"];
  intendedVisibility?: string;
  capabilities: {
    editable: boolean;
    previewable: boolean;
    reviewOnly: boolean;
  };
};
const sections: Record<string, string> = {
  home: "home",
  projects: "work",
  workPage: "work",
  writing: "writing",
  writingPage: "writing",
  systemsPage: "systems",
  newsletterPage: "newsletter",
};
export function inventoryIdentity(
  entry: Pick<InventoryEntry, "collection" | "id">,
): EditorialRecord | null {
  const parsed = editorialRecordSchema.safeParse({
    kind:
      entry.collection === "projects"
        ? "work"
        : entry.collection === "writing"
          ? "writing"
          : "page",
    id: entry.id,
  });
  return parsed.success ? parsed.data : null;
}
function sourceHash(source: string) {
  const bytes = Buffer.from(source);
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}
function timestamp(value: number): string | undefined {
  return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toISOString()
    : undefined;
}
function metadata(source: string): Record<string, unknown> {
  try {
    return parseEditorialSource(source).data as Record<string, unknown>;
  } catch {
    return {};
  }
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, comparable(item)]),
    );
  return value;
}
function sameValue(before: unknown, after: unknown) {
  return (
    JSON.stringify(comparable(before)) === JSON.stringify(comparable(after))
  );
}
function comparableBody(body: string) {
  // Ignore transport line endings and boundary blank lines, not Markdown indentation or formatting.
  return body.replace(/\r\n/gu, "\n").replace(/^\n+|\n+$/gu, "");
}
/** Labels describe evidenced changes, not validation/readiness or full source disclosure. */
export function inventoryChangedFields(
  entry: InventoryEntry,
  source: string,
): string[] | undefined {
  const identity = inventoryIdentity(entry);
  if (!identity) return undefined;
  try {
    const parsed = parseEditorialSource(source);
    const validated = validateEditorialSource(identity, source);
    if (!validated.success) return undefined;
    const next = validated.data as Record<string, unknown>;
    const previous = entry.data;
    const labels = new Set<string>();
    const names: Record<string, string> = {
      title: "Title",
      headline: "Title",
      hero_title: "Title",
      summary: "Subtitle",
      subtitle: "Subtitle",
      deck: "Subtitle",
      hero_summary: "Subtitle",
      tags: "Tags",
      public_state: "Visibility",
    };
    const compareFields = (
      before: unknown,
      after: unknown,
      path: string[] = [],
    ) => {
      if (sameValue(before, after)) return;
      if (
        before &&
        after &&
        typeof before === "object" &&
        typeof after === "object" &&
        !Array.isArray(before) &&
        !Array.isArray(after) &&
        !(before instanceof Date) &&
        !(after instanceof Date)
      ) {
        const left = before as Record<string, unknown>;
        const right = after as Record<string, unknown>;
        for (const key of new Set([
          ...Object.keys(left),
          ...Object.keys(right),
        ]))
          compareFields(left[key], right[key], [...path, key]);
        return;
      }
      const key = path[0] ?? "";
      const exact = path.join(".");
      labels.add(
        exact === "sections.intro.heading"
          ? "Title"
          : exact === "sections.intro.subheading"
            ? "Subtitle"
            : path.at(-1) === "visible" ||
                (key === "status" && entry.collection !== "projects")
              ? "Visibility"
              : (names[key] ?? "Properties"),
      );
    };
    compareFields(previous, next);
    if (
      typeof entry.body === "string" &&
      comparableBody(entry.body) !== comparableBody(parsed.body)
    )
      labels.add("Body");
    // A parser/schema can discard unsupported YAML keys. Do not assert a complete
    // semantic comparison when their published source or the body is unavailable.
    const unknownKeys = Object.keys(
      parsed.data as Record<string, unknown>,
    ).some((key) => !(key in next));
    if (!labels.size && (typeof entry.body !== "string" || unknownKeys))
      return undefined;
    return [
      "Title",
      "Subtitle",
      "Body",
      "Visibility",
      "Tags",
      "Properties",
    ].filter((label) => labels.has(label));
  } catch {
    return undefined;
  }
}

/** Project current snapshots only. Never serialize private source into list/search props. */
export function projectEditorialInventory(
  entries: InventoryEntry[],
  drafts: Draft[],
  updated: (collection: string, id: string) => CatalogRecord["updated"] = () =>
    undefined,
): ProjectedRecord[] {
  const privateByPath = new Map<string, Draft>();
  for (const draft of drafts) {
    if (draft.discardedAt !== null) continue;
    const previous = privateByPath.get(draft.key);
    if (!previous || draft.revision > previous.revision)
      privateByPath.set(draft.key, draft);
  }
  const records = new Map<string, ProjectedRecord>();
  const add = (entry: InventoryEntry, isPrivateOnly = false) => {
    const identity = inventoryIdentity(entry);
    if (!identity) return;
    const draft = privateByPath.get(editorialRecordPath(identity));
    const data = draft ? metadata(draft.source) : {};
    const publishedUpdated = isPrivateOnly
      ? undefined
      : updated(entry.collection, entry.id);
    const privateUpdatedAt = draft ? timestamp(draft.updatedAt) : undefined;
    const changesPending = Boolean(
      draft && sourceHash(draft.source) !== draft.baseFileHash,
    );
    const status = isPrivateOnly
      ? "draft"
      : entry.collection === "projects"
        ? (text(entry.data.public_state) ?? "hidden")
        : entry.collection === "writing" ||
            entry.collection === "newsletterPage"
          ? (text(entry.data.status) ?? "draft")
          : "published";
    const rawVisibility =
      entry.collection === "projects" ? data.public_state : data.status;
    const visibilityValues =
      entry.collection === "projects"
        ? ["featured", "listed", "hidden"]
        : ["draft", "scheduled", "published"];
    const visibility =
      typeof rawVisibility === "string" &&
      visibilityValues.includes(rawVisibility)
        ? rawVisibility
        : undefined;
    records.set(`${entry.collection}:${entry.id}`, {
      collection: entry.collection,
      id: entry.id,
      title: text(data.title) ?? text(entry.data.title) ?? entry.id,
      summary:
        editorialRecordSummary(identity, data) ??
        editorialRecordSummary(identity, entry.data) ??
        "",
      section: sections[entry.collection],
      status,
      href: `/content/${entry.collection}/${encodeURIComponent(entry.id)}`,
      updated:
        changesPending && privateUpdatedAt
          ? { at: privateUpdatedAt, source: "private" }
          : publishedUpdated,
      publishedUpdated,
      changesPending,
      ...(!isPrivateOnly && draft && changesPending
        ? { changedFields: inventoryChangedFields(entry, draft.source) }
        : {}),
      ...(draft ? { privateRevision: draft.revision, privateUpdatedAt } : {}),
      ...(text(visibility) ? { intendedVisibility: text(visibility) } : {}),
      capabilities: { editable: true, previewable: true, reviewOnly: false },
    });
  };
  entries.forEach((entry) => add(entry));
  for (const draft of privateByPath.values()) {
    const match = /^content\/public\/writing\/([^/]+)\.md$/u.exec(draft.key);
    if (match && !records.has(`writing:${match[1]}`))
      add({ collection: "writing", id: match[1]!, data: {} }, true);
  }
  return [...records.values()];
}

export function editorialInventoryGroups(records: ProjectedRecord[]) {
  return [
    { name: "pages", href: "/content?group=pages", records },
    {
      name: "website",
      href: "/content?group=website",
      records: records.filter(
        (record) => !["writing", "projects"].includes(record.collection),
      ),
    },
    {
      name: "work",
      href: "/content?group=work",
      records: records.filter((record) => record.collection === "projects"),
    },
    {
      name: "writing",
      href: "/content?group=writing",
      records: records.filter((record) => record.collection === "writing"),
    },
    {
      name: "systems",
      href: "/content?group=systems",
      records: records.filter((record) => record.collection === "systemsPage"),
    },
  ];
}
export function editorialInventorySearch(records: ProjectedRecord[]) {
  return records.map((record) => ({
    id: `content:${record.collection}:${record.id}`,
    label: record.title,
    domain: "content" as const,
    kind: record.collection,
    currentFact: record.changesPending
      ? `${record.status}; changes pending`
      : record.status,
    source: record.privateRevision
      ? "private and published content inventory"
      : "content inventory",
    freshness: "current",
    href: record.href,
    keywords: [
      record.id,
      record.collection,
      record.summary ?? "",
      record.status,
    ],
  }));
}

/** Four concurrent latest-snapshot reads; no history/media or operational sources. */
export async function readInventoryDrafts(
  entries: InventoryEntry[],
  storage: {
    listWritingDrafts(): Promise<Draft[]>;
    get(record: EditorialRecord): Promise<Draft | null>;
  },
) {
  const drafts: Draft[] = [];
  let unavailable = false;
  try {
    drafts.push(...(await storage.listWritingDrafts()));
  } catch {
    unavailable = true;
  }
  const identities = entries
    .filter((entry) => entry.collection !== "writing")
    .map(inventoryIdentity)
    .filter((entry): entry is EditorialRecord => entry !== null);
  for (let start = 0; start < identities.length; start += 4) {
    const results = await Promise.allSettled(
      identities
        .slice(start, start + 4)
        .map((identity) => storage.get(identity)),
    );
    for (const result of results) {
      if (result.status === "rejected") unavailable = true;
      else if (result.value) drafts.push(result.value);
    }
  }
  return { drafts, unavailable };
}
