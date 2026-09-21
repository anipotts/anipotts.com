import { describe, expect, it } from "vitest";
import { writingReviewChanges } from "./writing-review";

describe("writing publication review", () => {
  it("includes body, visibility, removed settings and unfamiliar metadata alongside title edits", () => {
    const changes = writingReviewChanges(
      "---\ntitle: Old\nsummary: Before\nstatus: draft\ntags: [lean]\ncustom: original\n---\n\nOld [link](/old)\n",
      "---\ntitle: New\nsummary: After\nstatus: published\ncustom: revised\n---\n\nNew [link](/new)\n",
    ).filter((change) => change.before !== change.after);
    expect(changes).toEqual([
      {
        label: "Article body",
        before: "\nOld [link](/old)\n",
        after: "\nNew [link](/new)\n",
      },
      { label: "Website visibility", before: "draft", after: "published" },
      { label: "Tags", before: '["lean"]', after: "" },
      { label: "custom", before: "original", after: "revised" },
    ]);
  });
  it("does not duplicate the opening field in the metadata review", () => {
    const prefix = "---\ntitle: Article\nsummary: Summary\nstatus: draft\n";
    const changes = writingReviewChanges(
      prefix + "---\n\nBody",
      prefix + "opening: A reason to write.\n---\n\nBody",
    );
    expect(changes.some((change) => change.label === "opening")).toBe(false);
  });
  it("keeps formatting and image address edits visible", () => {
    const prefix =
      "---\ntitle: Article\nsummary: Summary\nstatus: draft\n---\n\n";
    const [body] = writingReviewChanges(
      prefix + "![Board](/old.jpg)",
      prefix + "**Board**\n\n![Board](/new.jpg)",
    );
    expect(body.before).toBe("\n![Board](/old.jpg)");
    expect(body.after).toContain("/new.jpg");
    expect(body.after).toContain("**Board**");
  });
});
