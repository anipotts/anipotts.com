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
  type EditorialInventoryStatus,
  type InventoryDraftMetadata,
} from "./editorial-inventory-projection";

/** These local previews exercise each source failure without touching storage. */
export type InventoryFixture =
  "none" | "error" | "published-error" | "inventory-error" | undefined;
export function inventoryFixture(url: URL): InventoryFixture {
  if (!import.meta.env.DEV) return undefined;
  switch (url.searchParams.get("fixture")) {
    case "none":
      return "none";
    case "error":
      return "error";
    case "published-error":
      return "published-error";
    case "inventory-error":
      return "inventory-error";
    default:
      return undefined;
  }
}

const unavailableDrafts = { drafts: [], unavailable: true };
const CATALOG_DEADLINE_MS = 15_000;
const METADATA_DEADLINE_MS = 3_000;
function boundedRead<T>(read: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("editorial_inventory_timeout")),
      timeoutMs,
    );
  });
  return Promise.race([Promise.resolve().then(read), deadline]).finally(() =>
    clearTimeout(timer),
  );
}

/** Called only from the existing authorized editorial server layout/routes. */
export async function loadEditorialInventory(
  env: unknown,
  fixture?: InventoryFixture,
  purpose: "catalog" | "metadata" = "catalog",
) {
  if (fixture === "none") {
    return {
      records: [],
      groups: editorialInventoryGroups([]),
      searchEntries: [],
      status: {
        published: "ready",
        drafts: "ready",
      } satisfies EditorialInventoryStatus,
    };
  }
  const inventory = await editorialInventory();
  const entries: import("./editorial-inventory-projection").InventoryEntry[] = [
    ...inventory.pages,
    ...inventory.projects,
    ...inventory.writing,
  ];
  const values =
    env && typeof env === "object" ? (env as Record<string, unknown>) : {};
  const small = purpose === "metadata";
  const deadline = small ? METADATA_DEADLINE_MS : CATALOG_DEADLINE_MS;

  const published = boundedRead(async () => {
    if (
      !values.CONTENT_DB ||
      fixture === "published-error" ||
      fixture === "inventory-error"
    )
      throw new Error("content_database_unavailable");
    const result = await getPublishedInventory(
      values.CONTENT_DB as PublicationDatabase,
    );
    return overlayPublishedInventory(entries, result.publications, {
      includeBody: !small,
    });
  }, deadline);
  const drafts = (async () => {
    if (fixture === "error" || fixture === "inventory-error")
      return unavailableDrafts;
    try {
      const storage = productionEditor(env)?.storage;
      if (!storage) return unavailableDrafts;
      if (small) {
        const rows: InventoryDraftMetadata[] = await boundedRead(
          () => storage.listDraftInventoryMetadata(),
          deadline,
        );
        return { drafts: rows, unavailable: false };
      }
      // The production store lists each collection, including private-only
      // records. The bundled baseline is enough for the compatibility reader.
      return await readInventoryDrafts(entries, storage);
    } catch {
      return unavailableDrafts;
    }
  })();
  const publishedResult = published.then(
    (rows) => ({ rows, unavailable: false }),
    () => ({
      rows: entries.map((entry) => ({
        ...entry,
        published: null,
        publishedAt: undefined,
        publicationId: undefined,
      })),
      unavailable: true,
    }),
  );
  const [publicInventory, privateInventory, newsletter] = await Promise.all([
    publishedResult,
    drafts,
    getCollection("newsletterDrafts").then((items) =>
      newsletterRecords(items, recordUpdate),
    ),
  ]);
  const records = projectEditorialInventory(
    publicInventory.rows,
    privateInventory.drafts,
    recordUpdate,
  );
  const status: EditorialInventoryStatus = {
    published: publicInventory.unavailable ? "unavailable" : "ready",
    drafts: !privateInventory.unavailable
      ? "ready"
      : privateInventory.drafts.length
        ? "partial"
        : "unavailable",
  };
  return {
    records,
    groups: small ? [] : editorialInventoryGroups(records, newsletter),
    searchEntries: editorialInventorySearch(
      [...records, ...newsletter],
      status,
    ),
    status,
  };
}
