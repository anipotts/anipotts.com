import { afterEach, expect, it, vi } from "vitest";
import { siteConfig } from "@anipotts/content/public/site";
const previewSite = vi.hoisted(() => ({ url: "https://anipotts.com/" }));
vi.mock("./editorial-content", () => ({
  get publicSiteUrl() {
    return previewSite.url;
  },
}));
import { previewResponse, renderPreviewResponse } from "./preview-html";
afterEach(() => {
  vi.unstubAllEnvs();
  previewSite.url = "https://anipotts.com/";
});

it.each(["throw", "error-page", "body-error"])(
  "reports %s rendering failures without waiting for the frame timeout",
  async (failure) => {
    const response = await renderPreviewResponse(async () => {
      if (failure === "throw") throw new Error("private rendering detail");
      if (failure === "body-error")
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("private rendering detail"));
            },
          }),
          { headers: { "Content-Type": "text/html" } },
        );
      return new Response("Framework error", { status: 500 });
    }, new URL("https://admin.anipotts.com/preview/home?previewRequest=current"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox allow-scripts",
    );
    const html = await response.text();
    expect(html).toContain('"request":"current"');
    expect(html).toContain('"status":"unavailable"');
    expect(html).not.toContain("private rendering detail");
  },
);

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

import { createHash } from "node:crypto";
const ownedPNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const ownedID = createHash("sha256").update(ownedPNG).digest("hex") + ".png";
const ownedFile = () => ({
  metadata: { id: ownedID, type: "image/png" as const, size: ownedPNG.length },
  bytes: new Uint8Array(ownedPNG),
});
const ownedSource = `![synthetic](/images/editorial/${ownedID})`;
const packageReader = {
  fetch: vi.fn(
    async () =>
      new Response(
        JSON.stringify({ version: 1, styles: [], fonts: [], scripts: [] }),
        { headers: { "Content-Type": "application/json" } },
      ),
  ),
};
const ownedHTML = () =>
  new Response(
    `<html><head></head><body><img loading="lazy" src="/images/editorial/${ownedID}"></body></html>`,
    {
      headers: {
        "Content-Type": "text/html",
        "Content-Length": "42",
        "Content-Encoding": "gzip",
        "Cache-Control": "private, no-store",
      },
    },
  );
it("streams exact snapshot media before the only ready-capable bootstrap and removes obsolete transport headers", async () => {
  vi.stubEnv("DEV", false);
  const read = vi.fn(async () => ownedFile());
  const response = await previewResponse(
    ownedHTML(),
    new URL("https://admin.anipotts.com/preview/record?previewRequest=exact"),
    packageReader,
    { source: ownedSource, readMedia: read },
  );
  expect(response.headers.get("Content-Length")).toBeNull();
  expect(response.headers.get("Content-Encoding")).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const html = await response.text();
  expect(read).toHaveBeenCalledTimes(2);
  expect(html).toContain(`data-preview-owned-src="${ownedID}"`);
  expect(html.indexOf("data-preview-owned-media=")).toBeLessThan(
    html.indexOf("data-preview-public-client>"),
  );
  expect(html).toContain(ownedPNG.toString("base64"));
  expect(html).not.toContain(
    'src="https://admin.anipotts.com/api/editorial/media',
  );
  expect(response.headers.get("Content-Security-Policy")).toContain(
    "connect-src 'none'",
  );
});
it.each([401, 409, 503])(
  "preserves status %s failure HTML without new asset/media work or ready bootstrap",
  async (status) => {
    vi.stubEnv("DEV", false);
    packageReader.fetch.mockClear();
    const media = vi.fn(async () => ownedFile());
    const response = await previewResponse(
      new Response(
        '<html><body><script>parent.postMessage({status:"stale"},"*")</script></body></html>',
        { status, headers: { "Content-Type": "text/html" } },
      ),
      new URL("https://admin.anipotts.com/preview/record"),
      packageReader,
      { source: ownedSource, readMedia: media },
    );
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("data-preview-public-client");
    expect(packageReader.fetch).not.toHaveBeenCalled();
    expect(media).not.toHaveBeenCalled();
  },
);
it("turns a late media read failure into unavailable without sending the ready-capable suffix", async () => {
  vi.stubEnv("DEV", false);
  const read = vi
    .fn()
    .mockResolvedValueOnce(ownedFile())
    .mockResolvedValueOnce(null);
  const response = await previewResponse(
    ownedHTML(),
    new URL("https://admin.anipotts.com/preview/record?previewRequest=late"),
    packageReader,
    { source: ownedSource, readMedia: read },
  );
  const html = await response.text();
  expect(html).toContain("</script><script>parent.postMessage(");
  expect(html).toContain('"status":"unavailable"');
  expect(html).not.toContain("data-preview-public-client>");
  expect(read).toHaveBeenCalledTimes(2);
});
it("consumer cancellation stops waiting on a held media RPC and starts no later reads", async () => {
  vi.stubEnv("DEV", false);
  const read = vi
    .fn()
    .mockResolvedValueOnce(ownedFile())
    .mockImplementationOnce(() => new Promise(() => {}));
  const response = await previewResponse(
    ownedHTML(),
    new URL("https://admin.anipotts.com/preview/record"),
    packageReader,
    { source: ownedSource, readMedia: read },
  );
  const body = response.body!.getReader();
  await body.read();
  const waiting = body.read();
  await expect.poll(() => read.mock.calls.length).toBe(2);
  await Promise.race([
    body.cancel(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Cancellation kept waiting on RPC")),
        200,
      ),
    ),
  ]);
  expect(await waiting).toEqual({ done: true, value: undefined });
  expect(read).toHaveBeenCalledTimes(2);
});

it("keeps an escaped late-failure request nonce exact without injecting a script terminator", async () => {
  vi.stubEnv("DEV", false);
  const read = vi
    .fn()
    .mockResolvedValueOnce(ownedFile())
    .mockResolvedValueOnce(null);
  const url = new URL("https://admin.anipotts.com/preview/record");
  const nonce = "synthetic</script><script>bad()</script>";
  url.searchParams.set("previewRequest", nonce);
  const response = await previewResponse(ownedHTML(), url, packageReader, {
    source: ownedSource,
    readMedia: read,
  });
  const html = await response.text();
  const match = /parent\.postMessage\((\{.*?\}),"\*"\)/.exec(html);
  expect(match).toBeTruthy();
  expect(JSON.parse(match![1]).request).toBe(nonce);
  expect(html).not.toContain("<script>bad()");
});

it("uses the canonical public image origin despite the DEV public-site preview URL while embedding only its snapshot-owned image", async () => {
  vi.stubEnv("DEV", true);
  previewSite.url = "http://127.0.0.1:4321/";
  const read = vi.fn(async (id: string) =>
    id === ownedID ? ownedFile() : null,
  );
  const foreignID = "b".repeat(64) + ".png";
  const response = await previewResponse(
    new Response(
      `<html><head></head><body><img src="/images/brand/structured-ai-mark.svg" srcset="/images/brand/structured-ai-mark.svg 1x, /images/work/synthetic@2x.webp 2x"><video poster="/media/synthetic-poster.png"></video><img loading="lazy" src="/images/editorial/${ownedID}"><img src="/images/editorial/${foreignID}"></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    ),
    new URL("http://127.0.0.1:8917/preview/record"),
    packageReader,
    { source: ownedSource, readMedia: read },
  );
  const html = await response.text();
  expect(html).toContain(
    'src="https://anipotts.com/images/brand/structured-ai-mark.svg"',
  );
  expect(html).toContain(
    'srcset="https://anipotts.com/images/brand/structured-ai-mark.svg 1x, https://anipotts.com/images/work/synthetic@2x.webp 2x"',
  );
  expect(html).toContain(
    'poster="https://anipotts.com/media/synthetic-poster.png"',
  );
  expect(html).toContain(
    `src="https://anipotts.com/images/editorial/${foreignID}"`,
  );
  expect(html).toContain(`data-preview-owned-src="${ownedID}"`);
  expect(html).toContain(`data-preview-owned-media="${ownedID}"`);
  expect(html).not.toContain('src="http://127.0.0.1:8917/images/');
  expect(html).not.toContain('src="http://127.0.0.1:4321/images/');
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls.every(([id]) => id === ownedID)).toBe(true);
});
