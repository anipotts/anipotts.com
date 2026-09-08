import { getCollection, type CollectionEntry } from "astro:content";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";

type ProjectEntry = CollectionEntry<"projects">;
type WritingEntry = CollectionEntry<"writing">;

export interface Project {
  id: string;
  slug: string;
  body: string;
  entry: ProjectEntry;
  data: ProjectEntry["data"];
}

export interface Writing {
  id: string;
  slug: string;
  body: string;
  entry: WritingEntry;
  data: WritingEntry["data"];
}

export const writingSlug = (t: Writing): string => t.slug;
export const projectSlug = (p: Project): string => p.slug;

function projectFromEntry(entry: ProjectEntry): Project {
  const slug = entry.data.slug ?? entry.id;
  return {
    id: entry.id,
    slug,
    body: entry.body ?? "",
    entry,
    data: entry.data,
  };
}

function writingFromEntry(entry: WritingEntry): Writing {
  const slug = entry.data.slug ?? entry.id;
  return {
    id: entry.id,
    slug,
    body: entry.body ?? "",
    entry,
    data: entry.data,
  };
}

export async function publishedWriting(): Promise<Writing[]> {
  const entries = await getCollection("writing", (t) =>
    isPublishedWriting(t.data),
  );
  return entries
    .map(writingFromEntry)
    .sort(
      (a, b) =>
        (b.data.published_at?.getTime() ?? 0) -
        (a.data.published_at?.getTime() ?? 0),
    );
}

export async function visibleProjects(): Promise<Project[]> {
  const entries = await getCollection("projects", (project) =>
    isPublicProject(project.data),
  );
  return entries
    .map(projectFromEntry)
    .sort((a, b) => b.data.sort_order - a.data.sort_order);
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
