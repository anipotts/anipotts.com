import { z } from "zod";
import {
  editorialRecordPath,
  validateEditorialSource,
  type EditorialRecord,
} from "./source.js";
import { projectSchema, writingSchema } from "../public/schema.js";
import { homepageSchema } from "../public/pages.js";
import { validateContentReferences } from "../public/references.js";

export type EditorialSourceRecord = { record: EditorialRecord; source: string };
export type SnapshotIssue = {
  record: EditorialRecord | null;
  field: string;
  code: string;
};

/** Validate a complete, pinned Git content inventory after applying selected
 * frozen revisions. The caller owns inventory completeness and Git integrity.
 * No draft source or arbitrary parser messages appear in returned diagnostics.
 */
export function validateEditorialSnapshot(
  entries: EditorialSourceRecord[],
): SnapshotIssue[] {
  const issues: SnapshotIssue[] = [];
  const paths = new Set<string>();
  const projects: { id: string; data: z.infer<typeof projectSchema> }[] = [];
  const writing: { id: string; data: z.infer<typeof writingSchema> }[] = [];
  let home: z.infer<typeof homepageSchema> | undefined;
  for (const { record, source } of entries) {
    try {
      const path = editorialRecordPath(record);
      if (paths.has(path)) {
        issues.push({ record, field: "", code: "duplicate_record" });
        continue;
      }
      paths.add(path);
      const result = validateEditorialSource(record, source);
      if (!result.success) {
        for (const issue of result.error.issues)
          issues.push({
            record,
            field: issue.path.join("."),
            code: "invalid_field",
          });
        continue;
      }
      if (record.kind === "work") {
        const data = projectSchema.parse(result.data);
        projects.push({ id: record.id, data });
        if (
          data.public_state === "hidden" &&
          data.homepage_placement !== "none"
        )
          issues.push({
            record,
            field: "homepage_placement",
            code: "private_homepage_selection",
          });
        if (data.detail_path !== `/work/${data.slug ?? record.id}`)
          issues.push({ record, field: "detail_path", code: "route_mismatch" });
      } else if (record.kind === "writing") {
        writing.push({ id: record.id, data: writingSchema.parse(result.data) });
      } else if (record.id === "home") home = homepageSchema.parse(result.data);
    } catch {
      issues.push({ record, field: "", code: "invalid_source" });
    }
  }
  for (const id of ["home", "work", "writing", "systems"] as const) {
    if (!paths.has(editorialRecordPath({ kind: "page", id })))
      issues.push({
        record: { kind: "page", id },
        field: "",
        code: "required_page_missing",
      });
  }
  if (!issues.length && home) {
    try {
      validateContentReferences(
        projects,
        writing,
        home.sections.latest_thoughts.writing_slugs ?? [],
      );
    } catch {
      issues.push({
        record: null,
        field: "",
        code: "invalid_content_reference",
      });
    }
  }
  return issues;
}
