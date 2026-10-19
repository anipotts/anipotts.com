import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminSkeleton, EditorLoadingBoundary } from "./AdminFeedback";
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
  it("keeps the editor route's single announcement outside its silent visual fallback", () => {
    const fields = editorialFields({ kind: "writing", id: "post" });
    const html = renderToStaticMarkup(
      <EditorLoadingBoundary>
        <AdminSkeleton fields={fields} announce={false} />
      </EditorLoadingBoundary>,
    );
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html.match(/Loading editor…/g)).toHaveLength(1);
    expect(html).toContain('data-loading-region="body"');
    const silent = renderToStaticMarkup(
      <AdminSkeleton fields={fields} announce={false} />,
    );
    expect(silent).not.toContain('role="status"');
    expect(silent).not.toContain("Loading editor");
    expect(silent).toContain('data-loading-region="body"');
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
