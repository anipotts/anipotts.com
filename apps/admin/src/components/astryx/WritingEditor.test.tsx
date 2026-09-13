import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WritingEditor } from "./WritingEditor";
import type { ContentEditorState } from "../../lib/content-editor";

const state: ContentEditorState = {
  page_key: "writing:retained",
  current_version: 2,
  latest_draft: null,
  current: {
    kind: "writing",
    page_key: "writing:retained",
    title: "my original title",
    slug: "retained",
    summary: "original summary",
    tags: ["Original"],
    body: "## original Markdown\n\n<script>not executable</script>",
    visibility: "published",
    date: "2026-07-01",
    updated_by: "owner",
    updated_at: "2026-07-01T00:00:00Z",
    content: {},
  },
  revisions: [
    {
      id: "retained-1",
      source: "draft",
      timestamp: "2026-07-01T00:00:00Z",
      author: "owner",
      status: "draft",
      summary: "original revision",
      rollback_target: "retained:v1",
      view_href: "/content/preview?operation_id=retained-1",
    },
  ],
};
function render(isNew = false, revisions = state.revisions) {
  return renderToStaticMarkup(
    <WritingEditor
      currentPublicRoute="/writing/retained"
      currentRollbackReference="retained:v2"
      editorState={{ ...state, revisions }}
      isNew={isNew}
      pageMode="ready"
      pageSummary="source summary"
      sourceFieldCount={5}
    />,
  );
}
describe("legacy content diagnostics", () => {
  it("preserves source and history without offering edits or publication", () => {
    const html = render();
    expect(html).toContain("Legacy content diagnostics");
    expect(html).toContain("my original title");
    expect(html).toContain("## original Markdown");
    expect(html).toContain("&lt;script&gt;not executable&lt;/script&gt;");
    expect(html).toContain('href="/content/preview?operation_id=retained-1"');
    expect(html).toContain('href="/content"');
    expect(html).not.toMatch(/<(input|textarea|select|form)\b/);
    expect(html).not.toMatch(
      /save draft|confirm publish|publish selected draft/i,
    );
  });
  it("does not present the legacy new route as a creation workflow", () => {
    const html = render(true, []);
    expect(html).toContain("No legacy record selected");
    expect(html).toContain("No retained revisions");
    expect(html).not.toContain("my original title");
    expect(html).not.toMatch(/create|save draft|publish selected draft/i);
  });
});
