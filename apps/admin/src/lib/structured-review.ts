import { parseEditorialSource } from "@anipotts/content/editorial/source";
import type { EditorialField } from "./editorial-fields";

const labels: Record<string, string> = {
  public_state: "Website visibility",
  slug: "Address",
  roadmap: "Roadmap",
  preview_media: "Preview media",
  identity: "Identity",
  story: "Story sections",
  technical: "Technical sections",
  tags: "Tags",
  link_live: "Live link",
  link_repo: "Repository link",
  role: "Role",
  year: "Year",
  duration: "Duration",
};

/** Include every value not already represented by a structured text-field diff. */
export function structuredReviewChanges(
  before: string,
  after: string,
  fields: EditorialField[],
) {
  const previous = parseEditorialSource(before);
  const next = parseEditorialSource(after);
  const covered = new Set(fields.map((field) => JSON.stringify(field.path)));
  const changes: { label: string; before: string; after: string }[] = [];
  const display = (value: unknown): string =>
    value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  function visit(old: unknown, current: unknown, path: string[]) {
    if (covered.has(JSON.stringify(path))) return;
    if (
      (object(old) || old === undefined) &&
      (object(current) || current === undefined) &&
      (object(old) || object(current))
    ) {
      const beforeObject = object(old) ? old : {};
      const afterObject = object(current) ? current : {};
      for (const key of new Set([
        ...Object.keys(beforeObject),
        ...Object.keys(afterObject),
      ]))
        visit(beforeObject[key], afterObject[key], [...path, key]);
      if (Object.keys(beforeObject).length || Object.keys(afterObject).length)
        return;
    }
    if (
      (Array.isArray(old) || old === undefined) &&
      (Array.isArray(current) || current === undefined) &&
      (Array.isArray(old) || Array.isArray(current))
    ) {
      const beforeArray = Array.isArray(old) ? old : [];
      const afterArray = Array.isArray(current) ? current : [];
      if (beforeArray.length !== afterArray.length)
        visit(beforeArray.length, afterArray.length, [...path, "count"]);
      for (
        let index = 0;
        index < Math.max(beforeArray.length, afterArray.length);
        index++
      )
        visit(beforeArray[index], afterArray[index], [...path, String(index)]);
      if (beforeArray.length || afterArray.length) return;
    }
    const oldText = display(old);
    const newText = display(current);
    if (oldText !== newText)
      changes.push({
        label: path
          .map((part, index) =>
            index === 0
              ? (labels[part] ?? part)
              : /^\d+$/.test(part)
                ? String(Number(part) + 1)
                : part.replaceAll("_", " "),
          )
          .join(" / "),
        before: oldText,
        after: newText,
      });
  }
  visit(previous.data, next.data, []);
  if (previous.body !== next.body)
    changes.push({
      label: "Document body",
      before: previous.body,
      after: next.body,
    });
  return changes;
}
