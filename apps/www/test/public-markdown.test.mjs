import assert from "node:assert/strict";
import test from "node:test";
import { publicMarkdownHtml } from "../src/lib/public-markdown.ts";

// Pinned to the exact HTML Astro 5 (markdown-remark 6.3.11) rendered for published articles, so a Markdown
// engine upgrade cannot move anchors or change markup unnoticed.
test("article Markdown renders as it did before the Astro 7 upgrade", async () => {
  assert.equal(
    await publicMarkdownHtml(
      "## Repeat\n\n## Repeat\n\n### Code `inline` heading-\n\n#### {Braced} $value",
    ),
    '<h2 id="repeat">Repeat</h2>\n<h2 id="repeat-1">Repeat</h2>\n<h3 id="code-inline-heading">Code <code>inline</code> heading-</h3>\n<h4 id="braced-value">{Braced} $value</h4>',
  );
  assert.equal(
    await publicMarkdownHtml(
      'It\'s "smart" -- punctuation...\n\n<script>alert(1)</script>\n\n| a |\n| - |\n| ~~b~~ |',
    ),
    "<p>It’s “smart” — punctuation…</p>" +
      "\n".repeat(13) +
      "<table><thead><tr><th>a</th></tr></thead><tbody><tr><td><del>b</del></td></tr></tbody></table>",
  );
});
