import { createHash } from "node:crypto";
import {
  editorialRecordPath,
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import {
  getPublished,
  getPublishedInventory,
  type PublicationDatabase,
} from "@anipotts/content/editorial/direct-publication";
import { validateEditorialSnapshot } from "@anipotts/content/editorial/snapshot";
import { newWritingSource } from "./writing-draft";

// Only the already versioned public inventory is bundled. Private drafts and
// Life/Operations sources must never enter this glob.
const sources = import.meta.glob("../../../../content/public/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function bundledEditorialSources() {
  return Object.entries(sources).flatMap(([path, source]) => {
    const match = /\/public\/(pages|projects|writing)\/([^/]+)\.md$/.exec(path);
    if (!match) return [];
    const record = editorialRecordSchema.safeParse({
      kind:
        match[1] === "pages"
          ? "page"
          : match[1] === "projects"
            ? "work"
            : "writing",
      id: match[2],
    });
    return record.success ? [{ record: record.data, source }] : [];
  });
}

export async function readPublishedBase(
  db: PublicationDatabase,
  record: EditorialRecord,
) {
  const published = await getPublished(db, record);
  const bundled = bundledEditorialSources().find(
    (entry) =>
      editorialRecordPath(entry.record) === editorialRecordPath(record),
  );
  const source = published?.source ?? bundled?.source;
  if (source === undefined && record.kind !== "writing")
    throw new Error("record_not_found");
  const bytes = Buffer.from(source ?? newWritingSource());
  return {
    directPublication: published
      ? (({ source: _source, ...receipt }) => receipt)(published)
      : null,
    source: bytes.toString(),
    // Retain the legacy base envelope for private draft compatibility. The
    // direct publisher uses a separate publication ID, never this Git field.
    baseCommit:
      import.meta.env.PUBLIC_RELEASE_SHA ||
      "0000000000000000000000000000000000000000",
    baseFileHash:
      source === undefined
        ? null
        : createHash("sha1")
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest("hex"),
  };
}

export async function validatePublishedCandidate(
  db: PublicationDatabase,
  record: EditorialRecord,
  source: string,
) {
  const inventory = await getPublishedInventory(db);
  const merged = new Map(
    bundledEditorialSources().map((entry) => [
      editorialRecordPath(entry.record),
      entry,
    ]),
  );
  for (const entry of inventory.publications)
    merged.set(editorialRecordPath(entry.record), entry);
  merged.set(editorialRecordPath(record), { record, source });
  return {
    valid: validateEditorialSnapshot([...merged.values()]).length === 0,
    inventoryVersion: inventory.version,
  };
}
