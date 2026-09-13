import { expect, it } from "vitest";
import { editorialRecordSummary } from "./editorial-record-summary";

it("derives summaries from actual record-specific metadata", () => {
  expect(
    editorialRecordSummary(
      { kind: "writing", id: "post" },
      { summary: "Article" },
    ),
  ).toBe("Article");
  expect(
    editorialRecordSummary(
      { kind: "work", id: "project" },
      { card_copy: "Card", subtitle: "Subtitle", description: "Description" },
    ),
  ).toBe("Card");
  expect(
    editorialRecordSummary(
      { kind: "work", id: "project" },
      { subtitle: "Subtitle", description: "Description" },
    ),
  ).toBe("Subtitle");
  expect(
    editorialRecordSummary(
      { kind: "work", id: "project" },
      { description: "Description" },
    ),
  ).toBe("Description");
  expect(
    editorialRecordSummary(
      { kind: "page", id: "home" },
      { sections: { intro: { subheading: "Home" } } },
    ),
  ).toBe("Home");
  expect(
    editorialRecordSummary(
      { kind: "page", id: "newsletter" },
      { deck: "Newsletter" },
    ),
  ).toBe("Newsletter");
  for (const id of ["writing", "work", "systems"] as const)
    expect(
      editorialRecordSummary(
        { kind: "page", id },
        { hero_summary: "Introduction", description: "SEO" },
      ),
    ).toBe("Introduction");
});
it("preserves deliberate clearing and ignores malformed metadata and body", () => {
  expect(
    editorialRecordSummary(
      { kind: "work", id: "project" },
      { card_copy: "", subtitle: "Old" },
    ),
  ).toBe("");
  for (const value of [
    null,
    {},
    { sections: null },
    { sections: { intro: [] } },
    { body: "Private body" },
  ])
    expect(
      editorialRecordSummary({ kind: "page", id: "home" }, value),
    ).toBeUndefined();
});
