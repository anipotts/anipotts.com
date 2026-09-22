import { getCollection } from "astro:content";
import { editorialInventory, recordUpdate } from "./editorial-content";
import {
  getPublishedInventory,
  type PublicationDatabase,
} from "@anipotts/content/editorial/direct-publication";
import { overlayPublishedInventory } from "./editorial-published-inventory";
import { productionEditor } from "./editorial-server";
import {
  editorialInventoryGroups,
  editorialInventorySearch,
  newsletterRecords,
  projectEditorialInventory,
  readInventoryDrafts,
} from "./editorial-inventory-projection";

/** Development only: `?fixture=none` empties every library and
 * `?fixture=error` fails the private draft read, so both states can be seen
 * without touching storage. Production ignores the parameter. */
export type InventoryFixture = "none" | "error" | undefined;
export function inventoryFixture(url: URL): InventoryFixture {
  if (!import.meta.env.DEV) return undefined;
  const value = url.searchParams.get("fixture");
  return value === "none" || value === "error" ? value : undefined;
}

/** Called only from the existing authorized editorial server layout/routes. */
export async function loadEditorialInventory(
  env: unknown,
  fixture?: InventoryFixture,
) {
  const inventory = await editorialInventory();
  let entries: import("./editorial-inventory-projection").InventoryEntry[] = [
    ...inventory.pages,
    ...inventory.projects,
    ...inventory.writing,
  ];
  const values =
    env && typeof env === "object" ? (env as Record<string, unknown>) : {};
  if (!values.CONTENT_DB) throw new Error("content_database_unavailable");
  // Keep unavailable CMS state separate from a successfully empty inventory.
  // A Git fallback here would falsely advertise obsolete published content.
  entries = overlayPublishedInventory(
    entries,
    (await getPublishedInventory(values.CONTENT_DB as PublicationDatabase))
      .publications,
  );
  let privateResult: Awaited<ReturnType<typeof readInventoryDrafts>> = {
    drafts: [],
    unavailable: true,
  };
  try {
    const storage = import.meta.env.DEV
      ? await (await import("./editorial-local")).localDraftStorage()
      : productionEditor(env)?.storage;
    if (storage && fixture !== "error")
      privateResult = await readInventoryDrafts(entries, storage);
  } catch {
    /* Published inventory remains available with a recovery warning. */
  }
  if (fixture === "none") entries = [];
  const records = projectEditorialInventory(
    entries,
    privateResult.drafts.filter(() => fixture !== "none"),
    recordUpdate,
  );
  const newsletter =
    fixture === "none"
      ? []
      : newsletterRecords(
          await getCollection("newsletterDrafts"),
          recordUpdate,
        );
  return {
    records,
    groups: editorialInventoryGroups(records, newsletter),
    searchEntries: editorialInventorySearch([...records, ...newsletter]),
    unavailable: privateResult.unavailable,
  };
}
