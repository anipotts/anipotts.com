import { parseEditorialSource } from "@anipotts/content/editorial/source";
export type ProjectSectionKind = "story" | "technical";
export type ProjectSectionEdit =
  | { type: "add"; kind: ProjectSectionKind }
  | { type: "remove"; kind: ProjectSectionKind; index: number }
  | { type: "move"; kind: ProjectSectionKind; index: number; direction: -1 | 1 }
  | { type: "paragraph"; index: number };

/** Move existing YAML nodes so section comments and media stay attached. */
export function editProjectSections(
  source: string,
  edit: ProjectSectionEdit,
): string {
  const parsed = parseEditorialSource(source);
  const data = parsed.data as Record<string, unknown>;
  if (edit.type === "paragraph") {
    const story = data.story;
    if (
      !Array.isArray(story) ||
      !Number.isInteger(edit.index) ||
      edit.index < 0 ||
      edit.index >= story.length
    )
      return source;
    parsed.document.addIn(["story", edit.index, "paragraphs"], "");
  } else if (edit.type === "add") {
    if (data[edit.kind] !== undefined && !Array.isArray(data[edit.kind]))
      return source;
    if (!data[edit.kind])
      parsed.document.set(edit.kind, parsed.document.createNode([]));
    parsed.document.addIn(
      [edit.kind],
      parsed.document.createNode(
        edit.kind === "story"
          ? { title: "", paragraphs: [""] }
          : { title: "", content: "" },
      ),
    );
  } else if (edit.type === "remove") {
    const entries = data[edit.kind];
    if (
      !Array.isArray(entries) ||
      !Number.isInteger(edit.index) ||
      edit.index < 0 ||
      edit.index >= entries.length
    )
      return source;
    parsed.document.deleteIn([edit.kind, edit.index]);
  } else {
    const entries = data[edit.kind];
    const target = edit.index + edit.direction;
    if (
      !Array.isArray(entries) ||
      !Number.isInteger(edit.index) ||
      edit.index < 0 ||
      edit.index >= entries.length ||
      target < 0 ||
      target >= entries.length
    )
      return source;
    const current = parsed.document.getIn([edit.kind, edit.index], true);
    const other = parsed.document.getIn([edit.kind, target], true);
    parsed.document.setIn([edit.kind, edit.index], other);
    parsed.document.setIn([edit.kind, target], current);
  }
  return `${parsed.opening}${parsed.document.toString({ lineWidth: 0 }).replace(/\r?\n/gu, parsed.newline)}${parsed.closing}${parsed.body}`;
}
