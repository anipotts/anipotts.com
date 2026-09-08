import { getCollection, type CollectionEntry } from "astro:content";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";

export type Project = CollectionEntry<"projects">;
export type Writing = CollectionEntry<"writing">;

export const writingSlug = (t: Writing): string => t.data.slug ?? t.id;
export const projectSlug = (p: Project): string => p.data.slug ?? p.id;

export async function publishedWriting(): Promise<Writing[]> {
  const entries = await getCollection("writing", (t) =>
    isPublishedWriting(t.data),
  );
  return entries.sort(
    (a, b) =>
      (b.data.published_at?.getTime() ?? 0) -
      (a.data.published_at?.getTime() ?? 0),
  );
}

export async function visibleProjects(): Promise<Project[]> {
  const entries = await getCollection("projects", (project) =>
    isPublicProject(project.data),
  );
  return entries.sort((a, b) => b.data.sort_order - a.data.sort_order);
}

export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
