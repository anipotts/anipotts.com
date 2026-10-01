import { afterEach, expect, it, vi } from "vitest";
import { siteConfig } from "@anipotts/content/public/site";
vi.mock("./editorial-content", () => ({
  publicSiteUrl: "https://anipotts.com/",
}));
import { previewResponse } from "./preview-html";
afterEach(() => vi.unstubAllEnvs());

it("loads production preview artwork from the configured public site", async () => {
  vi.stubEnv("DEV", false);
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
  expect(html).toContain('href="https://anipotts.com/work/demo"');
  expect(response.headers.get("Content-Security-Policy")).toContain(
    "sandbox allow-scripts",
  );
});

it("loads development preview artwork from the admin asset origin", async () => {
  vi.stubEnv("DEV", true);
  const response = await previewResponse(
    new Response(
      '<img src="/brand/ap-favicon.svg"><a href="/work/demo">demo</a>',
      {
        headers: { "Content-Type": "text/html" },
      },
    ),
    new URL("http://127.0.0.1:4675/preview/home"),
  );
  const html = await response.text();
  expect(html).toContain('src="http://127.0.0.1:4675/brand/ap-favicon.svg"');
  expect(html).toContain('href="https://anipotts.com/work/demo"');
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
