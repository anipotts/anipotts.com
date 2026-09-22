import type { PublishedSnapshot } from "@anipotts/content/editorial/direct-publication";
import {
  editorialRecordPath,
  parseEditorialSource,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import {
  inventoryIdentity,
  type InventoryEntry,
} from "./editorial-inventory-projection";
import { recordCollection } from "./editorial-collections";

/** Complete published records replace bundled values, including hidden
 * records, and carry the time the content store published them. */
export function overlayPublishedInventory(
  entries: InventoryEntry[],
  publications: PublishedSnapshot[],
) {
  const result = new Map(
    entries.map((entry) => {
      const record = inventoryIdentity(entry);
      return [
        record
          ? editorialRecordPath(record)
          : `${entry.collection}:${entry.id}`,
        entry,
      ];
    }),
  );
  for (const publication of publications) {
    const { record, source } = publication;
    const validated = validateEditorialSource(record, source);
    if (!validated.success) throw new Error("invalid_published_content");
    const collection = recordCollection(record);
    if (!collection) throw new Error("unsupported_published_record");
    result.set(editorialRecordPath(record), {
      collection,
      id: record.id,
      data: validated.data as Record<string, unknown>,
      body: parseEditorialSource(source).body,
      published: true,
      publishedAt: publication.publishedAt,
    });
  }
  return [...result.values()];
}
