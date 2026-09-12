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
