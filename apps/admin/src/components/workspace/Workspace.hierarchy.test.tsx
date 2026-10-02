// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordHeader } from "./RecordHeader";
import { RecordDetails } from "./Workspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function markup(node: React.ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(node);
  return host;
}

describe("shared action and record hierarchy", () => {
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
