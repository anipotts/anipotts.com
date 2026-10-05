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
    expect(direct).toContain(
      "background-color:var(--color-project-artwork-plate)",
    );
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
    expect(fallback).toContain("brand-tile");
    expect(fallback).not.toContain("<img");
  });
});

it("retains responsive palette sizing for mapped and fallback projects", () => {
  for (const id of ["structured-ai", "new-project"]) {
    const html = renderToStaticMarkup(
      <ContentRecordMark
        record={{ id, href: `/content/projects/${id}` }}
        className="admin-palette-tile"
      />,
    );
    expect(html).toContain("brand-tile admin-palette-tile");
  }
});

it("uses the saved project logo ahead of a slug mapping and resolves private media", () => {
  const logo = "/images/brand/chainedchat-logo.png";
  const html = renderToStaticMarkup(
    <ContentRecordMark
      record={{
        id: "chainedchat",
        href: "/content/projects/chainedchat",
        projectIdentity: { logo_src: logo, logo_tone: "adaptive" },
      }}
    />,
  );
  expect(html).toContain("chainedchat-logo.png");
  expect(html).not.toContain("https://anipotts.com");
  expect(html).toContain('data-artwork-tone="adaptive"');
  expect(html).toContain("background-color:var(--color-background-surface)");
  expect(html).not.toContain("chainedchat-favicon");
  const id = "a".repeat(64) + ".png";
  const privateHtml = renderToStaticMarkup(
    <ContentRecordMark
      record={{
        href: "/content/projects/chainedchat",
        projectIdentity: { logo_src: `/images/editorial/${id}` },
      }}
    />,
  );
  expect(privateHtml).toContain(`/api/editorial/media?id=${id}`);
});

it("honors a removed logo and rejects invalid paths instead of restoring a stale brand asset", () => {
  for (const identity of [{}, { logo_src: "javascript:alert(1)" }]) {
    const html = renderToStaticMarkup(
      <ContentRecordMark
        record={{
          id: "chainedchat",
          href: "/content/projects/chainedchat",
          projectIdentity: identity,
        }}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("<svg");
  }
  expect(projectMark("chainedchat")).toContain("chainedchat-logo.png");
});

it("resolves other saved public assets against the worktree origin, while private previews stay relative", () => {
  const siteUrl = "http://127.0.0.1:4500/";
  const html = renderToStaticMarkup(
    <ContentRecordMark
      siteUrl={siteUrl}
      record={{
        href: "/content/projects/demo",
        projectIdentity: { logo_src: "/images/custom-logo.png" },
      }}
    />,
  );
  expect(html).toContain('src="http://127.0.0.1:4500/images/custom-logo.png"');
  const id = "b".repeat(64) + ".png";
  const privateHtml = renderToStaticMarkup(
    <ContentRecordMark
      siteUrl={siteUrl}
      record={{
        href: "/content/projects/demo",
        projectIdentity: { logo_src: `/images/editorial/${id}` },
      }}
    />,
  );
  expect(privateHtml).toContain(`/api/editorial/media?id=${id}`);
  expect(privateHtml).not.toContain("http://127.0.0.1:4500");
});
