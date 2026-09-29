import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import {
  homepageSchema,
  listingPageSchema,
  workPageSchema,
  systemsPageSchema,
} from "@anipotts/content/public/pages";
import { inlinePlainText } from "@anipotts/content/public/inline";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import {
  overlayByIdentity,
  publicMarkdown,
  type PublicContentContext,
} from "./published-runtime";
export { publicContentContext } from "./published-runtime";

export type Project = CollectionEntry<"projects">;
export type Writing = CollectionEntry<"writing">;
export const writingSlug = (t: Writing): string => t.data.slug ?? t.id;
export const projectSlug = (p: Project): string => p.data.slug ?? p.id;

export async function publishedWriting(
  context?: PublicContentContext,
): Promise<Writing[]> {
  const overrides: Writing[] = [];
  for (const item of (await context?.publications) ?? []) {
    if (item.record.kind !== "writing") continue;
    const parsed = await publicMarkdown(item.source);
    overrides.push({
      id: item.record.id,
      collection: "writing",
      ...parsed,
      data: writingSchema.parse(parsed.data),
    });
  }
  return overlayByIdentity(await getCollection("writing"), overrides)
    .filter((entry) => isPublishedWriting(entry.data))
    .sort(
      (a, b) =>
        (b.data.published_at?.getTime() ?? 0) -
          (a.data.published_at?.getTime() ?? 0) ||
        writingSlug(a).localeCompare(writingSlug(b)),
    );
}

export async function visibleProjects(
  context?: PublicContentContext,
): Promise<Project[]> {
  const overrides: Project[] = [];
  for (const item of (await context?.publications) ?? []) {
    if (item.record.kind !== "work") continue;
    const parsed = await publicMarkdown(item.source);
    overrides.push({
      id: item.record.id,
      collection: "projects",
      ...parsed,
      data: projectSchema.parse(parsed.data),
    });
  }
  return overlayByIdentity(await getCollection("projects"), overrides)
    .filter((entry) => isPublicProject(entry.data))
    .sort(
      (a, b) =>
        b.data.sort_order - a.data.sort_order ||
        projectSlug(a).localeCompare(projectSlug(b)),
    );
}

const pageDefinitions = {
  home: { collection: "home", schema: homepageSchema },
  work: { collection: "workPage", schema: workPageSchema },
  writing: { collection: "writingPage", schema: listingPageSchema },
  systems: { collection: "systemsPage", schema: systemsPageSchema },
} as const;
export async function publicPage<K extends keyof typeof pageDefinitions>(
  id: K,
  context?: PublicContentContext,
) {
  const definition = pageDefinitions[id];
  const override = ((await context?.publications) ?? []).find(
    (item) => item.record.kind === "page" && item.record.id === id,
  );
  const data = override
    ? parseEditorialSource(override.source).data
    : (await getEntry(definition.collection, id))?.data;
  if (!data) throw new Error("Public page unavailable");
  return definition.schema.parse(data) as ReturnType<
    (typeof pageDefinitions)[K]["schema"]["parse"]
  >;
}

export async function publicSearchIndex(context?: PublicContentContext) {
  return (await publishedWriting(context)).map((entry) => ({
    slug: writingSlug(entry),
    title: entry.data.title,
    summary: inlinePlainText(entry.data.summary),
    date: entry.data.published_at?.toISOString() ?? null,
    text: [
      entry.data.title,
      inlinePlainText(entry.data.summary),
      entry.body ?? "",
    ]
      .join(" ")
      .toLowerCase(),
  }));
}
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
