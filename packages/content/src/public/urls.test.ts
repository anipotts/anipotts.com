import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  safeAssetUrl,
  safeContactLinkUrl,
  safeContentLinkUrl,
  safeHomepageAssetUrl,
  safeHttpsUrl,
  safeLocalAssetUrl,
} from "./urls.js";
import { inlineHtml, safeInlineUrl } from "./inline.js";
import { parseMarkdownBlocks } from "./markdown.js";
import {
  homepageSchema,
  newsletterPageSchema,
  systemsPageSchema,
  workPageSchema,
  listingPageSchema,
} from "./pages.js";
import { projectSchema, writingSchema } from "./schema.js";
import {
  parseEditorialSource,
  setEditorialField,
  validateEditorialSource,
} from "../editorial/source.js";

const rejected = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:image/svg+xml,test",
  "http://example.com",
  "//evil.example/path",
  "/\\evil.example/path",
  "https://good.example\\@evil.example",
  "https://owner:password@example.com/path",
  "https://owner@example.com/path",
  "https://example.com/\npath",
  "https://example.com/\tpath",
  "https://example.com/%0d%0aLocation:evil",
  "/images/%00logo.png",
  "/%2fevil.example",
  "/%5Cevil.example",
  " /work",
  "https://example.com/<tag>",
  'https://example.com/"tag',
];
const fixture = (path: string) =>
  readFileSync(
    new URL(`../../../../content/public/${path}`, import.meta.url),
    "utf8",
  );

// Exercise the public predicates as well as source-mode and rendering boundaries.
describe("purpose-specific authored URLs", () => {
  it.each(rejected)("rejects unsafe URL %j at every shared boundary", (url) => {
    for (const check of [
      safeContentLinkUrl,
      safeContactLinkUrl,
      safeAssetUrl,
      safeLocalAssetUrl,
      safeHomepageAssetUrl,
      safeHttpsUrl,
      safeInlineUrl,
    ]) {
      expect(check(url)).toBe(false);
    }
  });

  it.each([
    "https://example.com/path?q=one%20two#heading",
    "/work/project",
    "/writing?tag=ai",
    "#details",
  ])("keeps content link %s", (url) => {
    expect(safeContentLinkUrl(url)).toBe(true);
    expect(safeInlineUrl(url)).toBe(true);
  });

  it("keeps local structured media and explicitly supported HTTPS inline images", () => {
    expect(safeLocalAssetUrl("/images/logo%20wide.png")).toBe(true);
    expect(safeAssetUrl("https://example.com/image.png")).toBe(true);
    expect(safeLocalAssetUrl("https://example.com/image.png")).toBe(false);
    expect(safeAssetUrl("#image")).toBe(false);
    expect(safeHomepageAssetUrl("/images/brand/logo.svg")).toBe(true);
    for (const path of [
      "/other/logo.png",
      "/images/../private.png",
      "/images/%2e%2e/private.png",
    ]) {
      expect(safeHomepageAssetUrl(path)).toBe(false);
    }
  });

  it("limits mailto to contact-bearing links with one mailbox and safe optional subject/body", () => {
    for (const url of [
      "mailto:hello@anipotts.com",
      "mailto:hello+website@example.com?subject=Hello%20there&body=Thanks",
      "mailto:hello%2Bwebsite%40example.com?subject=Hello",
    ]) {
      expect(safeContactLinkUrl(url)).toBe(true);
      expect(safeContentLinkUrl(url)).toBe(false);
      expect(safeAssetUrl(url)).toBe(false);
    }
    for (const url of [
      "mailto:",
      "mailto://hello@example.com",
      "mailto:hello@example.com?bcc=someone@example.com",
      "mailto:hello@example.com?subject=test%0d%0abcc:someone@example.com",
      "mailto:a%40example.com%2cb@example.org",
      "mailto:a%40example.com%3Bb@example.org",
      "mailto:a%40example.com@example.org",
      "mailto:hello%20there@example.com",
      "mailto:hello%zz@example.com",
      "mailto:hello%0a@example.com",
    ]) {
      expect(safeContactLinkUrl(url)).toBe(false);
    }
  });

  it.each(rejected)(
    "rejects source-mode project links with their exact field path: %j",
    (url) => {
      for (const field of ["link_live", "link_repo"]) {
        const source = setEditorialField(
          fixture("projects/chainedchat.md"),
          [field],
          url,
        );
        const before = source;
        const result = validateEditorialSource(
          { kind: "work", id: "chainedchat" },
          source,
        );
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues.map((issue) => issue.path)).toContainEqual(
            [field],
          );
        expect(source).toBe(before);
        expect(parseEditorialSource(source).data[field]).toBe(url);
      }
    },
  );

  it("rejects nested assets and homepage links with actionable field paths", () => {
    const cases = [
      {
        path: ["identity", "logo_src"],
        source: fixture("projects/chainedchat.md"),
        record: { kind: "work", id: "chainedchat" } as const,
      },
      {
        path: ["preview_media", "src"],
        source: fixture("projects/structured-ai.md"),
        record: { kind: "work", id: "structured-ai" } as const,
      },
      {
        path: ["story", 0, "media", "src"],
        source: fixture("projects/pgi-research-platform.md"),
        record: { kind: "work", id: "pgi-research-platform" } as const,
      },
      {
        path: ["sections", "past_work", "links", 0, "href"],
        source: fixture("pages/home.md"),
        record: { kind: "page", id: "home" } as const,
      },
      {
        path: ["sections", "past_work", "view_all"],
        source: fixture("pages/home.md"),
        record: { kind: "page", id: "home" } as const,
      },
      {
        path: ["mentions", "structuredAi", "href"],
        source: fixture("pages/home.md"),
        record: { kind: "page", id: "home" } as const,
      },
      {
        path: ["mentions", "structuredAi", "logoSrc"],
        source: fixture("pages/home.md"),
        record: { kind: "page", id: "home" } as const,
      },
    ];
    for (const { path, source, record } of cases) {
      const result = validateEditorialSource(
        record,
        setEditorialField(source, path.map(String), "//evil.example/logo.png"),
      );
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.path)).toContainEqual(
          path,
        );
    }
  });

  it("checks writing artifact and newsletter destinations", () => {
    expect(
      writingSchema.safeParse({
        title: "test",
        summary: "test",
        artifact_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    const data = parseEditorialSource(fixture("pages/newsletter.md")).data;
    for (const field of ["buttondown_url", "archive_url"]) {
      const result = newsletterPageSchema.safeParse({
        ...data,
        [field]: "javascript:alert(1)",
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
          field,
        ]);
    }
  });

  it("does not emit unsafe Markdown link or image attributes", () => {
    for (const url of [
      "https://owner:password@example.com",
      "/\\evil.example",
      "/%5cevil.example",
      "//evil.example",
      "https://example.com/%0a",
    ]) {
      expect(inlineHtml(`[link](${url}) ![image](${url})`)).not.toMatch(
        /href=|src=/u,
      );
      const blocks = parseMarkdownBlocks(`[link](${url})`);
      expect(JSON.stringify(blocks)).not.toContain('"kind":"link"');
    }
    expect(
      JSON.stringify(
        parseMarkdownBlocks("[contact](mailto:hello@anipotts.com)"),
      ),
    ).toContain('"kind":"link"');
  });

  it("accepts every current Git content fixture without changing its bytes", () => {
    for (const [directory, schema] of [
      ["projects", projectSchema],
      ["writing", writingSchema],
    ] as const) {
      const root = new URL(
        `../../../../content/public/${directory}/`,
        import.meta.url,
      );
      for (const file of readdirSync(root).filter((name) =>
        name.endsWith(".md"),
      )) {
        const source = fixture(`${directory}/${file}`);
        expect(
          schema.safeParse(parseEditorialSource(source).data).success,
          `${directory}/${file}`,
        ).toBe(true);
      }
    }
    for (const [name, schema] of [
      ["home", homepageSchema],
      ["work", workPageSchema],
      ["writing", listingPageSchema],
      ["systems", systemsPageSchema],
      ["newsletter", newsletterPageSchema],
    ] as const) {
      expect(
        schema.safeParse(parseEditorialSource(fixture(`pages/${name}.md`)).data)
          .success,
        name,
      ).toBe(true);
    }
  });
});
