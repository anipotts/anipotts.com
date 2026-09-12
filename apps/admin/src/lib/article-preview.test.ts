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
