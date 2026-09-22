import { getCollection } from "astro:content";
import { siteConfig } from "@anipotts/content/public/site";
import updates from "virtual:editorial-updates";
import { PAGE_COLLECTIONS } from "./editorial-collections";

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

/** In development the dev server manager passes this worktree's www URL. */
export const publicSiteUrl = import.meta.env.DEV
  ? (import.meta.env.PUBLIC_DEV_SITE_URL ?? "http://127.0.0.1:4321/")
  : siteConfig.url;

export async function editorialInventory() {
  const [projects, writing, ...pageGroups] = await Promise.all([
    getCollection("projects"),
    getCollection("writing"),
    ...Object.values(PAGE_COLLECTIONS).map((name) => getCollection(name)),
  ]);
  const pages = pageGroups.flat();
  return { projects, writing, pages };
}
