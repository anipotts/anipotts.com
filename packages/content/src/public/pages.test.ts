import { describe, expect, it } from "vitest";
import { homepageSchema, systemsPageSchema } from "./pages";
import { validateContentReferences } from "./references";

describe("direct Markdown validation", () => {
  it("rejects a missing required page field and unknown provider", () => {
    expect(homepageSchema.safeParse({}).success).toBe(false);
    const page = {
      title: "systems",
      description: "description",
      hero_title: "systems",
      hero_summary: "summary",
      workflow: {
        intro: "intro",
        sources: ["gmail"],
        feedback: "feedback",
        steps: Array.from({ length: 4 }, (_, i) => ({
          id: `${i}`,
          label: "label",
          detail: "detail",
          marks: ["github"],
        })),
      },
    };
    expect(systemsPageSchema.safeParse(page).success).toBe(true);
    page.workflow.sources = ["unapproved-provider"];
    expect(systemsPageSchema.safeParse(page).success).toBe(false);
    page.workflow.sources = ["gmail"];
    page.workflow.steps[0]!.marks = ["unapproved-provider"];
    expect(systemsPageSchema.safeParse(page).success).toBe(false);
  });

  it("rejects duplicate route slugs even when the file IDs differ", () => {
    expect(() =>
      validateContentReferences(
        [
          { id: "one", data: { slug: "same" } },
          { id: "two", data: { slug: "same" } },
        ],
        [],
        [],
      ),
    ).toThrow("Duplicate project slug");
    expect(() =>
      validateContentReferences(
        [],
        [
          { id: "one", data: { slug: "same" } },
          { id: "two", data: { slug: "same" } },
        ],
        [],
      ),
    ).toThrow("Duplicate writing slug");
  });

  it("rejects missing project references and unpublished homepage selections", () => {
    expect(() =>
      validateContentReferences(
        [],
        [{ id: "essay", data: { project: "missing" } }],
        [],
      ),
    ).toThrow("Unknown project reference");
    for (const status of ["draft", "scheduled"]) {
      expect(() =>
        validateContentReferences(
          [],
          [{ id: "essay", data: { status } }],
          ["essay"],
        ),
      ).toThrow("missing or unpublished");
    }
    expect(() =>
      validateContentReferences(
        [{ id: "project", data: {} }],
        [{ id: "essay", data: { status: "published", project: "project" } }],
        ["essay"],
      ),
    ).not.toThrow();
  });
});
