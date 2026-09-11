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
});
