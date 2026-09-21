import { describe, expect, it } from "vitest";
import { projectSchema, publicSlugSchema, writingSchema } from "./schema";
import { isPublicProject, isPublishedWriting } from "./visibility";

describe("canonical public boundaries", () => {
  it("rejects unsafe route segments", () => {
    for (const slug of [
      "../hidden",
      "two/segments",
      "draft?show=1",
      "",
      "UPPER",
    ]) {
      expect(publicSlugSchema.safeParse(slug).success).toBe(false);
    }
    expect(publicSlugSchema.parse("coding-agent-tips")).toBe(
      "coding-agent-tips",
    );
  });

  it("fails closed for unknown publication states", () => {
    for (const public_state of ["hidden", "draft", "unknown", undefined]) {
      expect(isPublicProject({ public_state })).toBe(false);
    }
    for (const status of ["draft", "scheduled", "unknown", undefined]) {
      expect(isPublishedWriting({ status })).toBe(false);
    }
    expect(isPublicProject({ public_state: "listed" })).toBe(true);
    expect(isPublicProject({ public_state: "featured" })).toBe(true);
    expect(isPublishedWriting({ status: "published" })).toBe(true);
  });

  it("keeps an opening optional and distinct from the listing subtitle", () => {
    const draft = { title: "test", summary: "a test", status: "draft" };
    expect(writingSchema.parse(draft)).not.toHaveProperty("opening");
    const opening = "Fixing a small bug made me rethink how I approach this.";
    expect(writingSchema.parse({ ...draft, opening })).toMatchObject({
      summary: "a test",
      opening,
    });
    expect(
      writingSchema.safeParse({ ...draft, opening: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(writingSchema.safeParse({ ...draft, opening: 42 }).success).toBe(
      false,
    );
  });

  it("requires an actual publication date", () => {
    const draft = { title: "test", summary: "a test", status: "draft" };
    expect(writingSchema.safeParse(draft).success).toBe(true);
    expect(
      writingSchema.safeParse({ ...draft, status: "published" }).success,
    ).toBe(false);
    expect(
      writingSchema.safeParse({
        ...draft,
        status: "published",
        published_at: "2026-09-08",
      }).success,
    ).toBe(true);
  });

  it("normalizes old paths and placement only at the schema boundary", () => {
    expect(projectSchema.shape.detail_path.parse("/projects/a-project")).toBe(
      "/work/a-project",
    );
    expect(projectSchema.shape.homepage_placement.parse("making")).toBe("work");
    expect(projectSchema.shape.public_state.safeParse("unknown").success).toBe(
      false,
    );
  });
});
