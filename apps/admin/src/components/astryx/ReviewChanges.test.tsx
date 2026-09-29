// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewChanges } from "./ReviewChanges";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement | undefined;
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

function review(before: string, after: string, rich = true) {
  const html = renderToStaticMarkup(
    <ReviewChanges
      destination="anipotts.com/"
      before={before}
      after={after}
      changes={[{ label: "Subtitle", before, after, rich }]}
    />,
  );
  return new DOMParser().parseFromString(html, "text/html");
}
function sideText(doc: Document | Element, side: string) {
  return Array.from(
    doc.querySelectorAll(`[data-side="${side}"] .editor-diff-text`),
    (line) => line.textContent,
  ).join("\n");
}

describe("rich field review", () => {
  it("shows changed URL and changed wording in separate before/after rows", () => {
    const doc = review(
      "read [old copy](https://before.example/old)",
      "read [new copy](https://after.example/new)",
    );
    expect(doc.body.textContent).toContain("Formatting / links / images");
    expect(sideText(doc, "before")).toBe(
      "read [old copy](https://before.example/old)",
    );
    expect(sideText(doc, "after")).toBe(
      "read [new copy](https://after.example/new)",
    );
    expect(doc.querySelector('[data-side="before"] ins')).toBeNull();
    expect(doc.querySelector('[data-side="after"] del')).toBeNull();
  });
  it.each([
    [
      "old [link](https://same.example/)",
      "new [link](https://same.example/)",
      "old link",
      "new link",
    ],
    ["**old**", "**new**", "old", "new"],
    [
      "[old](https://same.example/)",
      "[new](https://same.example/)",
      "old",
      "new",
    ],
    [
      "**[old](https://same.example/)**",
      "**[new](https://same.example/)**",
      "old",
      "new",
    ],
  ])(
    "keeps descendant copy edits readable: %s",
    (before, after, plainBefore, plainAfter) => {
      const doc = review(before, after);
      expect(doc.body.textContent).not.toContain("Formatting / links / images");
      expect(doc.body.textContent).not.toContain("https://same.example/");
      expect(sideText(doc, "before")).toBe(plainBefore);
      expect(sideText(doc, "after")).toBe(plainAfter);
      expect(doc.querySelector("del")?.textContent).toBe("old");
      expect(doc.querySelector("ins")?.textContent).toBe("new");
    },
  );
  it.each([
    ["**old**", "*new*"],
    ["[old](https://before.example/)", "[new](https://after.example/)"],
    [
      "![old alt](/api/editorial/media/same)",
      "![new alt](/api/editorial/media/same)",
    ],
    ["**[old](https://same.example/)**", "[**new**](https://same.example/)"],
    ["**old** rest", "old **new**"],
  ])("retains mark and attribute changes: %s", (before, after) => {
    const doc = review(before, after);
    expect(doc.body.textContent).toContain("Formatting / links / images");
    expect(sideText(doc, "before")).toBe(before);
    expect(sideText(doc, "after")).toBe(after);
  });
  it("exposes image replacement without fetching or executing author content", () => {
    const before = "old ![photo](/api/editorial/media/original)";
    const after =
      'new ![photo](/api/editorial/media/cropped) <script>alert("x")</script>';
    const doc = review(before, after);
    expect(sideText(doc, "before")).toBe(before);
    expect(sideText(doc, "after")).toBe(after);
    expect(doc.querySelector("img,script")).toBeNull();
  });
  it("preserves whitespace alongside wording changes in rich fields", () => {
    const doc = review(" old  copy\t\nnext", " new copy \nnext");
    expect(sideText(doc, "before")).toBe(" old  copy\t\nnext");
    expect(sideText(doc, "after")).toBe(" new copy \nnext");
    expect(doc.body.textContent).toContain("Whitespace / source detail");
  });
  it("keeps all removals before additions in DOM order for unified/mobile review", () => {
    const doc = review("old one\nold two", "new one\nnew two", false);
    const rows = Array.from(doc.querySelectorAll(".editor-diff-line"));
    expect(rows.map((row) => row.getAttribute("data-kind"))).toEqual([
      "removed",
      "removed",
      "added",
      "added",
    ]);
    expect(
      doc.querySelector(".editor-revision-diff")?.getAttribute("data-layout"),
    ).toBe("split");
  });
});

it("switches layout/source and expands only unchanged context without losing edited lines", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const context = Array.from({ length: 12 }, (_, i) => `context ${i}\n`).join(
    "",
  );
  const before = `---\ntitle: Before\n---\n${context}old\n`;
  const after = `---\ntitle: After\n---\n${context}new\n`;
  await act(async () =>
    root!.render(
      <ReviewChanges
        destination="anipotts.com/"
        before={before}
        after={after}
        changes={[{ label: "Title", before: "Before", after: "After" }]}
      />,
    ),
  );
  const button = (label: string) =>
    Array.from(host!.querySelectorAll("button")).find(
      (node) => node.textContent === label,
    )!;
  await act(async () => button("Unified").click());
  expect(
    host.querySelector(".editor-revision-diff")?.getAttribute("data-layout"),
  ).toBe("unified");
  await act(async () => button("Source diff").click());
  expect(sideText(host, "before")).toContain("title: Before");
  expect(sideText(host, "after")).toContain("title: After");
  expect(sideText(host, "before")).toContain("old");
  expect(sideText(host, "after")).toContain("new");
  expect(sideText(host, "before")).not.toContain("context 5");
  await act(async () => button("Full context").click());
  expect(sideText(host, "before")).toBe(before.slice(0, -1));
  expect(sideText(host, "after")).toBe(after.slice(0, -1));
  await act(async () => button("Field changes").click());
  expect(sideText(host, "before")).toBe("Before");
  expect(sideText(host, "after")).toBe("After");
});

it("groups the review title with its legend and destination with view controls", () => {
  const doc = review("Before", "After", false);
  const region = doc.querySelector("section.editor-revision-diff")!;
  const title = region.querySelector("h2")!;
  expect(title.textContent).toBe("Review changes");
  expect(region.getAttribute("aria-labelledby")).toBe(title.id);
  expect(
    title.parentElement?.querySelector('[aria-label="Diff legend"]')
      ?.textContent,
  ).toBe("+ Added− Removed");
  expect(title.parentElement?.querySelector("button")).toBeNull();

  const tools = region.querySelector(".editor-diff-tools")!;
  expect(tools.querySelector(".editor-destination")?.textContent).toBe(
    "anipotts.com/1 field changed",
  );
  expect(tools.querySelector('[aria-label="Diff layout"]')).not.toBeNull();
  expect(
    Array.from(
      tools.querySelectorAll("button"),
      (button) => button.textContent,
    ),
  ).toContain("Source diff");
  expect(tools.querySelector(".editor-diff-legend")).toBeNull();
  expect(region.querySelector("[aria-expanded]")).toBeNull();
  expect(region.querySelector('[data-kind="removed"]')).not.toBeNull();
  expect(region.querySelector('[data-kind="added"]')).not.toBeNull();
});
