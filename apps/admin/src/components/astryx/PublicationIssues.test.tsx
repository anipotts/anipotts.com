// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PublicationIssues } from "./PublicationIssues";

it("links precise safe diagnostics to the existing editor routes", () => {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <PublicationIssues
        issues={[
          {
            record: { kind: "page", id: "home" },
            field: "sections.latest_thoughts.writing_slugs.0",
            code: "featured_writing_unavailable",
          },
          {
            record: { kind: "work", id: "synthetic" },
            field: "slug",
            code: "duplicate_slug",
          },
          {
            record: { kind: "writing", id: "synthetic" },
            field: "project",
            code: "unknown_project_reference",
          },
          { record: null, field: "", code: "provider error with private text" },
        ]}
      />,
    ),
    "text/html",
  );
  expect(
    [...doc.querySelectorAll("a")].map((el) => el.getAttribute("href")),
  ).toEqual([
    "/content/home/home",
    "/content/projects/synthetic",
    "/content/writing/synthetic",
  ]);
  expect(doc.body.textContent).toContain("Writing selection 1");
  expect(doc.body.textContent).toContain("publish the selected article first");
  expect(doc.body.textContent).not.toContain("private text");
});
