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

const pageCollections: Record<string, string> = {
  home: "home",
  work: "workPage",
  writing: "writingPage",
  systems: "systemsPage",
  newsletter: "newsletterPage",
};

/** Complete published records replace bundled values, including hidden records. */
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
    const collection =
      record.kind === "writing"
        ? "writing"
        : record.kind === "work"
          ? "projects"
          : pageCollections[record.id];
    if (!collection) throw new Error("unsupported_published_record");
    result.set(editorialRecordPath(record), {
      collection,
      id: record.id,
      data: validated.data as Record<string, unknown>,
      body: parseEditorialSource(source).body,
    });
  }
  return [...result.values()];
}
