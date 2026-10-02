import { expect, it } from "vitest";
import { renderEditorialMarkdown } from "./markdown.ts";

it("renders frozen bodies with stable heading ids and GFM without active HTML", async () => {
  const html = await renderEditorialMarkdown(
    "## Repeat\n\n## Repeat\n\n### Code `inline` heading-\n\n**Changed project body**\n\n- [x] done\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))",
  );
  expect(html).toContain('id="repeat"');
  expect(html).toContain('id="repeat-1"');
  expect(html).toContain('id="code-inline-heading"');
  expect(html).toContain("<strong>Changed project body</strong>");
  expect(html).toContain('type="checkbox"');
  expect(html).not.toMatch(/<script|javascript:|onclick=/u);
});
it("applies a pure media resolver after sanitizing and rejects unsafe resolved URLs", async () => {
  const body = "![saved candidate](/images/editorial/asset.png)";
  const html = await renderEditorialMarkdown(body, {
    resolveMedia: () => "/api/editorial/media?id=asset.png",
  });
  expect(html).toContain('src="/api/editorial/media?id=asset.png"');
  expect(
    await renderEditorialMarkdown(body, {
      resolveMedia: () => "javascript:alert(1)",
    }),
  ).not.toContain("src=");
  expect(await renderEditorialMarkdown(body)).toContain(
    'src="/images/editorial/asset.png"',
  );
});
