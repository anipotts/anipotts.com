import { z } from "astro/zod";
import { editorialRecordSchema } from "@anipotts/content/editorial/record";
import type { SnapshotIssue } from "@anipotts/content/editorial/snapshot";

const issueSchema = z.object({
  record: z.unknown(),
  field: z
    .string()
    .max(200)
    .regex(/^[\w.-]*$/u),
  code: z.enum([
    "invalid_field",
    "invalid_source",
    "duplicate_record",
    "required_page_missing",
    "private_homepage_selection",
    "route_mismatch",
    "duplicate_slug",
    "invalid_slug",
    "unknown_project_reference",
    "featured_writing_unavailable",
    "invalid_content_reference",
    "unsupported_slug_change",
  ]),
});

/** Both persisted and browser diagnostics stay bounded and value-silent. */
export function publicationIssues(value: unknown): SnapshotIssue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((issue) => {
    const parsed = issueSchema.safeParse(issue);
    if (!parsed.success) return [];
    const record = editorialRecordSchema
      .nullable()
      .safeParse(parsed.data.record);
    return record.success ? [{ ...parsed.data, record: record.data }] : [];
  });
}

export function publicationIssueMessage(issue: SnapshotIssue): string {
  switch (issue.code) {
    case "duplicate_slug":
      return "This address is used by another record. Choose a unique address.";
    case "unknown_project_reference":
      return "Choose an existing project, or remove the project reference.";
    case "featured_writing_unavailable":
      return "Remove this selection or publish the selected article first. Publish the updated homepage before unpublishing the article.";
    case "unsupported_slug_change":
      return "URL changes are not supported yet. Restore the published address and review again.";
    case "route_mismatch":
      return "The detail path must match this project's address.";
    case "private_homepage_selection":
      return "A hidden project cannot appear on the homepage. Remove its homepage placement.";
    case "required_page_missing":
      return "A required page is missing. Restore it before publishing.";
    case "invalid_field":
    case "invalid_slug":
      return "Check this field's required format and review again.";
    default:
      return "Check this record's source and references, then review again.";
  }
}

export function publicationRefusal(code: unknown): string | null {
  switch (code) {
    case "invalid_snapshot":
    case "invalid_source":
      return "Publication was not started. Resolve the content issues and references, then review again. Your private draft is retained.";
    case "unsupported_slug_change":
      return "Publication was not started. URL changes are not supported yet; restore the published address and review again. Your private draft is retained.";
    case "baseline_changed":
      return "The website changed since this review. Compare your saved draft with the current website version, then review again. Publication was not started.";
    case "preflight_unavailable":
      return "Publication checks are unavailable. Your private draft is retained; retry when storage is available.";
    default:
      return null;
  }
}

/** Field paths stay in the protocol; the interface uses familiar editor labels. */
export function publicationIssueField(field: string): string {
  const selection = /^sections\.latest_thoughts\.writing_slugs\.(\d+)$/.exec(
    field,
  );
  if (selection) return `Writing selection ${Number(selection[1]) + 1}`;
  const labels: Record<string, string> = {
    title: "Title",
    summary: "Subtitle",
    slug: "Address",
    project: "Related project",
    detail_path: "Detail path",
    homepage_placement: "Homepage placement",
    status: "Visibility",
    public_state: "Visibility",
    published_at: "Publication date",
    body: "Article body",
  };
  return labels[field] ?? field.replaceAll("_", " ").split(".").join(" / ");
}
