import type { EditorialRecord } from "@anipotts/content/editorial/source";

/** Shared catalog and acknowledged-edit metadata; never includes the document body. */
export function editorialRecordSummary(
  record: EditorialRecord,
  value: unknown,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const firstString = (...values: unknown[]) =>
    values.find((item): item is string => typeof item === "string");
  if (record.kind === "writing") return firstString(data.summary);
  if (record.kind === "work")
    return firstString(data.card_copy, data.subtitle, data.description);
  if (record.id === "newsletter") return firstString(data.deck);
  if (record.id === "home") {
    const sections = data.sections;
    if (!sections || typeof sections !== "object") return undefined;
    const intro = (sections as Record<string, unknown>).intro;
    if (!intro || typeof intro !== "object") return undefined;
    return firstString((intro as Record<string, unknown>).subheading);
  }
  return firstString(data.hero_summary, data.description);
}
