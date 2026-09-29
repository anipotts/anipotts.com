import type { PublishedSnapshot } from "@anipotts/content/editorial/direct-publication";
import {
  parseEditorialSource,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import { projectSchema, writingSchema } from "@anipotts/content/public/schema";
import { isPublicProject, isPublishedWriting } from "@anipotts/content/public";
export const publicMediaId = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
export function hasPublishedMedia(
  publications: PublishedSnapshot[],
  id: string,
): boolean {
  if (!publicMediaId.test(id)) return false;
  return publications.some(({ record, source }) => {
    if (record.kind === "page" && record.id === "newsletter") return false;
    if (!validateEditorialSource(record, source).success)
      throw new Error("Invalid published content");
    const { data } = parseEditorialSource(source);
    if (
      record.kind === "writing" &&
      !isPublishedWriting(writingSchema.parse(data))
    )
      return false;
    if (record.kind === "work" && !isPublicProject(projectSchema.parse(data)))
      return false;
    return Array.from(
      source.matchAll(
        /\/images\/editorial\/([a-f0-9]{64}\.(?:jpg|png|webp))(?=[\s\)\]"'<>]|$)/gu,
      ),
      (match) => match[1],
    ).includes(id);
  });
}
