import { publicSlugSchema } from "./schema.js";
import { isPublishedWriting } from "./visibility.js";

type RecordEntry = {
  id: string;
  data: { slug?: string; status?: string; project?: string };
};

export type ContentReferenceIssue = {
  collection: "project" | "writing" | "home";
  id: string;
  field: string;
  code:
    | "invalid_slug"
    | "duplicate_slug"
    | "unknown_project_reference"
    | "featured_writing_unavailable";
};

/** Bounded diagnostics contain identities and field paths, never source text. */
export function contentReferenceIssues(
  projects: RecordEntry[],
  writing: RecordEntry[],
  featuredWriting: string[],
): ContentReferenceIssue[] {
  const issues: ContentReferenceIssue[] = [];
  const add = (issue: ContentReferenceIssue) => {
    if (issues.length < 100) issues.push(issue);
  };
  function slugs(entries: RecordEntry[], collection: "project" | "writing") {
    const seen = new Map<string, string[]>();
    for (const entry of entries) {
      const result = publicSlugSchema.safeParse(entry.data.slug ?? entry.id);
      if (!result.success) {
        add({ collection, id: entry.id, field: "slug", code: "invalid_slug" });
        continue;
      }
      const owners = seen.get(result.data) ?? [];
      owners.push(entry.id);
      seen.set(result.data, owners);
    }
    for (const owners of seen.values()) {
      if (owners.length > 1)
        for (const id of owners)
          add({ collection, id, field: "slug", code: "duplicate_slug" });
    }
    return new Set(seen.keys());
  }
  const projectSlugs = slugs(projects, "project");
  slugs(writing, "writing");
  for (const entry of writing) {
    if (entry.data.project && !projectSlugs.has(entry.data.project))
      add({
        collection: "writing",
        id: entry.id,
        field: "project",
        code: "unknown_project_reference",
      });
  }
  const published = new Set(
    writing
      .filter((entry) => isPublishedWriting(entry.data))
      .map((entry) => entry.data.slug ?? entry.id),
  );
  featuredWriting.forEach((slug, index) => {
    if (!published.has(slug))
      add({
        collection: "home",
        id: "home",
        field: `sections.latest_thoughts.writing_slugs.${index}`,
        code: "featured_writing_unavailable",
      });
  });
  return issues;
}

/** Cross-record checks run when building the serving index, never while rendering a request. */
export function validateContentReferences(
  projects: RecordEntry[],
  writing: RecordEntry[],
  featuredWriting: string[],
): void {
  const issue = contentReferenceIssues(projects, writing, featuredWriting)[0];
  if (!issue) return;
  switch (issue.code) {
    case "invalid_slug":
      throw new Error(`Invalid ${issue.collection} slug`);
    case "duplicate_slug":
      throw new Error(`Duplicate ${issue.collection} slug`);
    case "unknown_project_reference":
      throw new Error("Unknown project reference");
    case "featured_writing_unavailable":
      throw new Error("Homepage writing is missing or unpublished");
  }
}
