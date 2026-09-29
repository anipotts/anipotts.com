import { editorialInventory } from "./editorial-content";
import { editorialStorage } from "./editorial-server";
import {
  editorialInventoryGroups,
  editorialInventorySearch,
  projectEditorialInventory,
  readInventoryDrafts,
} from "./editorial-inventory-projection";

/** Called only from the existing authorized editorial server layout/routes. */
export async function loadEditorialInventory(env: unknown) {
  const inventory = await editorialInventory(env).catch(() => null);
  if (!inventory)
    return { records: [], groups: [], searchEntries: [], unavailable: true };
  const entries = [
    ...inventory.pages,
    ...inventory.projects,
    ...inventory.writing,
  ];
  let privateResult: Awaited<ReturnType<typeof readInventoryDrafts>> = {
    drafts: [],
    unavailable: true,
  };
  try {
    const storage = import.meta.env.DEV
      ? await (await import("./editorial-local")).localDraftStorage()
      : editorialStorage(env);
    if (storage) privateResult = await readInventoryDrafts(entries, storage);
  } catch {
    /* Published inventory remains available with a recovery warning. */
  }
  const records = projectEditorialInventory(
    entries,
    privateResult.drafts,
    inventory.updated,
  );
  return {
    records,
    groups: editorialInventoryGroups(records),
    searchEntries: editorialInventorySearch(records),
    unavailable: privateResult.unavailable,
  };
}
