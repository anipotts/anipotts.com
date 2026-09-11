import { parseEditorialSource } from "@anipotts/content/editorial/source";

const labels: Record<string, string> = {
  status: "Website visibility",
  content_type: "Article type",
  published_at: "Publication date",
  scheduled_at: "Scheduled date",
  tags: "Tags",
  slug: "Article address",
};

/** Title and summary have their own controls; include every other saved value. */
export function writingReviewChanges(before: string, after: string) {
  const previous = parseEditorialSource(before);
  const next = parseEditorialSource(after);
  const oldData = previous.data as Record<string, unknown>;
  const newData = next.data as Record<string, unknown>;
  const display = (value: unknown): string =>
    value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return [
    { label: "Article body", before: previous.body, after: next.body },
    ...Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]))
      .filter((key) => key !== "title" && key !== "summary")
      .map((key) => ({
        label: labels[key] ?? key,
        before: display(oldData[key]),
        after: display(newData[key]),
      })),
  ];
}
