import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import {
  homepageSchema,
  listingPageSchema,
  workPageSchema,
  systemsPageSchema,
} from "@anipotts/content/public/pages";
import {
  overlayByIdentity,
  publicationData,
  publicationHtml,
  type PublicContentContext,
} from "./published-runtime";
import type { PublishedSnapshot } from "@anipotts/content/editorial/direct-publication";
export { publicContentContext } from "./published-runtime";

export type Project = CollectionEntry<"projects"> & {
  publication?: PublishedSnapshot;
};
export type Writing = CollectionEntry<"writing"> & {
  publication?: PublishedSnapshot;
};
export const writingSlug = (t: Writing): string => t.data.slug ?? t.id;
export const projectSlug = (p: Project): string => p.data.slug ?? p.id;

function uniqueRoutes<T>(entries: T[], slug: (entry: T) => string): T[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const route = slug(entry);
    if (seen.has(route)) throw new Error("public_route_collision");
    seen.add(route);
  }
  return entries;
}
export async function publishedWriting(
  context?: PublicContentContext,
): Promise<Writing[]> {
  const overrides: Writing[] = [];
  for (const item of (await context?.inventory)?.publications ?? []) {
    if (item.record.kind !== "writing") continue;
    const parsed = publicationData(context!, item);
    overrides.push({
      id: item.record.id,
      collection: "writing",
      // Astro's glob loader trims entry bodies; match it for Git parity.
      body: parsed.body.trim(),
      data: writingSchema.parse(parsed.data),
      publication: item,
    });
  }
  return uniqueRoutes(
    overlayByIdentity<Writing>(
      await getCollection("writing"),
      overrides,
    ).filter((entry) => isPublishedWriting(entry.data)),
    writingSlug,
  ).sort(
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
  for (const item of (await context?.inventory)?.publications ?? []) {
    if (item.record.kind !== "work") continue;
    const parsed = publicationData(context!, item);
    overrides.push({
      id: item.record.id,
      collection: "projects",
      // Astro's glob loader trims entry bodies; match it for Git parity.
      body: parsed.body.trim(),
      data: projectSchema.parse(parsed.data),
      publication: item,
    });
  }
  return uniqueRoutes(
    overlayByIdentity<Project>(
      await getCollection("projects"),
      overrides,
    ).filter((entry) => isPublicProject(entry.data)),
    projectSlug,
  ).sort(
    (a, b) =>
      b.data.sort_order - a.data.sort_order ||
      projectSlug(a).localeCompare(projectSlug(b)),
  );
}
/** Only detail routes compile Markdown; lists and discovery use metadata/body. */
export async function renderPublishedEntry<T extends Writing | Project>(
  entry: T,
  context: PublicContentContext,
): Promise<T> {
  return entry.publication
    ? {
        ...entry,
        rendered: { html: await publicationHtml(context, entry.publication) },
      }
    : entry;
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
  const override = ((await context?.inventory)?.publications ?? []).find(
    (item) => item.record.kind === "page" && item.record.id === id,
  );
  const data = override
    ? publicationData(context!, override).data
    : (await getEntry(definition.collection, id))?.data;
  if (!data) throw new Error("public_page_unavailable");
  return definition.schema.parse(data) as ReturnType<
    (typeof pageDefinitions)[K]["schema"]["parse"]
  >;
}
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
