import { expect, it } from "vitest";
import { editorialFields } from "./editorial-fields";

it("uses sentence-case newsletter labels without changing source paths", () => {
  const fields = editorialFields({ kind: "page", id: "newsletter" });
  expect(fields.map((field) => field.path[0])).toEqual([
    "headline",
    "deck",
    "cta_label",
    "success_message",
    "error_message",
    "footer_text",
    "archive_label",
    "archive_copy",
    "archive_link_label",
  ]);
  expect(fields.map((field) => field.label)).toEqual([
    "Headline",
    "Deck",
    "CTA label",
    "Success message",
    "Error message",
    "Footer text",
    "Archive label",
    "Archive copy",
    "Archive link label",
  ]);
});

it("describes home rich fields with independent markdown markers", () => {
  const rich = editorialFields({ kind: "page", id: "home" }).filter(
    (field) => field.rich,
  );
  expect(
    rich.map((field) => [field.path.join("."), field.formatPath?.join(".")]),
  ).toEqual([
    ["sections.intro.subheading", "sections.intro.subheading_format"],
    [
      "sections.intro.subheading_compact",
      "sections.intro.subheading_compact_format",
    ],
  ]);
});
it("keeps compact copy optional alongside default copy and separate card title", () => {
  expect(
    editorialFields({ kind: "work", id: "synthetic" }).map((field) =>
      field.path.join("."),
    ),
  ).toEqual(
    expect.arrayContaining([
      "title",
      "card_title",
      "card_copy",
      "card_copy_compact",
    ]),
  );
  expect(
    editorialFields({ kind: "page", id: "writing" }).map((field) =>
      field.path.join("."),
    ),
  ).toEqual(expect.arrayContaining(["hero_summary", "hero_summary_compact"]));
});

it("exposes shared settings with displayed defaults and code-owned destinations", () => {
  const fields = editorialFields({ kind: "page", id: "home" });
  expect(
    fields.find(
      (field) => field.path.join(".") === "site_settings.navigation.work",
    )?.defaultValue,
  ).toBe("work");
  expect(
    fields.find(
      (field) => field.path.join(".") === "site_settings.footer.prompt",
    )?.defaultValue,
  ).toBe("have a question?");
  expect(
    fields.find(
      (field) => field.path.join(".") === "site_settings.seo.homepage_title",
    )?.defaultValue,
  ).toContain("Ani Potts");
  expect(
    fields.some((field) => field.path.join(".").includes("admin_href")),
  ).toBe(false);
  expect(
    fields.some((field) => field.path.join(".").includes("canonical_url")),
  ).toBe(false);
});
