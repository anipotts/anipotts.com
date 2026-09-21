import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";

/** Empty optional URLs mean absent, not an invalid empty URL or YAML null. */
export function setProjectLink(
  source: string,
  field: "link_live" | "link_repo",
  value: string,
): string {
  if (value.trim()) return setEditorialField(source, [field], value.trim());
  const parsed = parseEditorialSource(source);
  if (!parsed.document.has(field)) return source;
  parsed.document.delete(field);
  const yaml = parsed.document
    .toString({ lineWidth: 0 })
    .replace(/\r?\n/gu, parsed.newline);
  return `${parsed.opening}${yaml}${parsed.closing}${parsed.body}`;
}
