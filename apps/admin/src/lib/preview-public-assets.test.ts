// @vitest-environment jsdom
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
  const parsed = new DOMParser().parseFromString(result, "text/html");
  expect(
    parsed.querySelector<HTMLButtonElement>("[data-motion-toggle]")?.hidden,
  ).toBe(true);
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
  const parsedDEV = new DOMParser().parseFromString(devResult, "text/html");
  expect(
    parsedDEV.querySelector<HTMLButtonElement>("[data-motion-toggle]")?.hidden,
  ).toBe(true);
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

function actualDevStyleForm(path: string, css: string) {
  return `<style data-vite-dev-id="${path.replaceAll("&", "&amp;")}">${css}</style><script type="module" src="/@fs${path.replaceAll("&", "&amp;")}"></script>`;
}
const publicInlinePath = `${root}/apps/www/src/styles/global.css`;
const inlineFont = `/@fs${root}/packages/brand/ap-structural-v0.2.0-candidate.1/fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.woff2`;
it("materializes Astro 7.4's real inline CSS plus paired HMR module form without fetching CSS or leaving Vite requests", async () => {
  const requests: Request[] = [];
  const assets = {
    fetch: async (request: Request) => {
      requests.push(request);
      expect(new URL(request.url).pathname).toBe(inlineFont);
      expect(request.headers.has("Cookie")).toBe(false);
      expect(request.headers.has("Origin")).toBe(false);
      return new Response(new Uint8Array([119, 79, 70, 50]), {
        headers: { "Content-Type": "font/woff2" },
      });
    },
  };
  const router = `${root}/node_modules/.pnpm/astro@7.4.0/node_modules/astro/components/ClientRouter.astro?astro&type=style&index=0&lang.css`;
  const transition = `${root}/node_modules/.pnpm/astro@7.4.0/node_modules/astro/components/viewtransitions.css`;
  const input = `<html><head><style>html{color-scheme:light}</style>${actualDevStyleForm(publicInlinePath, `@font-face{font-family:test;src:url(${inlineFont})}body{color:red}`)}${actualDevStyleForm(router, "::view-transition-old(root){opacity:0}")}${actualDevStyleForm(transition, "::view-transition-new(root){opacity:1}")}</head><body><script src="/@vite/client"></script></body></html>`;
  const output = await materializePreviewAssets(
    input,
    new URL("http://127.0.0.1:8917/preview/home"),
    assets,
    true,
  );
  expect(requests).toHaveLength(1);
  expect(output).toContain("<style>html{color-scheme:light}</style>");
  expect(output).toContain("<style data-preview-public-style>");
  expect(output).toContain("body{color:red}");
  expect(output).toContain("data:font/woff2;base64,d09GMg==");
  expect(output).not.toContain("data-vite-dev-id");
  expect(output).not.toContain("<script src=");
  expect(output).not.toContain('src="/@fs');
  expect(output).not.toContain("view-transition-old");
  expect(output).not.toContain("view-transition-new");
});
it.each([
  "private-style",
  "foreign-font",
  "unpaired-module",
  "unknown-module",
  "count",
  "size",
  "private-router-lookalike",
])("refuses unapproved Astro inline-form %s", async (kind) => {
  let input = actualDevStyleForm(publicInlinePath, "body{color:red}");
  if (kind === "private-style")
    input = actualDevStyleForm(
      `${root}/apps/admin/src/styles/private.css`,
      "body{color:red}",
    );
  if (kind === "foreign-font")
    input = actualDevStyleForm(
      publicInlinePath,
      "body{background:url(https://private.example/secret)}",
    );
  if (kind === "unpaired-module")
    input = `<script type="module" src="/@fs${publicInlinePath}"></script>`;
  if (kind === "unknown-module")
    input += '<script type="module" src="/@id/unapproved-module"></script>';
  if (kind === "count") input = input.repeat(33);
  if (kind === "size")
    input = actualDevStyleForm(publicInlinePath, "x".repeat(256 * 1024 + 1));
  if (kind === "private-router-lookalike")
    input = actualDevStyleForm(
      `${root}/apps/admin/src/ClientRouter.astro?astro&type=style&index=0&lang.css`,
      "body{color:red}",
    );
  const fetch = vi.fn(async () => {
    throw new Error("Unapproved reads forbidden");
  });
  await expect(
    materializePreviewAssets(
      `<html><head>${input}</head><body></body></html>`,
      origin,
      { fetch },
      true,
    ),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  '<SCRIPT SRC="/api/private">ignored external body</SCRIPT >',
  "<script src='/api/private'></script>",
  "<script src=/api/private></script >",
  '<ScRiPt src="&#47;api&#47;private"></ScRiPt>',
  '<script\nsrc="/api/private"></script\t>',
  '<template><script src="/api/private"></script></template>',
  "<template><template><SCRIPT SRC=/api/private></SCRIPT ></template></template>",
  '<svg><script href="/api/private"></script></svg>',
  '<svg><script xlink:href="/api/private" /></svg>',
  '<svg><foreignObject><script src="/api/private"></script></foreignObject></svg>',
  '<math><script src="/api/private"></script></math>',
  '<script/SRC="/api/private"></script>',
  '<noscript><script src="/api/private"></script></noscript>',
])(
  "rejects unknown or foreign external scripts using HTML structure: %s",
  async (input) => {
    const assets = reader(pack());
    await expect(
      materializePreviewAssets(
        `<html><head></head><body>${input}</body></html>`,
        origin,
        assets,
        false,
      ),
    ).rejects.toThrow();
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  `<SCRIPT SRC='${script}'>ignored external body</SCRIPT >`,
  `<script src=${script}></script\t>`,
  `<script src="&#47;_astro&#47;Nav.ABC123.js"></script>`,
  `<template><script src='${script}'></script ></template>`,
])(
  "replaces manifest-owned scripts regardless of legal HTML spelling: %s",
  async (input) => {
    const result = await materializePreviewAssets(
      `<html><head></head><body>${input}<script>window.productInline=true</script></body></html>`,
      origin,
      reader(pack()),
      false,
    );
    const parsed = new DOMParser().parseFromString(result, "text/html");
    expect(parsed.querySelector("script[src]")).toBeNull();
    expect(
      parsed.querySelector("template")?.content.querySelector("script[src]") ??
        null,
    ).toBeNull();
    expect(result).toContain("window.productInline=true");
  },
);
it("structurally materializes uppercase single-quoted stylesheet links and decoded URL entities", async () => {
  const input = `<HTML><HEAD><LINK REL='stylesheet' HREF='&#47;_astro&#47;record.ABC123.css'></HEAD><BODY><a href="/work?one=1&amp;two=2">link</a></BODY></HTML>`;
  const result = await materializePreviewAssets(
    input,
    origin,
    reader(pack()),
    false,
  );
  const parsed = new DOMParser().parseFromString(result, "text/html");
  expect(parsed.querySelector('link[rel="stylesheet"]')).toBeNull();
  expect(
    parsed.querySelector("[data-preview-public-style]")?.textContent,
  ).toContain("data:font/woff2");
  expect(parsed.querySelector("a")?.getAttribute("href")).toBe(
    "/work?one=1&two=2",
  );
});
it.each(["</style", "</STYLE >", "</sTyLe\t>", "</styleanything"])(
  "rejects CSS closing prefixes before raw-text insertion: %s",
  async (end) => {
    const value = pack();
    value.styles[0].css = `body{color:red}${end}<script src=/api/private></script>`;
    await expect(
      materializePreviewAssets(html, origin, reader(value), false),
    ).rejects.toThrow("Invalid preview CSS terminator");
  },
);
it.each(["</script", "</SCRIPT >", "</sCrIpT\t>"])(
  "rejects fixed client closing prefixes before raw-text insertion: %s",
  async (end) => {
    vi.resetModules();
    vi.doMock("../../../www/src/scripts/preview-client.js?raw", () => ({
      default: `/* ${end} */`,
    }));
    try {
      const isolated = await import("./preview-public-assets");
      await expect(
        isolated.materializePreviewAssets(html, origin, reader(pack()), false),
      ).rejects.toThrow("Invalid preview client terminator");
    } finally {
      vi.doUnmock("../../../www/src/scripts/preview-client.js?raw");
      vi.resetModules();
    }
  },
);
it("does not mistake an external origin's source-path lookalike for a trusted DEV script", async () => {
  const input =
    '<html><head></head><body><script src="https://foreign.example/apps/www/src/components/Nav.astro?astro&type=script"></script></body></html>';
  const assets = {
    fetch: vi.fn(async () => {
      throw new Error("No asset reads expected");
    }),
  };
  await expect(
    materializePreviewAssets(input, origin, assets, true),
  ).rejects.toThrow("Unmanifested preview script");
  expect(assets.fetch).not.toHaveBeenCalled();
});

it("removes parser-time autofocus only from the known preview image viewer close control", async () => {
  const input =
    '<html><head></head><body><dialog data-image-viewer><button data-image-close autofocus>close</button><button autofocus>other viewer control</button></dialog><dialog><button data-image-close autofocus>unrelated close</button></dialog><button id="ordinary" autofocus>ordinary</button></body></html>';
  const result = await materializePreviewAssets(
    input,
    origin,
    reader(pack()),
    false,
  );
  const parsed = new DOMParser().parseFromString(result, "text/html");
  expect(
    parsed
      .querySelector("[data-image-viewer] [data-image-close]")
      ?.hasAttribute("autofocus"),
  ).toBe(false);
  expect(
    parsed
      .querySelector("[data-image-viewer] button:not([data-image-close])")
      ?.hasAttribute("autofocus"),
  ).toBe(true);
  expect(
    parsed
      .querySelector("dialog:not([data-image-viewer]) [data-image-close]")
      ?.hasAttribute("autofocus"),
  ).toBe(true);
  expect(parsed.querySelector("#ordinary")?.hasAttribute("autofocus")).toBe(
    true,
  );
});
