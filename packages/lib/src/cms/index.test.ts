import { describe, expect, it } from "vitest";
import { setDB, type D1Database, type D1PreparedStatement } from "../db";
import {
  cmsProjectPageKey,
  cmsWritingPageKey,
  DEFAULT_CMS_PROJECTS,
  DEFAULT_CMS_WRITING,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_MAKING_INDEX_CONTENT,
  DEFAULT_NEWSLETTER_ARCHIVE_CONTENT,
  DEFAULT_NEWSLETTER_CONTENT,
  DEFAULT_ORCHESTRATING_CONTENT,
  DEFAULT_PROJECTS_INDEX_CONTENT,
  DEFAULT_WRITING_INDEX_CONTENT,
  normalizeCmsProject,
  normalizeCmsWriting,
  normalizeHomepageContent,
  normalizeListingPageContent,
  normalizeNewsletterContent,
  normalizeOrchestratingPageContent,
  searchWriting,
  validateCmsProject,
  validateCmsWriting,
  validateHomepageContent,
  validateListingPageContent,
  validateNewsletterContent,
  validateOrchestratingPageContent,
  homepageSummaryText,
} from "./index";

describe("homepage cms validation", () => {
  it("accepts normalized fallback content", () => {
    const content = normalizeHomepageContent(DEFAULT_HOMEPAGE_CONTENT);
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("rejects empty visible required fields", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        intro: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.intro,
          heading: "",
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({
      ok: false,
      error: "Homepage heading is required",
    });
  });

  it("allows hidden sections to have empty labels and links", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        past_work: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.past_work,
          visible: false,
          label: "",
          links: [{ label: "", href: "" }],
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("rejects malformed visible links", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        latest_thoughts: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.latest_thoughts,
          links: [{ label: "news", href: "javascript:alert(1)" }],
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({
      ok: false,
      error: "Writing link must start with / or https://",
    });
  });

  it("drops legacy copied homepage work fields", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      proof_cards: [{ label: "old", href: "/making" }],
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        past_work: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.past_work,
          project_slugs: ["quantercise"],
        },
      },
    } as unknown);

    expect("proof_cards" in content).toBe(false);
    expect("project_slugs" in content.sections.past_work).toBe(false);
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("normalizes D1-shaped homepage writing slugs", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        latest_thoughts: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.latest_thoughts,
          writing_slugs: [
            " saturdays-are-for-claude-code ",
            " stop-ending-your-day-with-fix-the-bug ",
          ],
        },
      },
    });

    expect(content.sections.latest_thoughts.writing_slugs).toEqual([
      "saturdays-are-for-claude-code",
      "stop-ending-your-day-with-fix-the-bug",
    ]);
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("normalizes D1-shaped homepage rich summary segments", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        intro: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.intro,
          rich_summary: [
            {
              segments: [
                { kind: "text", text: "worked at " },
                { kind: "mention", key: "structuredAi" },
                {
                  kind: "cluster",
                  segments: [
                    { kind: "text", text: " with " },
                    { kind: "mention", key: "yCombinatorF25" },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    expect(content.sections.intro.rich_summary).toEqual([
      {
        segments: [
          { kind: "text", text: "worked at " },
          { kind: "mention", key: "structuredAi" },
          {
            kind: "cluster",
            segments: [
              { kind: "text", text: " with " },
              { kind: "mention", key: "yCombinatorF25" },
            ],
          },
        ],
      },
    ]);
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("drops malformed homepage rich summary mention keys", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        intro: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.intro,
          rich_summary: [
            {
              segments: [
                { kind: "text", text: "safe " },
                { kind: "mention", key: "../unsafe" },
              ],
            },
          ],
        },
      },
    });

    expect(content.sections.intro.rich_summary).toEqual([
      {
        segments: [{ kind: "text", text: "safe " }],
      },
    ]);
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("normalizes D1-shaped homepage mentions", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      mentions: {
        ...DEFAULT_HOMEPAGE_CONTENT.mentions,
        structuredAi: {
          label: " structured ai ",
          href: " https://getstructured.ai/ ",
          logoSrc: " /images/brand/structured-ai-favicon.png ",
          logoAlt: " structured ai ",
          logoTone: "white",
        },
      },
    });

    expect(content.mentions.structuredAi).toEqual({
      label: "structured ai",
      href: "https://getstructured.ai/",
      logoSrc: "/images/brand/structured-ai-favicon.png",
      logoAlt: "structured ai",
      logoTone: "white",
    });
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });

  it("rejects homepage mention logos outside local images", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      mentions: {
        ...DEFAULT_HOMEPAGE_CONTENT.mentions,
        structuredAi: {
          ...DEFAULT_HOMEPAGE_CONTENT.mentions.structuredAi,
          logoSrc: "https://example.com/logo.png",
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({
      ok: false,
      error: "Homepage mention structuredAi logo must stay under /images/",
    });
  });

  it("requires rich summary mention keys to exist in mention metadata", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        intro: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.intro,
          rich_summary: [
            {
              segments: [{ kind: "mention", key: "newMention" }],
            },
          ],
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({
      ok: false,
      error: "Homepage mention newMention is required",
    });
  });

  it("rejects duplicate homepage writing slugs", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        latest_thoughts: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.latest_thoughts,
          writing_slugs: ["post-one", "post-one"],
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({
      ok: false,
      error: "Writing slugs must be unique",
    });
  });

  it("rejects excessive homepage summary length", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        intro: {
          ...DEFAULT_HOMEPAGE_CONTENT.sections.intro,
          subheading: "x".repeat(501),
        },
      },
    });

    expect(validateHomepageContent(content)).toEqual({
      ok: false,
      error: "Homepage summary is too long",
    });
  });

  it("derives the current plain homepage summary", () => {
    const content = normalizeHomepageContent(DEFAULT_HOMEPAGE_CONTENT);

    expect(homepageSummaryText(content)).toBe(
      "i work on realtime agent systems and make content about how they work. i previously worked on real-time agent i/o at structured ai (YC F25) and our bad habit, an atlantic records venture, and business insider also covered my everyday workflow.",
    );
  });

  it("keeps D1 subheading-only intro copy plain", () => {
    const content = normalizeHomepageContent({
      ...DEFAULT_HOMEPAGE_CONTENT,
      sections: {
        ...DEFAULT_HOMEPAGE_CONTENT.sections,
        intro: {
          visible: true,
          label: "index",
          heading: "hi, i'm ani",
          subheading: "plain d1 summary",
        },
      },
    });

    expect(content.sections.intro.rich_summary).toBeUndefined();
    expect(homepageSummaryText(content)).toBe("plain d1 summary");
    expect(validateHomepageContent(content)).toEqual({ ok: true });
  });
});

describe("writing search", () => {
  it("uses safe fts phrase matching against published writing rows", async () => {
    let preparedSql = "";
    let boundValues: unknown[] = [];

    const statement: D1PreparedStatement = {
      bind(...values: unknown[]) {
        boundValues = values;
        return statement;
      },
      async first() {
        return null;
      },
      async run() {
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            changes: 0,
            last_row_id: 0,
            rows_read: 0,
            rows_written: 0,
          },
        };
      },
      async all<T>() {
        return {
          results: [
            {
              slug: "claude-code",
              title: "claude code",
              summary: "agent note",
              created_at: "2026-06-01",
              published_at: "2026-06-16",
              views: 5,
              id: "thought-1",
              series_type: "note",
              tags: '["codex"]',
            },
          ] as T[],
          success: true,
          meta: {
            duration: 0,
            changes: 0,
            last_row_id: 0,
            rows_read: 1,
            rows_written: 0,
          },
        };
      },
      async raw<T>() {
        return [] as T[];
      },
    };

    const db: D1Database = {
      prepare(query: string) {
        preparedSql = query;
        return statement;
      },
      async exec() {
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            changes: 0,
            last_row_id: 0,
            rows_read: 0,
            rows_written: 0,
          },
        };
      },
      async batch() {
        return [];
      },
      async dump() {
        return new ArrayBuffer(0);
      },
    };

    setDB(db);

    const results = await searchWriting('claude "code"');

    expect(preparedSql).toContain("t.published_at");
    expect(preparedSql).toContain(
      "AND (t.status = 'published' OR t.published = 1)",
    );
    expect(boundValues).toEqual(['"claude ""code"""']);
    expect(results[0]).toMatchObject({
      slug: "claude-code",
      published_at: "2026-06-16",
      tags: ["codex"],
    });
  });
});

describe("owner editor cms validation", () => {
  it("keeps page-content keys and fallback inventory stable", () => {
    expect(cmsProjectPageKey("Claude Code Tips!")).toBe(
      "project:claude-code-tips",
    );
    expect(cmsWritingPageKey('Stop Ending Your Day With "Fix The Bug"')).toBe(
      "writing:stop-ending-your-day-with-fix-the-bug",
    );
    expect(DEFAULT_CMS_PROJECTS.length).toBeGreaterThan(0);
    expect(DEFAULT_CMS_WRITING.length).toBeGreaterThan(0);
  });

  it("normalizes project editor content from d1-shaped rows", () => {
    const project = normalizeCmsProject({
      slug: "My Project!",
      title: " my project ",
      status: "in-progress",
      year: "2026",
      duration: "spring 2026",
      tags: '["ai","tools"]',
      subtitle: " summary ",
      description: "body",
      link_live: "https://example.com",
      featured: 1,
      visible: 1,
      sort_order: 10,
      icon: "circles-three-plus",
      identity: { icon: "circles-three-plus" },
    });

    expect(project).toMatchObject({
      slug: "my-project",
      status: "wip",
      summary: "summary",
      tags: ["ai", "tools"],
      order: 10,
    });
    expect("featured" in project).toBe(false);
    expect("visible" in project).toBe(false);
    expect(validateCmsProject(project)).toEqual({ ok: true });
  });

  it("rejects bad project links", () => {
    const project = normalizeCmsProject({
      slug: "project",
      title: "project",
      status: "live",
      year: "2026",
      range: "ongoing",
      summary: "summary",
      body: "body",
      links: [{ label: "demo", url: "javascript:alert(1)" }],
    });

    expect(validateCmsProject(project)).toEqual({
      ok: false,
      error: "Project link must start with /, https://, or mailto:",
    });
  });

  it("normalizes writing visibility from published status", () => {
    const writing = normalizeCmsWriting({
      slug: "Post",
      title: "post",
      summary: "preview",
      content: "body",
      status: "published",
      published_at: "2026-06-16",
      tags: ["codex"],
      artifact_url: "https://example.com/source",
      artifact_type: "source",
    });

    expect(writing.visible).toBe(true);
    expect(writing.date).toBe("2026-06-16");
    expect(validateCmsWriting(writing)).toEqual({ ok: true });
  });

  it("rejects empty writing body", () => {
    const writing = normalizeCmsWriting({
      slug: "post",
      title: "post",
      preview: "preview",
      body: "",
      date: "2026-06-16",
    });

    expect(validateCmsWriting(writing)).toEqual({
      ok: false,
      error: "Writing body is required",
    });
  });

  it("validates newsletter sender slots", () => {
    const newsletter = normalizeNewsletterContent({
      ...DEFAULT_NEWSLETTER_CONTENT,
      sender_email: "bad",
    });

    expect(validateNewsletterContent(newsletter)).toEqual({
      ok: false,
      error: "Sender email is invalid",
    });
  });

  it("validates newsletter archive cta slots", () => {
    const newsletter = normalizeNewsletterContent({
      ...DEFAULT_NEWSLETTER_CONTENT,
      archive_label: " archive ",
      archive_copy: " published notes ",
      archive_link_label: " read ",
      archive_url: "javascript:alert(1)",
    });

    expect(newsletter.archive_label).toBe("archive");
    expect(validateNewsletterContent(newsletter)).toEqual({
      ok: false,
      error: "Newsletter archive URL is invalid",
    });
  });

  it("normalizes listing page content with fallback fields", () => {
    const listing = normalizeListingPageContent({
      ...DEFAULT_WRITING_INDEX_CONTENT,
      hero_summary: 42,
      search_placeholder: " find posts ",
    });

    expect(listing.hero_summary).toBe(
      DEFAULT_WRITING_INDEX_CONTENT.hero_summary,
    );
    expect(listing.search_placeholder).toBe("find posts");
    expect(validateListingPageContent(listing)).toEqual({ ok: true });
  });

  it("normalizes listing page content with a route-specific fallback", () => {
    const listing = normalizeListingPageContent(
      {
        title: " projects ",
        hero_title: "",
        hero_summary: null,
      },
      DEFAULT_MAKING_INDEX_CONTENT,
    );

    expect(listing.title).toBe("projects");
    expect(listing.description).toBe(DEFAULT_MAKING_INDEX_CONTENT.description);
    expect(listing.search_placeholder).toBe("");
    expect(listing.buckets).toEqual(DEFAULT_MAKING_INDEX_CONTENT.buckets);
    expect(validateListingPageContent(listing)).toEqual({
      ok: false,
      error: "Listing page hero title is required",
    });
  });

  it("normalizes listing page bucket copy", () => {
    const listing = normalizeListingPageContent(
      {
        ...DEFAULT_MAKING_INDEX_CONTENT,
        buckets: [
          {
            id: " Active Work ",
            label: " active ",
            note: " maintained ",
          },
          {
            id: "../bad",
            label: "",
            note: "dropped",
          },
        ],
      },
      DEFAULT_MAKING_INDEX_CONTENT,
    );

    expect(listing.buckets).toEqual([
      {
        id: "active-work",
        label: "active",
        note: "maintained",
      },
    ]);
    expect(validateListingPageContent(listing)).toEqual({ ok: true });
  });

  it("falls back when listing page bucket copy is malformed", () => {
    const listing = normalizeListingPageContent(
      {
        ...DEFAULT_MAKING_INDEX_CONTENT,
        buckets: [{ id: "", label: "", note: "" }],
      },
      DEFAULT_MAKING_INDEX_CONTENT,
    );

    expect(listing.buckets).toEqual(DEFAULT_MAKING_INDEX_CONTENT.buckets);
    expect(validateListingPageContent(listing)).toEqual({ ok: true });
  });

  it("validates listing page hero links", () => {
    const listing = normalizeListingPageContent(
      {
        ...DEFAULT_PROJECTS_INDEX_CONTENT,
        hero_link_href: "javascript:alert(1)",
      },
      DEFAULT_PROJECTS_INDEX_CONTENT,
    );

    expect(listing.hero_link_label).toBe("/making");
    expect(validateListingPageContent(listing)).toEqual({
      ok: false,
      error: "Listing page hero link must start with /, https://, or mailto:",
    });
  });

  it("validates newsletter archive listing content", () => {
    const listing = normalizeListingPageContent(
      {
        ...DEFAULT_NEWSLETTER_ARCHIVE_CONTENT,
        section_label: " archive ",
      },
      DEFAULT_NEWSLETTER_ARCHIVE_CONTENT,
    );

    expect(listing.section_label).toBe("archive");
    expect(validateListingPageContent(listing)).toEqual({ ok: true });
  });

  it("validates orchestrating page content", () => {
    const content = normalizeOrchestratingPageContent({
      ...DEFAULT_ORCHESTRATING_CONTENT,
      section_label: " orchestrating ",
      panel_copy: " live local stats ",
    });

    expect(content.section_label).toBe("orchestrating");
    expect(content.panel_copy).toBe("live local stats");
    expect(validateOrchestratingPageContent(content)).toEqual({ ok: true });
  });

  it("rejects empty orchestrating panel copy", () => {
    const content = normalizeOrchestratingPageContent({
      ...DEFAULT_ORCHESTRATING_CONTENT,
      panel_copy: "",
    });

    expect(validateOrchestratingPageContent(content)).toEqual({
      ok: false,
      error: "Orchestrating panel copy is required",
    });
  });
});
