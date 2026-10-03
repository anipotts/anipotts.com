import { expect, it, vi } from "vitest";
import { previewMediaUrl, previewMediaSrcset } from "./preview-media";
vi.mock("./editorial-content", () => ({
  publicSiteUrl: "https://anipotts.com",
}));
import { previewResponse } from "./preview-html";
const context = {
  requestUrl: new URL("https://admin.anipotts.com/preview/record"),
  publicSiteUrl: "https://anipotts.com",
};
const id = "a".repeat(64) + ".png";
it("keeps uploaded candidate media on its owner API and bundled variants on one asset origin", () => {
  expect(previewMediaUrl(`/images/editorial/${id}`, context)).toBe(
    `https://admin.anipotts.com/api/editorial/media?id=${id}`,
  );
  expect(previewMediaUrl("/images/work/shot-800.webp", context)).toBe(
    "https://anipotts.com/images/work/shot-800.webp",
  );
  expect(
    previewMediaSrcset(
      "/images/work/shot-800.webp 800w, /images/work/shot-1600.webp 1600w",
      context,
    ),
  ).toBe(
    "https://anipotts.com/images/work/shot-800.webp 800w, https://anipotts.com/images/work/shot-1600.webp 1600w",
  );
  expect(
    previewMediaUrl(`https://anipotts.com/images/editorial/${id}`, context),
  ).toBe(`https://admin.anipotts.com/api/editorial/media?id=${id}`);
  expect(previewMediaUrl(`/api/editorial/media?id=${id}`, context)).toBe(
    `https://admin.anipotts.com/api/editorial/media?id=${id}`,
  );
  expect(
    previewMediaUrl("/images/work/shot.webp", {
      ...context,
      localAssets: true,
    }),
  ).toBe("https://admin.anipotts.com/images/work/shot.webp");
});
it("rewrites exact preview media, responsive sources and enlarge links with no unsafe double escaping", async () => {
  vi.stubEnv("DEV", false);
  try {
    const response = await previewResponse(
      new Response(
        `<picture><source srcset="/images/work/shot-800.webp"><img src="/images/work/shot-800.webp" srcset="/images/work/shot-800.webp 800w, /images/work/shot-1600.webp 1600w"></picture><img src="/images/editorial/${id}"><a href="/images/editorial/${id}">enlarge</a><a href="/writing/essay">read</a><img src="https://example.com/image?x=1&amp;y=2">`,
        { headers: { "Content-Type": "text/html" } },
      ),
      context.requestUrl,
    );
    const html = await response.text();
    expect(html).toContain(
      'srcset="https://anipotts.com/images/work/shot-800.webp"',
    );
    expect(html).toContain(
      `src="https://admin.anipotts.com/api/editorial/media?id=${id}"`,
    );
    expect(html).toContain(
      `href="https://admin.anipotts.com/api/editorial/media?id=${id}"`,
    );
    expect(html).toContain('href="https://anipotts.com/writing/essay"');
    expect(html).toContain('src="https://example.com/image?x=1&amp;y=2"');
    expect(html).not.toContain("&amp;amp;");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox allow-scripts",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
