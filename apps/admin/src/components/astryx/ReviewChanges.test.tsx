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
  it("renders links and formatting while retaining their changed destinations", () => {
    const doc = review(
      "**[old](https://before.example/)**",
      "*[new](https://after.example/)*",
    );
    expect(
      doc.querySelector('[data-side="before"] strong a')?.getAttribute("href"),
    ).toBe("https://before.example/");
    expect(doc.querySelector('[data-side="after"] em a')?.textContent).toBe(
      "new",
    );
    expect(doc.body.textContent).not.toContain("https://after.example/");
  });
  it("renders image replacements and rejects executable author HTML", () => {
    const doc = review(
      "![old](/images/old.png)",
      '![new](/images/new.png) <script>alert("x")</script> ![bad](javascript:alert)',
    );
    expect(
      doc.querySelector('[data-side="before"] img')?.getAttribute("src"),
    ).toBe("/images/old.png");
    expect(
      doc.querySelector('[data-side="after"] img')?.getAttribute("src"),
    ).toBe("/images/new.png");
    expect(doc.querySelector("script, [src^='javascript:']")).toBeNull();
  });
  it("shows page sections in complete before/after order", () => {
    const sections = {
      intro: {
        label: "Intro",
        subheading: "![logo](/images/brand/logo.svg) hello",
      },
      work: {
        label: "Work",
        writing_slugs: ["first-article", "second-article"],
      },
    };
    const html = renderToStaticMarkup(
      <ReviewChanges
        destination="anipotts.com/"
        before="old"
        after="new"
        changes={[
          {
            label: "Page sections",
            presentation: true,
            before: JSON.stringify({ sections, order: ["intro", "work"] }),
            after: JSON.stringify({ sections, order: ["work", "intro"] }),
          },
        ]}
      />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(
      Array.from(
        doc.querySelectorAll('[data-side="before"] h3'),
        (e) => e.textContent,
      ),
    ).toEqual(["Intro", "Work"]);
    expect(
      Array.from(
        doc.querySelectorAll('[data-side="after"] h3'),
        (e) => e.textContent,
      ),
    ).toEqual(["Work", "Intro"]);
    expect(doc.querySelector('[data-side="after"] img')).not.toBeNull();
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
  // Tooltips on the icon toggle read the pointer type.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
    })),
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
      (node) =>
        node.textContent === label || node.getAttribute("aria-label") === label,
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
  // The Code toggle is one pressed/unpressed control, not two labels.
  expect(button("Source diff").getAttribute("aria-pressed")).toBe("true");
  await act(async () => button("Source diff").click());
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
    Array.from(tools.querySelectorAll("button"), (button) =>
      button.getAttribute("aria-label"),
    ),
  ).toContain("Source diff");
  expect(tools.querySelector(".editor-diff-legend")).toBeNull();
  expect(region.querySelector("[aria-expanded]")).toBeNull();
  expect(region.querySelector('[data-kind="removed"]')).not.toBeNull();
  expect(region.querySelector('[data-kind="added"]')).not.toBeNull();
});

it("names itself from its sheet and shows its tools only for a diff", () => {
  const html = renderToStaticMarkup(
    <ReviewChanges
      label="Review changes"
      destination="anipotts.com/"
      before="same"
      after="same"
      changes={[{ label: "Title", before: "Same", after: "Same" }]}
    />,
  );
  expect(html).toContain('aria-label="Review changes"');
  expect(html).not.toContain("<h2");
  expect(html).not.toContain("Diff legend");
  expect(html).not.toContain("Diff layout");
  expect(html).toContain("No changes");
});

it("offers direct editing only for fields with a supported edit action", async () => {
  const edit = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ReviewChanges
        destination="anipotts.com/writing/test"
        before="before"
        after="after"
        changes={[
          { label: "Subtitle", before: "before", after: "after", onEdit: edit },
          { label: "Historical source", before: "old", after: "new" },
        ]}
      />,
    ),
  );
  const button = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Edit Subtitle"]',
  );
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  expect(edit).toHaveBeenCalledOnce();
  expect(
    host.querySelector('button[aria-label="Edit Historical source"]'),
  ).toBeNull();
});

it("keeps source-only formatting markers out of the default rendered review", () => {
  const html = renderToStaticMarkup(
    <ReviewChanges
      destination="anipotts.com/"
      before="old"
      after="subheading_format: markdown"
      changes={[]}
    />,
  );
  expect(html).not.toContain("subheading_format");
  expect(html).toContain("Source diff");
});
