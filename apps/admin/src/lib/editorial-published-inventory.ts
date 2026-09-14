import {
  parseEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { writingSchema, projectSchema } from "@anipotts/content/public/schema";
import {
  homepageSchema,
  workPageSchema,
  listingPageSchema,
  systemsPageSchema,
  newsletterPageSchema,
} from "@anipotts/content/public/pages";
import { renderArticlePreview } from "./article-preview";

/** Fresh entries deliberately omit the build's deferred renderer and stale compiled body. */
export async function publishedInventoryEntry(
  record: EditorialRecord,
  source: string,
) {
  const { data, body } = parseEditorialSource(source);
  const base = {
    id: record.id,
    publishedSource: source,
    body,
    rendered: { html: await renderArticlePreview(body) },
  };
  if (record.kind === "writing")
    return {
      ...base,
      collection: "writing" as const,
      data: writingSchema.parse(data),
    };
  if (record.kind === "work")
    return {
      ...base,
      collection: "projects" as const,
      data: projectSchema.parse(data),
    };
  switch (record.id) {
    case "home":
      return {
        ...base,
        collection: "home" as const,
        data: homepageSchema.parse(data),
      };
    case "work":
      return {
        ...base,
        collection: "workPage" as const,
        data: workPageSchema.parse(data),
      };
    case "writing":
      return {
        ...base,
        collection: "writingPage" as const,
        data: listingPageSchema.parse(data),
      };
    case "systems":
      return {
        ...base,
        collection: "systemsPage" as const,
        data: systemsPageSchema.parse(data),
      };
    case "newsletter":
      return {
        ...base,
        collection: "newsletterPage" as const,
        data: newsletterPageSchema.parse(data),
      };
  }
}
export function mergePublishedEntries<
  T extends { collection: string; id: string },
>(base: T[], updates: T[]): T[] {
  const records = new Map(
    base.map((entry) => [`${entry.collection}/${entry.id}`, entry]),
  );
  for (const entry of updates)
    records.set(`${entry.collection}/${entry.id}`, entry);
  return [...records.values()];
}
