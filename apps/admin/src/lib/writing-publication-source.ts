import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";

/** Publish opens an explicit review; this only prepares a private candidate. */
export function prepareWritingPublication(
  source: string,
  now = new Date(),
): string {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  if (data.status !== "draft") return source;
  let candidate = setEditorialField(source, ["status"], "published");
  if (!data.published_at)
    candidate = setEditorialField(
      candidate,
      ["published_at"],
      now.toISOString(),
    );
  return candidate;
}
