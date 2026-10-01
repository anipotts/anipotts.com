import { expect, it, vi } from "vitest";
import { siteConfig } from "@anipotts/content/public/site";
vi.mock("./editorial-content", () => ({
  publicSiteUrl: "http://127.0.0.1:4674/",
}));
import { previewResponse } from "./preview-html";

it("loads public preview artwork independently of either local app server", async () => {
  const response = await previewResponse(
    new Response(
      '<head></head><img src="/brand/ap-favicon.svg"><img src="/images/brand/yc.ico"><img src="/images/projects/demo.png" srcset="/images/projects/demo.png 1x, /images/projects/demo@2x.png 2x"><video poster="/media/cover.png"></video><a href="/work/demo">demo</a>',
      { headers: { "Content-Type": "text/html" } },
    ),
    new URL("http://127.0.0.1:4675/preview/home"),
  );
  const html = await response.text();
  expect(html).toContain("<style>body{min-height:0}</style></head>");
  expect(html).toContain(
    `src="${new URL("/brand/ap-favicon.svg", siteConfig.url)}"`,
  );
  expect(html).toContain(
    `src="${new URL("/images/brand/yc.ico", siteConfig.url)}"`,
  );
  expect(html).toContain(
    `src="${new URL("/images/projects/demo.png", siteConfig.url)}"`,
  );
  expect(html).toContain(
    `srcset="${new URL("/images/projects/demo.png", siteConfig.url)} 1x, ${new URL("/images/projects/demo@2x.png", siteConfig.url)} 2x"`,
  );
  expect(html).toContain(
    `poster="${new URL("/media/cover.png", siteConfig.url)}"`,
  );
  expect(html).toContain('href="http://127.0.0.1:4674/work/demo"');
  expect(response.headers.get("Content-Security-Policy")).toContain(
    "sandbox allow-scripts",
  );
});

it("keeps unpublished uploads on the private admin media reader", async () => {
  const id = "a".repeat(64) + ".png";
  const response = await previewResponse(
    new Response(`<img src="/images/editorial/${id}">`, {
      headers: { "Content-Type": "text/html" },
    }),
    new URL("http://127.0.0.1:4675/preview/record"),
  );
  expect(await response.text()).toBe(
    `<img src="http://127.0.0.1:4675/api/editorial/media?id=${id}">`,
  );
});
