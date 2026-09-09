import { describe, expect, it } from "vitest";
import {
  inlineDocument,
  inlineMarkdown,
  editableHomeSummary,
} from "./rich-text";
import { inlineHtml, inlinePlainText } from "@anipotts/content/public/inline";

describe("rich field round trips", () => {
  it("does not restore removed brand links or escape bold-only explicit fields", () => {
    const mentions = {
      brand: { label: "our bad habit", href: "https://ourbadhabit.com/" },
    };
    expect(
      editableHomeSummary("our bad habit **work**", ["brand"], mentions, true),
    ).toBe("our bad habit **work**");
  });
  it("preserves literal symbols inside inline code", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a * b ` c", marks: [{ type: "code" }] },
          ],
        },
      ],
    };
    const markdown = inlineMarkdown(doc);
    expect(inlinePlainText(markdown)).toBe("a * b ` c");
    expect(inlineHtml(markdown)).toContain("<code>a * b ` c</code>");
  });
  it("keeps formatting when the selected words include spaces", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: " bold words ", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    expect(inlineHtml(inlineMarkdown(doc))).toBe(
      " <strong>bold words</strong> ",
    );
  });
  it("preserves links, logos, parenthesis and formatting after a spelling edit", () => {
    const source =
      "[![](/images/bad.png)our bad habit](https://ourbadhabit.com/) and (![YC](/images/yc.ico)F25) **work** <u>writing</u>";
    const doc = inlineDocument(source);
    const text = doc.content![0]!.content!.find(
      (node) => node.text === "our bad habit",
    )!;
    text.text = "Our bad habits";
    const result = inlineMarkdown(doc);
    expect(inlineHtml(result)).toContain('href="https://ourbadhabit.com/"');
    expect(inlinePlainText(result)).toBe(
      "Our bad habits and (YC F25) work writing",
    );
    expect(inlineMarkdown(inlineDocument(result))).toBe(result);
  });
  it("migrates legacy labels once and never re-matches edited explicit links", () => {
    const mentions = {
      brand: {
        label: "our bad habit",
        href: "https://ourbadhabit.com/",
        logoSrc: "/images/bad.png",
      },
    };
    const migrated = editableHomeSummary(
      "at our bad habit.",
      ["brand"],
      mentions,
    );
    const renamed = migrated.replace("our bad habit", "Our bad habits");
    expect(editableHomeSummary(renamed, ["brand"], mentions)).toBe(renamed);
    expect(inlineHtml(renamed)).toContain('href="https://ourbadhabit.com/"');
  });
  it("preserves literal markdown punctuation and line breaks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "literal *stars* [brackets] <tags>" },
            { type: "hardBreak" },
            { type: "text", text: "next" },
          ],
        },
      ],
    };
    expect(inlinePlainText(inlineMarkdown(doc))).toBe(
      "literal *stars* [brackets] <tags> next",
    );
  });
});
