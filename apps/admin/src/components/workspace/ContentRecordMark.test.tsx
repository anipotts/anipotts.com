import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentRecordMark } from "./ContentRecordMark";
import { projectMark } from "@anipotts/brand/project-marks";

describe("project identity", () => {
  it("uses the same cached local identity in libraries and catalog links", () => {
    const direct = renderToStaticMarkup(
      <ContentRecordMark
        record={{
          id: "structured-ai",
          href: "/content/projects/structured-ai",
        }}
      />,
    );
    const catalog = renderToStaticMarkup(
      <ContentRecordMark
        record={{ href: "/content/projects/structured-ai?view=review" }}
      />,
    );
    expect(catalog).toBe(direct);
    expect(direct).toContain("structured-ai-favicon.png");
    expect(direct).toContain('loading="lazy"');
    expect(direct).toContain('aria-hidden="true"');
    expect(direct).not.toContain("https://");
  });
  it("retains a usable glyph when no owned project asset exists", () => {
    expect(projectMark("toString")).toBeNull();
    expect(projectMark(undefined)).toBeNull();
    const fallback = renderToStaticMarkup(
      <ContentRecordMark
        record={{ id: "new-project", href: "/content/projects/new-project" }}
      />,
    );
    expect(fallback).toContain("<svg");
    expect(fallback).not.toContain("<img");
  });
});
