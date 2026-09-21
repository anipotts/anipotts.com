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

it("removes added sections and preserves the remaining section content", () => {
  const source =
    "---\ntitle: Keep\nstory:\n  - title: Original # preserved\n    paragraphs: [keep]\ntechnical: []\n---\nBody";
  const added = editProjectSections(source, { type: "add", kind: "story" });
  const removed = editProjectSections(added, {
    type: "remove",
    kind: "story",
    index: 1,
  });
  expect(parseEditorialSource(removed).data).toEqual(
    parseEditorialSource(source).data,
  );
  expect(removed).toContain("# preserved");
  expect(parseEditorialSource(removed).body).toBe("Body");
  const empty = editProjectSections(removed, {
    type: "remove",
    kind: "story",
    index: 0,
  });
  expect((parseEditorialSource(empty).data as any).story).toEqual([]);
  expect(
    editProjectSections(empty, { type: "remove", kind: "story", index: 0 }),
  ).toBe(empty);
  const technical = editProjectSections(empty, {
    type: "add",
    kind: "technical",
  });
  expect(
    (
      parseEditorialSource(
        editProjectSections(technical, {
          type: "remove",
          kind: "technical",
          index: 0,
        }),
      ).data as any
    ).technical,
  ).toEqual([]);
});

it("removes an added paragraph without losing its siblings or allowing an empty story", () => {
  const source =
    "---\ntitle: Keep\nstory:\n  - title: Story\n    paragraphs:\n      - First\n      - Second\n---\nBody";
  const added = editProjectSections(source, { type: "paragraph", index: 0 });
  const removed = editProjectSections(added, {
    type: "remove-paragraph",
    index: 0,
    paragraph: 2,
  });
  expect(parseEditorialSource(removed).data).toEqual(
    parseEditorialSource(source).data,
  );
  const single = editProjectSections(removed, {
    type: "remove-paragraph",
    index: 0,
    paragraph: 0,
  });
  expect(
    (parseEditorialSource(single).data as any).story[0].paragraphs,
  ).toEqual(["Second"]);
  expect(
    editProjectSections(single, {
      type: "remove-paragraph",
      index: 0,
      paragraph: 0,
    }),
  ).toBe(single);
  expect(
    editProjectSections(single, {
      type: "remove-paragraph",
      index: -1,
      paragraph: 0,
    }),
  ).toBe(single);
  expect(parseEditorialSource(single).body).toBe("Body");
});

it("edits roadmap status and ordering without changing other project data", () => {
  const original =
    "---\ntitle: Keep\nroadmap:\n  - text: First # retain\n    status: done\n---\nBody";
  let source = editProjectSections(original, { type: "add", kind: "roadmap" });
  source = editProjectSections(source, {
    type: "roadmap-field",
    index: 1,
    field: "text",
    value: "Next",
  });
  source = editProjectSections(source, {
    type: "roadmap-field",
    index: 1,
    field: "status",
    value: "in-progress",
  });
  expect(
    editProjectSections(source, {
      type: "roadmap-field",
      index: 1,
      field: "status",
      value: "invalid",
    }),
  ).toBe(source);
  source = editProjectSections(source, {
    type: "move",
    kind: "roadmap",
    index: 1,
    direction: -1,
  });
  expect((parseEditorialSource(source).data as any).roadmap).toEqual([
    { text: "Next", status: "in-progress" },
    { text: "First", status: "done" },
  ]);
  source = editProjectSections(source, {
    type: "remove",
    kind: "roadmap",
    index: 0,
  });
  expect(parseEditorialSource(source).data).toEqual(
    parseEditorialSource(original).data,
  );
  expect(source).toContain("# retain");
  expect(parseEditorialSource(source).body).toBe("Body");
});
