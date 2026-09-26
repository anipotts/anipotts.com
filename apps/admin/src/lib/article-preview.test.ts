// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderArticlePreview } from "./article-preview";

it("preserves document formatting and private image URLs", async () => {
  const html = await renderArticlePreview(
    "# Notes\n\n**Keep this** and [source](https://example.com).\n\n![Mission board](/api/editorial/media/photo.jpg)",
  );
  expect(html).toMatch(/<h1(?: [^>]*)?>Notes<\/h1>/);
  expect(html).toContain("<strong>Keep this</strong>");
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('src="/api/editorial/media/photo.jpg"');
  expect(html).toContain('alt="Mission board"');
});

it("removes active HTML and unsafe link protocols from the preview", async () => {
  const html = await renderArticlePreview(
    '<script>alert(1)</script>\n\n<img src="/photo.jpg" onerror="alert(2)">\n\n<a href="javascript:alert(3)">Keep label</a>\n\n<iframe src="https://example.com"></iframe>',
  );
  expect(html).not.toMatch(/<script|<iframe|onerror|javascript:/i);
  expect(html).toContain("Keep label");
});

// Parity with the Astro Markdown engine this replaced, which pulled its
// syntax highlighter into the Worker. The corpus is every published article
// plus the constructs the published site relies on.
const published = import.meta.glob("../../../../content/public/writing/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const constructs = [
  '## "Quoted" heading -- with a dash...\n\nIt\'s "smart" -- punctuation...',
  "## Repeat\n\n## Repeat\n\n### Code `inline` heading-\n\n#### {Braced} $value",
  "| a | b |\n| - | :-: |\n| 1 | ~~2~~ |\n\n- [x] done\n- [ ] open\n\nwww.example.com",
  "```ts\nconst x = 1;\n```\n\n> quote\n\n1. one\n2. two\n\n---\n\n[^1]\n\n[^1]: note",
  '<div id="x" onclick="y()"><h2>Raw heading</h2></div>\n\n<!-- hidden -->\n\n![alt](/images/a.png "title")',
];

// Compared as parsed documents without whitespace-only text outside <pre>:
// Astro's re-parse moved the newlines between table rows ahead of the table,
// which renders identically.
function parsed(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const blank: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (!node.textContent?.trim() && !node.parentElement?.closest("pre"))
      blank.push(node);
  for (const node of blank) node.parentNode?.removeChild(node);
  return document.body.innerHTML;
}

it("renders the document the Astro Markdown engine rendered", async () => {
  // The public site's own renderer: Astro's Markdown engine with the heading
  // ids published articles have always carried.
  const { publicMarkdownHtml } =
    await import("../../../www/src/lib/public-markdown");
  const bodies = [
    ...Object.values(published).map((source) =>
      source.replace(/^---\n[\s\S]*?\n---\n/, ""),
    ),
    ...constructs,
  ];
  expect(bodies.length).toBeGreaterThan(constructs.length);
  for (const body of bodies)
    expect(parsed(await renderArticlePreview(body))).toBe(
      parsed(await publicMarkdownHtml(body)),
    );
});
