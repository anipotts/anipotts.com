import { expect, it } from "vitest";
import { structuredReviewChanges } from "./structured-review";
const source = (data: unknown, body = "") =>
  `---\n${JSON.stringify(data)}\n---\n${body}`;
it("shows media and unfamiliar metadata alongside separately reviewed text", () => {
  const before = {
    title: "Old",
    preview_media: { src: "/old.png", alt: "Old image" },
    custom: "old",
  };
  const after = {
    title: "New",
    preview_media: { src: "/new.png", alt: "New image" },
    custom: "new",
  };
  const changes = structuredReviewChanges(source(before), source(after), [
    { label: "Title", path: ["title"] },
  ]);
  expect(changes.map((change) => change.label)).toEqual([
    "Preview media / src",
    "Preview media / alt",
    "custom",
  ]);
  expect(changes[0]).toMatchObject({ before: "/old.png", after: "/new.png" });
});
it("makes removed sections and roadmap state changes visible", () => {
  const before = {
    story: [{ title: "Retained" }, { title: "Removed" }],
    roadmap: [{ text: "Ship", status: "planned" }],
  };
  const after = {
    story: [{ title: "Retained" }],
    roadmap: [{ text: "Ship", status: "done" }],
  };
  const changes = structuredReviewChanges(source(before), source(after), [
    { label: "Story 1 heading", path: ["story", "0", "title"] },
  ]);
  expect(changes).toEqual([
    { label: "Story sections / count", before: "2", after: "1" },
    { label: "Story sections / 2 / title", before: "Removed", after: "" },
    { label: "Roadmap / 1 / status", before: "planned", after: "done" },
  ]);
});
it("includes nested additions, removed unknown fields and body changes", () => {
  const changes = structuredReviewChanges(
    source({ settings: { old: true } }, "Old body"),
    source({ settings: { added: { enabled: false } } }, "New body"),
    [],
  );
  expect(changes.map((change) => change.label)).toEqual([
    "settings / old",
    "settings / added / enabled",
    "Document body",
  ]);
  expect(changes[0]).toMatchObject({ before: "true", after: "" });
});

it("groups section order and selections into one presentation review, excluding serialization markers", () => {
  const before = {
    sections: {
      intro: { subheading: "Hello" },
      writing: { writing_slugs: ["a", "b"] },
    },
    section_order: ["intro", "writing"],
  };
  const after = {
    sections: {
      intro: { subheading: "Hello", subheading_format: "markdown" },
      writing: { writing_slugs: ["b", "a"] },
    },
    section_order: ["writing", "intro"],
  };
  const changes = structuredReviewChanges(source(before), source(after), []);
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    label: "Page sections",
    presentation: true,
  });
  expect(changes[0]!.after).not.toContain("subheading_format");
  expect(JSON.parse(changes[0]!.after).order).toEqual(["writing", "intro"]);
});

it("renders legacy mention icons consistently across a Markdown migration", () => {
  const mentions = {
    logo: {
      label: "company",
      href: "https://example.test/",
      logoSrc: "/images/logo.svg",
    },
  };
  const before = {
    sections: { intro: { subheading: "company", mention_keys: ["logo"] } },
    mentions,
  };
  const after = {
    sections: {
      intro: {
        subheading: "[![](/images/logo.svg)company](https://example.test/)",
        subheading_format: "markdown",
      },
    },
    mentions,
  };
  expect(structuredReviewChanges(source(before), source(after), [])).toEqual(
    [],
  );
});
