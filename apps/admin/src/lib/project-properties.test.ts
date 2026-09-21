import { describe, expect, it } from "vitest";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { projectSchema } from "@anipotts/content/public/schema";
import { setProjectLink } from "./project-properties";

describe("project links", () => {
  const source =
    "---\r\ntitle: Sample # keep\r\nlink_live: https://example.com\r\ncustom: preserved\r\n---\r\nOriginal body.\r\n";
  it("clears an optional link without losing source comments, unknown fields or body", () => {
    const next = setProjectLink(source, "link_live", " ");
    const parsed = parseEditorialSource(next);
    expect(parsed.data).not.toHaveProperty("link_live");
    expect(parsed.data).toHaveProperty("custom", "preserved");
    expect(next).toContain("# keep");
    expect(parsed.body).toBe(parseEditorialSource(source).body);
    expect(parsed.newline).toBe("\r\n");
    expect(setProjectLink(next, "link_live", "")).toBe(next);
  });
  it("preserves invalid input for correction while the canonical validator rejects it", () => {
    const next = setProjectLink(source, "link_repo", "javascript:alert(1)");
    const data = parseEditorialSource(next).data as Record<string, unknown>;
    expect(data.link_repo).toBe("javascript:alert(1)");
    expect(
      projectSchema.shape.link_repo.safeParse(data.link_repo).success,
    ).toBe(false);
  });
});
