import { editorialInventory, recordUpdate } from "./editorial-content";
import {
  getPublishedInventory,
  type PublicationDatabase,
} from "@anipotts/content/editorial/direct-publication";
import { overlayPublishedInventory } from "./editorial-published-inventory";
import { productionEditor } from "./editorial-server";
import { publisherMode } from "./runtime-contract";
import {
  editorialInventoryGroups,
  editorialInventorySearch,
  projectEditorialInventory,
  readInventoryDrafts,
} from "./editorial-inventory-projection";

/** Called only from the existing authorized editorial server layout/routes. */
export async function loadEditorialInventory(env: unknown) {
  const inventory = await editorialInventory();
  let entries: import("./editorial-inventory-projection").InventoryEntry[] = [
    ...inventory.pages,
    ...inventory.projects,
    ...inventory.writing,
  ];
  const values =
    env && typeof env === "object" ? (env as Record<string, unknown>) : {};
  const mode = publisherMode(values);
  if (mode === "direct" || mode === "maintenance") {
    if (!values.CONTENT_DB) throw new Error("content_database_unavailable");
    // Keep unavailable CMS state separate from a successfully empty inventory.
    // A Git fallback here would falsely advertise obsolete published content.
    entries = overlayPublishedInventory(
      entries,
      (await getPublishedInventory(values.CONTENT_DB as PublicationDatabase))
        .publications,
    );
  }
  let privateResult: Awaited<ReturnType<typeof readInventoryDrafts>> = {
    drafts: [],
    unavailable: true,
  };
  try {
    const storage = import.meta.env.DEV
      ? await (await import("./editorial-local")).localDraftStorage()
      : productionEditor(env)?.storage;
    if (storage) privateResult = await readInventoryDrafts(entries, storage);
  } catch {
    /* Published inventory remains available with a recovery warning. */
  }
  const records = projectEditorialInventory(
    entries,
    privateResult.drafts,
    recordUpdate,
  );
  return {
    records,
    groups: editorialInventoryGroups(records),
    searchEntries: editorialInventorySearch(records),
    unavailable: privateResult.unavailable,
  };
}
