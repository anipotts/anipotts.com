import { publicSlugSchema } from "./schema.js";
import { isPublishedWriting } from "./visibility.js";

type RecordEntry = {
  id: string;
  data: { slug?: string; status?: string; project?: string };
};

/** Cross-record checks run when building the serving index, never while rendering a request. */
export function validateContentReferences(
  projects: RecordEntry[],
  writing: RecordEntry[],
  featuredWriting: string[],
): void {
  function slugs(entries: RecordEntry[], collection: string) {
    const seen = new Set<string>();
    for (const entry of entries) {
      const slug = publicSlugSchema.parse(entry.data.slug ?? entry.id);
      if (seen.has(slug))
        throw new Error(`Duplicate ${collection} slug: ${slug}`);
      seen.add(slug);
    }
    return seen;
  }
  const projectSlugs = slugs(projects, "project");
  slugs(writing, "writing");
  for (const entry of writing) {
    if (entry.data.project && !projectSlugs.has(entry.data.project)) {
      throw new Error(
        `Unknown project reference in ${entry.id}: ${entry.data.project}`,
      );
    }
  }
  const published = new Set(
    writing
      .filter((entry) => isPublishedWriting(entry.data))
      .map((entry) => entry.data.slug ?? entry.id),
  );
  for (const slug of featuredWriting) {
    if (!published.has(slug))
      throw new Error(`Homepage writing is missing or unpublished: ${slug}`);
  }
}
