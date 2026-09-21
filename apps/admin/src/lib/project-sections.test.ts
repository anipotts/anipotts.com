import { expect, it } from "vitest";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { editProjectSections } from "./project-sections";
it("moves complete section nodes with comments and media, preserving unrelated content", () => {
  const source =
    "---\ncustom: keep\nstory:\n  - title: First # stays with first\n    paragraphs: [one]\n    media: {src: /image.png}\n  - title: Second\n    paragraphs: [two]\n---\nBody";
  const moved = editProjectSections(source, {
    type: "move",
    kind: "story",
    index: 0,
    direction: 1,
  });
  const data = parseEditorialSource(moved).data as any;
  expect(data.story[0].title).toBe("Second");
  expect(data.story[1].media.src).toBe("/image.png");
  expect(moved).toContain("# stays with first");
  expect(data.custom).toBe("keep");
  expect(parseEditorialSource(moved).body).toBe("Body");
  expect(
    editProjectSections(source, {
      type: "move",
      kind: "story",
      index: 0,
      direction: -1,
    }),
  ).toBe(source);
});
it("adds private editable sections and paragraphs without replacing existing entries", () => {
  let source = "---\ntitle: Project\n---\n";
  source = editProjectSections(source, { type: "add", kind: "story" });
  source = editProjectSections(source, { type: "paragraph", index: 0 });
  source = editProjectSections(source, { type: "add", kind: "technical" });
  const data = parseEditorialSource(source).data as any;
  expect(data.story).toEqual([{ title: "", paragraphs: ["", ""] }]);
  expect(data.technical).toEqual([{ title: "", content: "" }]);
});
