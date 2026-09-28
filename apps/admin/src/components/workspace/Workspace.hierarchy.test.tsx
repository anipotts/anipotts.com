// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorActionBar } from "../astryx/EditorActionBar";
import { RecordHeader } from "./RecordHeader";
import { RecordDetails, WorkspacePage } from "./Workspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function markup(node: React.ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(node);
  return host;
}

describe("shared action and record hierarchy", () => {
  it("keeps one labelled primary step beside the page title and utilities", () => {
    const host = markup(
      <WorkspacePage
        title="Writing"
        primaryAction={{ label: "New article", href: "/content/new" }}
        actions={<button>Lock session</button>}
      />,
    );
    const primary = host.querySelectorAll('[data-variant="primary"]');
    expect(primary).toHaveLength(1);
    expect(primary[0]?.textContent).toContain("New article");
    expect(primary[0]?.getAttribute("href")).toBe("/content/new");
    expect(
      primary[0]?.closest(".workspace-page-line")?.querySelector("h1")
        ?.textContent,
    ).toBe("Writing");
  });

  it("gives a read-only page no implied mutation action", () => {
    const host = markup(<WorkspacePage title="Records" />);
    expect(host.querySelector('[data-variant="primary"]')).toBeNull();
  });

  it("preserves editor navigation, save state, preview and the reviewed next step", () => {
    const host = markup(
      <EditorActionBar
        title="Field notes"
        back={{ href: "/content/writing?q=notes", label: "Back to Writing" }}
        save="saved-privately"
        preview={{ isPressed: false, onChange: () => {} }}
        publish={{ label: "Review changes", onClick: () => {} }}
      />,
    );
    expect(host.querySelector(".workspace-record-header h1")?.textContent).toBe(
      "Field notes",
    );
    expect(
      host
        .querySelector('[aria-label="Back to Writing"]')
        ?.getAttribute("href"),
    ).toBe("/content/writing?q=notes");
    expect(host.querySelector('[aria-label="Preview"]')).not.toBeNull();
    expect(
      host.querySelector('[data-variant="primary"]')?.textContent,
    ).toContain("Review changes");
    expect(
      host.querySelector('[aria-label="Draft save status"]')?.textContent,
    ).toContain("Saved privately");
    expect(host.textContent).not.toContain("Verified");
  });

  it("uses a page or panel heading without losing the full record name", () => {
    const host = markup(
      <RecordHeader
        title="A long record name"
        level={2}
        titleContent="A long record"
        actions={<button>Close record</button>}
      />,
    );
    expect(host.querySelector("h1")).toBeNull();
    expect(host.querySelector("h2 [title]")?.getAttribute("title")).toBe(
      "A long record name",
    );
    expect(host.querySelector("button")?.textContent).toBe("Close record");
  });

  it("keeps missing essential evidence explicit without empty optional controls", () => {
    const host = markup(
      <RecordDetails
        summary={[["Observed", "Not recorded"]]}
        details={[
          ["Owner", null],
          ["URL", ""],
        ]}
      />,
    );
    expect(host.textContent).toContain("Not recorded");
    expect(host.querySelector("button")).toBeNull();
  });

  it("expands optional details without hiding essential facts", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(() =>
      root.render(
        <RecordDetails
          summary={[["Observed", "Not recorded"]]}
          details={[["Schedule", "Every hour"]]}
        />,
      ),
    );
    try {
      const button = host.querySelector<HTMLButtonElement>(
        "button[aria-expanded]",
      )!;
      expect(button.textContent).toContain("All details");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      const essentials = host.querySelector('[aria-label="Details"]')!;
      expect(essentials.closest(".astryx-collapsible")).toBeNull();
      await act(() => button.click());
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(host.textContent).toContain("Every hour");
      expect(essentials.textContent).toContain("Not recorded");
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});
