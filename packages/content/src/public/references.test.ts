import { describe, expect, it } from "vitest";
import {
  contentReferenceIssues,
  validateContentReferences,
} from "./references";

describe("structured content references", () => {
  it("identifies every owner of a colliding route and the exact referencing fields", () => {
    expect(
      contentReferenceIssues(
        [
          { id: "one", data: { slug: "same" } },
          { id: "two", data: { slug: "same" } },
        ],
        [{ id: "essay", data: { project: "missing", status: "draft" } }],
        ["essay", "missing-writing"],
      ),
    ).toEqual([
      {
        collection: "project",
        id: "one",
        field: "slug",
        code: "duplicate_slug",
      },
      {
        collection: "project",
        id: "two",
        field: "slug",
        code: "duplicate_slug",
      },
      {
        collection: "writing",
        id: "essay",
        field: "project",
        code: "unknown_project_reference",
      },
      {
        collection: "home",
        id: "home",
        field: "sections.latest_thoughts.writing_slugs.0",
        code: "featured_writing_unavailable",
      },
      {
        collection: "home",
        id: "home",
        field: "sections.latest_thoughts.writing_slugs.1",
        code: "featured_writing_unavailable",
      },
    ]);
  });

  it("bounds diagnostic output while retaining the throwing validation contract", () => {
    const writing = Array.from({ length: 150 }, (_, index) => ({
      id: `essay-${index}`,
      data: { project: "missing" },
    }));
    expect(contentReferenceIssues([], writing, [])).toHaveLength(100);
    expect(() => validateContentReferences([], writing, [])).toThrow(
      "Unknown project reference",
    );
  });

  it("reports malformed slugs safely and accepts published references", () => {
    expect(
      contentReferenceIssues(
        [{ id: "project", data: { slug: "bad/route" } }],
        [],
        [],
      ),
    ).toEqual([
      {
        collection: "project",
        id: "project",
        field: "slug",
        code: "invalid_slug",
      },
    ]);
    expect(
      contentReferenceIssues(
        [{ id: "project", data: {} }],
        [{ id: "essay", data: { status: "published", project: "project" } }],
        ["essay"],
      ),
    ).toEqual([]);
  });
});
