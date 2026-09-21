import {
  parseEditorialSource,
  setEditorialField,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";

/** Records that can be taken off the website. Pages stay: every required page
 * renders a route, so hiding one has no reader-side meaning. */
export type UnpublishableRecord = EditorialRecord & {
  kind: "writing" | "work";
};
export function canUnpublish(
  record: EditorialRecord,
): record is UnpublishableRecord {
  return record.kind === "writing" || record.kind === "work";
}

/** Whether the public reader lists and serves this source. It mirrors the
 * www visibility filter, which reads the same two fields. */
export function sourceIsPublic(
  record: EditorialRecord,
  source: string,
): boolean {
  try {
    const data = parseEditorialSource(source).data as Record<string, unknown>;
    if (record.kind === "writing") return isPublishedWriting(data);
    if (record.kind === "work") return isPublicProject(data);
    return record.id !== "newsletter";
  } catch {
    return false;
  }
}

/** The public record with only its visibility switched off. It starts from
 * the currently published source, never the private draft, so an unpublish
 * never carries unreviewed private text into the publication database.
 * Writing keeps its published_at so publishing again restores the same date.
 * A hidden project cannot hold a homepage placement, so that moves to none;
 * the private draft keeps the original placement for the next publication. */
export function unpublishedSource(
  record: UnpublishableRecord,
  source: string,
): string {
  if (record.kind === "writing")
    return setEditorialField(source, ["status"], "draft");
  return setEditorialField(
    setEditorialField(source, ["public_state"], "hidden"),
    ["homepage_placement"],
    "none",
  );
}
