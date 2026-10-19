import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";

type ArtifactField = "artifact_url" | "artifact_label" | "artifact_type";

/** Clearing an optional field removes it rather than storing an invalid empty URL or type. */
export function setArticleArtifactField(
  source: string,
  field: ArtifactField,
  value: string,
): string {
  if (value.trim())
    return setEditorialField(
      source,
      [field],
      field === "artifact_url" ? value.trim() : value,
    );
  const parsed = parseEditorialSource(source);
  if (!parsed.document.has(field)) return source;
  parsed.document.delete(field);
  const yaml = parsed.document
    .toString({ lineWidth: 0 })
    .replace(/\r?\n/gu, parsed.newline);
  return `${parsed.opening}${yaml}${parsed.closing}${parsed.body}`;
}
