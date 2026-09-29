import {
  listPublished,
  type PublicationDatabase,
} from "@anipotts/content/editorial/direct-publication";
import { editorialRecordSchema } from "@anipotts/content/editorial/source";
import { inventoryIdentity } from "./editorial-inventory-projection";
import {
  publishedInventoryEntry,
  mergePublishedEntries,
} from "./editorial-published-inventory";
import type { CatalogRecord } from "../components/astryx/EditorialApp";
import { getCollection } from "astro:content";
import { siteConfig } from "@anipotts/content/public/site";
import updates from "virtual:editorial-updates";

export function recordUpdate(collection: string, id: string) {
  const directory =
    collection === "projects"
      ? "public/projects"
      : collection === "writing"
        ? "public/writing"
        : collection === "newsletterDrafts"
          ? "editorial/newsletter"
          : "public/pages";
  return updates[`content/${directory}/${id}.md`];
}

export const publicSiteUrl = import.meta.env.DEV
  ? "http://anipotts.localhost:1355/"
  : siteConfig.url;

export const pageCollections = [
  "home",
  "workPage",
  "writingPage",
  "systemsPage",
  "newsletterPage",
] as const;

export async function editorialInventory(env?: unknown) {
  const [projects, writing, ...pageGroups] = await Promise.all([
    getCollection("projects"),
    getCollection("writing"),
    ...pageCollections.map((name) => getCollection(name)),
  ]);
  const pages = pageGroups.flat();
  const base = [...projects, ...writing, ...pages];
  const overrides: Awaited<ReturnType<typeof publishedInventoryEntry>>[] = [];
  const publicationUpdates = new Map<string, CatalogRecord["updated"]>();
  if (import.meta.env.DEV) {
    // Local acknowledged publications stay local. Never contact production from the preview.
    const storage = await (
      await import("./editorial-local")
    ).localDraftStorage();
    const drafts = await storage.listWritingDrafts();
    const identities = new Map(
      base.map((entry) => [
        entry.collection + "/" + entry.id,
        inventoryIdentity(entry),
      ]),
    );
    for (const draft of drafts) {
      const parsed = editorialRecordSchema.safeParse({
        kind: "writing",
        id: draft.key.match(/^content\/public\/writing\/([^/]+)\.md$/u)?.[1],
      });
      if (parsed.success)
        identities.set("writing/" + parsed.data.id, parsed.data);
    }
    await Promise.all(
      [...identities.entries()].map(async ([key, record]) => {
        if (!record) return;
        const acknowledged = await storage.readLocalPublishedBase(record);
        if (!acknowledged) return;
        overrides.push(
          await publishedInventoryEntry(record, acknowledged.source),
        );
        // Acknowledgments currently have no timestamp; later private edits cannot date a publication.
        publicationUpdates.set(key, undefined);
      }),
    );
  } else {
    const db =
      env && typeof env === "object" && "CONTENT_DB" in env
        ? (env.CONTENT_DB as Pick<PublicationDatabase, "prepare"> | undefined)
        : undefined;
    if (db)
      for (const publication of await listPublished(db)) {
        const entry = await publishedInventoryEntry(
          publication.record,
          publication.source,
        );
        overrides.push(entry);
        publicationUpdates.set(entry.collection + "/" + entry.id, {
          at: publication.publishedAt,
          source: "published",
        });
      }
  }
  const merged = mergePublishedEntries<(typeof base)[number]>(base, overrides);
  return {
    projects: merged.filter((entry) => entry.collection === "projects"),
    writing: merged.filter((entry) => entry.collection === "writing"),
    pages: merged.filter(
      (entry) =>
        entry.collection !== "projects" && entry.collection !== "writing",
    ),
    updated: (collection: string, id: string) =>
      publicationUpdates.has(collection + "/" + id)
        ? publicationUpdates.get(collection + "/" + id)
        : recordUpdate(collection, id),
  };
}
