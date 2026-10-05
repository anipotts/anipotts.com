import { getCollection } from "astro:content";
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

export { publicSiteUrl } from "./public-site-url";

export async function editorialInventory() {
  const [projects, writing, ...pageGroups] = await Promise.all([
    getCollection("projects"),
    getCollection("writing"),
    ...Object.values(PAGE_COLLECTIONS).map((name) => getCollection(name)),
  ]);
  const pages = pageGroups.flat();
  return { projects, writing, pages };
}
