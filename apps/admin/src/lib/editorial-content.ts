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

export async function editorialInventory() {
  const [projects, writing, ...pageGroups] = await Promise.all([
    getCollection("projects"),
    getCollection("writing"),
    ...pageCollections.map((name) => getCollection(name)),
  ]);
  const pages = pageGroups.flat();
  return { projects, writing, pages };
}
