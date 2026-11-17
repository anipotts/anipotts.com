import { describe, expect, it } from "vitest";
import {
  needsMarkdownEditor,
  articleMarkdownRoundTrip,
} from "./article-markdown";

describe("article visual editing fidelity", () => {
  it.each([
    "# Heading\n\nA paragraph with **bold** and *italic*.",
    "## Heading\n\n[OpenAI](https://openai.com/)\n\n![Board](/images/board.jpg)",
    "1. first\n2. second\n\n> a quote",
    "```js\nconst value = '<tag>';\n```",
    "text\n\n---\n\nmore text",
  ])("keeps supported text and structure: %s", (source) => {
    expect(needsMarkdownEditor(source)).toBe(false);
    expect(articleMarkdownRoundTrip(source)).not.toBe("");
  });
  it.each([
    "name | value\n--- | ---\none | two",
    "- [x] finished\n- [ ] pending",
    "[label][reference]\n\n[reference]: https://example.com",
    "<figure><img src='/image.jpg'><figcaption>Caption</figcaption></figure>",
    "text[^1]\n\n[^1]: note",
  ])("preserves unsupported content in the source editor: %s", (source) => {
    expect(needsMarkdownEditor(source)).toBe(true);
  });

  it.each(["\n", "\r\n"])(
    "allows trailing blank lines after a GIF without changing the source (%j)",
    (newline) => {
      const image =
        "![weekly usage fills](/images/editorial/" + "a".repeat(64) + ".gif)";
      const source = image + newline.repeat(4);
      expect(needsMarkdownEditor(source)).toBe(false);
    },
  );

  it("keeps meaningful hard breaks when probing trailing blank lines", () => {
    const source = "first line  \nsecond line\n\n\n\n";
    expect(needsMarkdownEditor(source)).toBe(false);
    expect(articleMarkdownRoundTrip(source)).toContain("first line  \n");
  });

  it("does not trim trailing blank lines inside an unclosed code fence", () => {
    expect(needsMarkdownEditor("```js\nconst value = 1;\n\n\n\n")).toBe(true);
    expect(needsMarkdownEditor("```js\nconst value = 1;\n```\n\n\n\n")).toBe(
      false,
    );
  });

  it.each([
    "<details>Keep this HTML.</details>\n\n\n\n",
    "name | value\n--- | ---\none | two\n\n\n\n",
    "[label][reference]\n\n[reference]: https://example.com\n\n\n\n",
  ])("still protects unsupported syntax with trailing blanks: %s", (source) => {
    expect(needsMarkdownEditor(source)).toBe(true);
  });
});
