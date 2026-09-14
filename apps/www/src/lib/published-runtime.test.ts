import { describe, expect, it } from "vitest";
import {
  overlayByIdentity,
  isRuntimeContentPath,
  publicMarkdown,
} from "./published-runtime";
import { hasPublishedMedia } from "./published-media";
import type { PublishedSnapshot } from "@anipotts/content/editorial/direct-publication";
const id = "a".repeat(64) + ".jpg";
function publication(status = "published", image = id): PublishedSnapshot {
  return {
    publicationId: "test",
    record: { kind: "writing", id: "test" },
    revision: 1,
    sourceSha256: "a".repeat(64),
    publishedAt: "2026-09-12T00:00:00Z",
    source: `---\ntitle: Test\nsummary: Test summary\nstatus: ${status}\npublished_at: 2026-09-12\n---\n![Photo](/images/editorial/${image})\n`,
  };
}
describe("runtime publications", () => {
  it("replaces Git by identity before filtering hidden records", () => {
    const result = overlayByIdentity(
      [
        { id: "a", visible: true },
        { id: "b", visible: true },
      ],
      [
        { id: "a", visible: false },
        { id: "c", visible: true },
      ],
    );
    expect(
      result.filter((item) => item.visible).map((item) => item.id),
    ).toEqual(["b", "c"]);
  });
  it("bypasses old static pages and media but retains unrelated assets", () => {
    for (const path of [
      "/",
      "/work",
      "/work/new",
      "/writing/new",
      "/systems",
      "/feed.xml",
      "/sitemap.xml",
      "/search-index.json",
      `/images/editorial/${id}`,
    ])
      expect(isRuntimeContentPath(path)).toBe(true);
    for (const path of [
      "/links",
      "/newsletter",
      "/_astro/script.js",
      "/images/logo.png",
    ])
      expect(isRuntimeContentPath(path)).toBe(false);
  });
  it("renders new body safely, retaining ordinary text and links", async () => {
    const result = await publicMarkdown(
      publication().source +
        '\n<script>alert(1)</script>\n[Source](https://example.com)\n<img src=x onerror="alert(1)">',
    );
    expect(result.rendered.html).toContain("https://example.com");
    expect(result.rendered.html).not.toMatch(/<script|onerror/u);
    expect(result.body).toContain("Photo");
  });
  it("allows only exact visible published references, excluding draft attachments and suffix confusion", () => {
    expect(hasPublishedMedia([publication()], id)).toBe(true);
    expect(hasPublishedMedia([publication("draft")], id)).toBe(false);
    expect(
      hasPublishedMedia([publication("published", id + ".private")], id),
    ).toBe(false);
    expect(hasPublishedMedia([], id)).toBe(false);
    expect(hasPublishedMedia([publication()], "../" + id)).toBe(false);
  });
  it("rejects invalid published schema instead of treating it as public", () => {
    expect(() => hasPublishedMedia([publication("invented")], id)).toThrow(
      "Invalid published content",
    );
  });
});

it("reads a request's publication inventory once and fails closed on database errors", async () => {
  let reads = 0;
  const db = {
    prepare: () => ({
      all: async () => {
        reads += 1;
        throw new Error("unavailable");
      },
    }),
  };
  const locals = {
    runtime: { env: { CONTENT_DB: db } },
  } as unknown as App.Locals;
  const { publicContentContext } = await import("./published-runtime");
  const context = publicContentContext(locals);
  expect(publicContentContext(locals)).toBe(context);
  await expect(context.publications).rejects.toThrow("unavailable");
  expect(reads).toBe(1);
});

it("advertises content runtime readiness after schema and media checks", async () => {
  const { GET } = await import("../pages/api/health");
  const DB = { prepare: () => ({ first: async () => ({ cnt: 1 }) }) };
  const CONTENT_MEDIA = { head: async () => null };
  for (const [version, expected] of [
    [undefined, 0],
    [0, 1],
    [-1, 0],
    [NaN, 0],
  ] as const) {
    const CONTENT_DB =
      version === undefined
        ? undefined
        : { prepare: () => ({ first: async () => ({ version }) }) };
    const response = await GET({
      locals: { runtime: { env: { DB, CONTENT_DB, CONTENT_MEDIA } } },
    } as unknown as Parameters<typeof GET>[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      app: "www",
      content_runtime: expected,
      ok: true,
    });
  }
  const response = await GET({
    locals: {
      runtime: {
        env: {
          DB,
          CONTENT_MEDIA,
          CONTENT_DB: {
            prepare: () => {
              throw new Error("private provider error");
            },
          },
        },
      },
    },
  } as unknown as Parameters<typeof GET>[0]);
  const body = await response.text();
  expect(body).toContain('"content_runtime":0');
  expect(body).not.toContain("private provider error");
});
