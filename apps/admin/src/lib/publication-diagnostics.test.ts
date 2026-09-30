import { describe, expect, it } from "vitest";
import {
  publicationIssues,
  publicationIssueMessage,
  publicationRefusal,
} from "./publication-diagnostics";

describe("bounded publication diagnostics", () => {
  const issue = {
    record: { kind: "writing" as const, id: "synthetic" },
    field: "project",
    code: "unknown_project_reference",
  };
  it("accepts only safe identities, paths and known codes without authored values", () => {
    expect(
      publicationIssues([
        { ...issue, source: "private source", message: "raw provider error" },
        { ...issue, field: "https://private.invalid/?secret" },
        { ...issue, code: "private source" },
        { ...issue, record: { kind: "writing" as const, id: "../../private" } },
      ]),
    ).toEqual([issue]);
    expect(
      publicationIssues(Array.from({ length: 1000 }, () => issue)),
    ).toHaveLength(20);
    expect(publicationIssues(null)).toEqual([]);
  });
  it("gives a precise dependency remedy and keeps validation failures distinct from unsupported actions", () => {
    expect(publicationIssueMessage(issue)).toContain("existing project");
    expect(publicationRefusal("unsupported_slug_change")).toContain(
      "restore the published address",
    );
    expect(publicationRefusal("preflight_unavailable")).toContain(
      "private draft is retained",
    );
    expect(publicationRefusal("raw provider error")).toBeNull();
  });
});
