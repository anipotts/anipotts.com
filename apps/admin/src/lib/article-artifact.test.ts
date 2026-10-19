import { describe, expect, it } from "vitest";
import {
  parseEditorialSource,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import { setArticleArtifactField } from "./article-artifact";

const source =
  "---\r\ntitle: Sample # keep\r\nsummary: Summary\r\nstatus: draft\r\ncustom: preserved\r\n---\r\nOriginal body.\r\n";
const record = { kind: "writing", id: "sample" } as const;

describe("article artifact properties", () => {
  it("leaves absent optional fields untouched and preserves unrelated YAML and body", () => {
    for (const field of [
      "artifact_url",
      "artifact_label",
      "artifact_type",
    ] as const)
      expect(setArticleArtifactField(source, field, " ")).toBe(source);
    const next = setArticleArtifactField(
      source,
      "artifact_url",
      " /work/example ",
    );
    const parsed = parseEditorialSource(next);
    expect(parsed.data).toMatchObject({
      artifact_url: "/work/example",
      custom: "preserved",
    });
    expect(next).toContain("# keep");
    expect(parsed.body).toBe(parseEditorialSource(source).body);
    expect(parsed.newline).toBe("\r\n");
    expect(validateEditorialSource(record, next).success).toBe(true);
    expect(setArticleArtifactField(next, "artifact_url", "/work/example")).toBe(
      next,
    );
  });

  it("clears each optional value independently without leaving YAML null or invalid empty fields", () => {
    let next = source;
    for (const [field, value] of [
      ["artifact_url", "https://example.com"],
      ["artifact_label", "Read the source"],
      ["artifact_type", "repo"],
    ] as const)
      next = setArticleArtifactField(next, field, value);
    next = setArticleArtifactField(next, "artifact_url", "");
    expect(parseEditorialSource(next).data).toMatchObject({
      artifact_label: "Read the source",
      artifact_type: "repo",
    });
    for (const field of [
      "artifact_url",
      "artifact_label",
      "artifact_type",
    ] as const)
      next = setArticleArtifactField(next, field, "");
    const data = parseEditorialSource(next).data;
    expect(data).not.toHaveProperty("artifact_url");
    expect(data).not.toHaveProperty("artifact_label");
    expect(data).not.toHaveProperty("artifact_type");
    expect(validateEditorialSource(record, next).success).toBe(true);
    expect(parseEditorialSource(next).body).toBe(
      parseEditorialSource(source).body,
    );
    expect(next).toContain("# keep");
  });

  it("keeps spaces while typing a multi-word link label", () => {
    const next = setArticleArtifactField(source, "artifact_label", "Read ");
    expect(parseEditorialSource(next).data).toHaveProperty(
      "artifact_label",
      "Read ",
    );
  });

  it("retains invalid drafts for correction while canonical publication validation rejects them", () => {
    for (const [field, value] of [
      ["artifact_url", "javascript:alert(1)"],
      ["artifact_label", "x".repeat(81)],
      ["artifact_type", "unknown"],
    ] as const) {
      const next = setArticleArtifactField(source, field, value);
      expect(parseEditorialSource(next).data).toHaveProperty(field, value);
      expect(validateEditorialSource(record, next).success).toBe(false);
    }
  });
});
