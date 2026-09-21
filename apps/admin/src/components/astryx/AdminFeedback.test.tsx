import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminSkeleton } from "./AdminFeedback";
import { editorialFields } from "../../lib/editorial-fields";

describe("loading feedback", () => {
  it("reserves the actual writing fields and body without interactive fake controls", () => {
    const html = renderToStaticMarkup(
      <AdminSkeleton
        fields={editorialFields({ kind: "writing", id: "post" })}
      />,
    );
    expect(html).toContain('data-loading-region="body"');
    expect(html).toContain('aria-label="Loading editor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<(button|input|textarea)\b/);
  });
  it("does not invent an article body for structured page editors", () => {
    const html = renderToStaticMarkup(
      <AdminSkeleton fields={editorialFields({ kind: "page", id: "home" })} />,
    );
    expect(html).not.toContain('data-loading-region="body"');
  });
  it.each([
    ["history", "history"],
    ["records", "records"],
    ["record", "record details"],
    ["preview", "preview"],
  ] as const)("announces %s accurately once", (kind, label) => {
    const html = renderToStaticMarkup(<AdminSkeleton kind={kind} />);
    expect(html).toContain(`aria-label="Loading ${label}"`);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).not.toContain("Loading editor");
  });
});
