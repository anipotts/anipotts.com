// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorialRecord } from "@anipotts/content/editorial/source";
import { HomeEditor } from "./HomeEditor";
import { newWritingSource } from "../../lib/writing-draft";

vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
vi.mock("./SavedArticlePreview", () => ({
  SavedArticlePreview: () => <p>Preview</p>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const workSource = `---
title: Synthetic project
subtitle: A synthetic subtitle
description: A synthetic description.
year: "2026"
category: ai
role: Builder
duration: 2026
status: active
kind: project
card_copy: A synthetic card
---
`;
let root: Root;
let host: HTMLDivElement;
function snapshot(source: string) {
  const draft = {
    key: "synthetic",
    source,
    revision: 1,
    updatedAt: 1,
    discardedAt: null,
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  };
  return {
    base: { source, baseCommit: draft.baseCommit, baseFileHash: null },
    draft,
    history: [draft],
    publication: null,
    publishing: "not_configured",
  };
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  [
    "writing",
    { kind: "writing", id: "test" },
    `${newWritingSource("Synthetic title").replace('summary: ""', 'summary: "Synthetic summary"')}Synthetic body.`,
    ["Subtitle"],
  ],
  [
    "work",
    { kind: "work", id: "test" },
    workSource,
    ["Subtitle", "Card copy", "Description"],
  ],
] as [string, EditorialRecord, string, string[]][])(
  "the %s record editor never references an empty description",
  async (_kind, record, source, rich) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/csrf")
          ? new Response(JSON.stringify({ csrf: "test-only" }))
          : new Response(JSON.stringify(snapshot(source))),
      ),
    );
    window.history.replaceState(null, "", `/content/${record.kind}/test`);
    await act(async () => {
      root.render(<HomeEditor record={record} />);
    });
    await act(async () => {
      await vi.waitFor(
        () =>
          expect(
            rich.map((label) =>
              host.querySelector(
                `[contenteditable][role="textbox"][aria-label="${label}"]`,
              ),
            ),
          ).not.toContain(null),
        { timeout: 2000 },
      );
    });
    const empty = [...host.querySelectorAll("[aria-describedby]")].filter(
      (element) => !element.getAttribute("aria-describedby")?.trim(),
    );
    expect(empty.map((element) => element.outerHTML.slice(0, 120))).toEqual([]);
    // A described field still points at text that exists.
    for (const element of host.querySelectorAll("[aria-describedby]"))
      for (const id of element.getAttribute("aria-describedby")!.split(" "))
        expect(document.getElementById(id), id).not.toBeNull();
  },
);
