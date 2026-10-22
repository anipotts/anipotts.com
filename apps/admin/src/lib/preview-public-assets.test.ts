import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import {
  materializePreviewAssets,
  PREVIEW_ASSET_PACKAGE,
  type PreviewAssetReader,
} from "./preview-public-assets";
const root = "/synthetic/repository";
vi.stubGlobal("__PREVIEW_PUBLIC_SOURCE_ROOT__", root);
afterEach(() => vi.unstubAllEnvs());
const origin = new URL(
  "https://admin.anipotts.com/preview/record?previewRequest=synthetic",
);
const font = "/_astro/instrument-sans-latin-wght-normal.ABC123.woff2";
const css = "/_astro/record.ABC123.css";
const script = "/_astro/Nav.ABC123.js";
const pack = () => ({
  version: 1,
  styles: [
    {
      path: css,
      css: `@font-face{font-family:test;src:url(${font})}body{color:red}`,
    },
  ],
  fonts: [{ path: font, data: "d09GMg==" }],
  scripts: [script],
});
const html = `<html><head><link href="${css}" rel="stylesheet"><link rel="preload" as="font" href="${font}"></head><body><script src="${script}" type="module"></script><script>window.productInline=true</script></body></html>`;
function reader(value: unknown) {
  const fetch = vi.fn(
    async (request: Request) =>
      new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  return { fetch };
}
it("materializes only the fixed deployment package, retains product inline code and closes the client graph", async () => {
  const assets = reader(pack());
  const result = await materializePreviewAssets(html, origin, assets, false);
  expect(assets.fetch).toHaveBeenCalledTimes(1);
  expect(new URL(assets.fetch.mock.calls[0][0].url).pathname).toBe(
    PREVIEW_ASSET_PACKAGE,
  );
  expect(result).toContain("data-preview-public-style");
  expect(result).toContain("data:font/woff2;base64,d09GMg==");
  expect(result).toContain("window.productInline=true");
  expect(result).toContain("installOwnedPreviewMedia().then");
  expect(result).not.toContain("<script src=");
  expect(result).not.toContain('rel="stylesheet"');
  expect(result).not.toContain('as="font"');
  expect(result).not.toMatch(/\bimport\s*(?:["'{*]|\()/);
});
it.each(["style", "script", "font", "import", "count", "size"])(
  "refuses unmanifested or excessive %s without arbitrary asset reads",
  async (kind) => {
    const value = pack();
    let input = html;
    if (kind === "style")
      input = input.replace(css, "https://private.example/private.css");
    if (kind === "script")
      input = input.replace(script, "/api/private-reader/records");
    if (kind === "font")
      value.styles[0].css =
        "body{background:url(https://private.example/record)}";
    if (kind === "import")
      value.styles[0].css = '@import "https://private.example/private.css";';
    if (kind === "count")
      value.fonts = Array.from({ length: 9 }, () => value.fonts[0]);
    if (kind === "size") value.styles[0].css = "x".repeat(256 * 1024 + 1);
    const assets = reader(value);
    await expect(
      materializePreviewAssets(input, origin, assets, false),
    ).rejects.toThrow();
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  },
);
it("resolves bounded actual DEV CSS direct requests without browser metadata, and admits no foreign/private stylesheet", async () => {
  const style = `/@fs${root}/apps/www/src/components/WorkDetail.astro?astro&type=style&index=0&lang.css`;
  const fontPath = `/@fs${root}/packages/brand/ap-structural-v0.2.0-candidate.1/fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.woff2`;
  const calls: Request[] = [];
  const assets: PreviewAssetReader = {
    fetch: async (request) => {
      calls.push(request);
      return new URL(request.url).pathname.endsWith(".woff2")
        ? new Response(new Uint8Array([119, 79, 70, 50]), {
            headers: { "Content-Type": "font/woff2" },
          })
        : new Response(
            `body{font-family:test}@font-face{src:url(${fontPath})}`,
            { headers: { "Content-Type": "text/css" } },
          );
    },
  };
  const output = await materializePreviewAssets(
    `<html><head><link rel="stylesheet" href="${style.replaceAll("&", "&amp;")}"></head><body><script src="/@vite/client"></script></body></html>`,
    new URL("http://127.0.0.1:8917/preview/record"),
    assets,
    true,
  );
  expect(calls).toHaveLength(2);
  expect(new URL(calls[0].url).searchParams.has("direct")).toBe(true);
  expect(calls[0].headers.has("Sec-Fetch-Site")).toBe(false);
  expect(output).toContain("data:font/woff2");
  const count = calls.length;
  await expect(
    materializePreviewAssets(
      '<link rel="stylesheet" href="/api/editorial/media">',
      origin,
      assets,
      true,
    ),
  ).rejects.toThrow("Unapproved preview style");
  expect(calls).toHaveLength(count);
});
it("enforces streamed response byte limits even with a false Content-Length", async () => {
  const assets: PreviewAssetReader = {
    fetch: async () =>
      new Response("x".repeat(2 * 1024 * 1024 + 1), {
        headers: { "Content-Length": "1" },
      }),
  };
  await expect(
    materializePreviewAssets(html, origin, assets, false),
  ).rejects.toThrow("budget");
});

it("emits syntactically valid closed module source rather than escaped separator text", async () => {
  const result = await materializePreviewAssets(
    html,
    origin,
    reader(pack()),
    false,
  );
  const source =
    /<script type="module" data-preview-public-client>([\s\S]*?)<\/script>/.exec(
      result,
    )?.[1];
  expect(source).toBeTruthy();
  const output = ts.transpileModule(source!, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      allowJs: true,
    },
  });
  expect(output.diagnostics).toEqual([]);
});

it("replaces only the known Systems motion script while retaining its static complete workflow", async () => {
  const value = pack();
  value.scripts.push("/_astro/SystemMap.synthetic.js");
  const input =
    '<html><head></head><body><figure data-workflow><ul><li data-source="gmail">Gmail</li><li data-source="github">GitHub</li></ul><button data-motion-toggle hidden>Pause</button></figure><script src="/_astro/SystemMap.synthetic.js"></script></body></html>';
  const result = await materializePreviewAssets(
    input,
    origin,
    reader(value),
    false,
  );
  expect(result).toContain('data-source="gmail"');
  expect(result).toContain('data-source="github"');
  expect(result).toContain("data-motion-toggle hidden");
  expect(result).not.toContain("data-animated");
  expect(result).not.toContain('<script src="/_astro/SystemMap');
  const devPath = `/@fs${root}/apps/www/src/components/SystemMap.astro?astro&type=script&index=0&lang.ts`;
  const assets = {
    fetch: vi.fn(async () => {
      throw new Error("No assets needed");
    }),
  };
  const devResult = await materializePreviewAssets(
    input.replace("/_astro/SystemMap.synthetic.js", devPath),
    origin,
    assets,
    true,
  );
  expect(devResult).toContain("data-motion-toggle hidden");
  expect(assets.fetch).not.toHaveBeenCalled();
  await expect(
    materializePreviewAssets(
      input.replace(
        "/_astro/SystemMap.synthetic.js",
        "/api/private/SystemMap.js",
      ),
      origin,
      reader(value),
      false,
    ),
  ).rejects.toThrow("Unmanifested preview script");
});
