import { createHash } from "node:crypto";
import {
  editorialRecordPath,
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import {
  getPublishedInventory,
  type PublicationDatabase,
  type PublishedSnapshot,
} from "@anipotts/content/editorial/direct-publication";
import {
  publicationSourceHash,
  bundledPublicationSourceHash,
} from "@anipotts/content/editorial/publication-contract";
import { validateEditorialSnapshot } from "@anipotts/content/editorial/snapshot";
import { newWritingSource } from "./writing-draft";

export function bundledEditorialSources() {
  // Vite compiles this literal glob for production and provider-runtime tests.
  // The local private-draft Worker is bundled by bare esbuild, which has no
  // import.meta.glob transform. Defer access until a publication baseline is
  // actually requested; never substitute an empty inventory for direct mode.
  const sources = import.meta.glob("../../../../content/public/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
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

type Inventory = { version: number; publications: PublishedSnapshot[] };
export async function publishedBaseFromInventory(
  inventory: Inventory,
  record: EditorialRecord,
) {
  const path = editorialRecordPath(record);
  const published = inventory.publications.find(
    (entry) => editorialRecordPath(entry.record) === path,
  );
  const bundled = bundledEditorialSources().find(
    (entry) => editorialRecordPath(entry.record) === path,
  );
  const existing = published?.source ?? bundled?.source;
  if (existing === undefined && record.kind !== "writing")
    throw new Error("record_not_found");
  const source = existing ?? newWritingSource();
  const bytes = Buffer.from(source);
  return {
    source,
    // Compatibility with existing private save envelopes only. Direct activation
    // is bound to publicationId/sourceSha256, never this legacy Git-shaped field.
    baseCommit:
      import.meta.env.PUBLIC_RELEASE_SHA ||
      "0000000000000000000000000000000000000000",
    baseFileHash:
      existing === undefined
        ? null
        : createHash("sha1")
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest("hex"),
    publicationId: published?.publicationId ?? null,
    sourceSha256: await publicationSourceHash(source),
    inventoryVersion: inventory.version,
  };
}

export async function readPublishedBase(
  db: PublicationDatabase,
  record: EditorialRecord,
) {
  return publishedBaseFromInventory(await getPublishedInventory(db), record);
}

export async function validatePublishedCandidate(
  db: PublicationDatabase,
  record: EditorialRecord,
  source: string,
) {
  const inventory = await getPublishedInventory(db);
  const baseline = await publishedBaseFromInventory(inventory, record);
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
    baseline,
  };
}

let bundledHash: Promise<string> | undefined;
export function bundledEditorialSourceHash(): Promise<string> {
  return (bundledHash ??= bundledPublicationSourceHash(
    bundledEditorialSources(),
  ));
}
