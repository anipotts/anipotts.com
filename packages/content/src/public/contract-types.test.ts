import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFAULT_CMS_PROJECTS,
  DEFAULT_CMS_WRITING,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_NEWSLETTER_ARCHIVE_CONTENT,
  DEFAULT_NEWSLETTER_CONTENT,
  DEFAULT_SYSTEMS_CONTENT,
  DEFAULT_WORK_INDEX_CONTENT,
  DEFAULT_WRITING_INDEX_CONTENT,
} from "./defaults";
import {
  homepageSchema,
  listingPageSchema,
  newsletterPageSchema,
  systemsPageSchema,
  workPageSchema,
} from "./pages";
import type { HomepageMention, SystemsPageContent } from "./index";

// Runtime half of the public content contract. The generated page defaults
// must survive their zod schema unchanged, so zod can be the only type source.
describe("generated page defaults match their zod schema", () => {
  const pages = [
    ["home", homepageSchema, DEFAULT_HOMEPAGE_CONTENT],
    ["work", workPageSchema, DEFAULT_WORK_INDEX_CONTENT],
    ["writing", listingPageSchema, DEFAULT_WRITING_INDEX_CONTENT],
    [
      "newsletter_archive",
      listingPageSchema,
      DEFAULT_NEWSLETTER_ARCHIVE_CONTENT,
    ],
    ["newsletter", newsletterPageSchema, DEFAULT_NEWSLETTER_CONTENT],
    ["systems", systemsPageSchema, DEFAULT_SYSTEMS_CONTENT],
  ] as const;

  it.each(pages)("%s round-trips through zod", (_page, schema, value) => {
    expect(schema.parse(value)).toEqual(value);
  });
});

// The d1-era projection shapes the generator emits. Explicit lists, not inline
// snapshots, so CI never rewrites this file.
const PROJECT_PROJECTION_KEYS = [
  "body",
  "card_copy",
  "catalog_group",
  "detail_path",
  "homepage_order",
  "homepage_placement",
  "identity",
  "kind",
  "links",
  "order",
  "preview_media",
  "public_state",
  "range",
  "slug",
  "status",
  "story",
  "summary",
  "tags",
  "title",
  "year",
];

const WRITING_PROJECTION_KEYS = [
  "body",
  "date",
  "order",
  "preview",
  "slug",
  "sourceLinks",
  "tags",
  "title",
  "visible",
];

describe("generated projections keep their key sets", () => {
  it("projects", () => {
    expect(DEFAULT_CMS_PROJECTS.length).toBeGreaterThan(0);
    for (const project of DEFAULT_CMS_PROJECTS)
      expect(Object.keys(project).sort()).toEqual(PROJECT_PROJECTION_KEYS);
  });

  it("writing", () => {
    expect(DEFAULT_CMS_WRITING.length).toBeGreaterThan(0);
    for (const entry of DEFAULT_CMS_WRITING)
      expect(Object.keys(entry).sort()).toEqual(WRITING_PROJECTION_KEYS);
  });
});

// Type half. vitest run does not typecheck and the package tsconfig excludes
// tests, so these lines only fail under a tsconfig that includes this file.
describe("public entry types consumers read", () => {
  it("homepage mention", () => {
    expectTypeOf<HomepageMention>().toHaveProperty("logoSrc");
    expectTypeOf<HomepageMention["logoTone"]>().toEqualTypeOf<
      "native" | "white" | undefined
    >();
  });

  it("systems workflow", () => {
    expectTypeOf<SystemsPageContent["workflow"]["sources"]>().toEqualTypeOf<
      string[]
    >();
  });
});
