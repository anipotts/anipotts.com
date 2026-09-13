// @vitest-environment jsdom
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HomeEditor } from "./HomeEditor";
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
it.each(["", "?view=preview"])(
  "keeps newsletter editing available without requesting an unsupported preview (%s)",
  async (search) => {
    vi.stubGlobal("React", React);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
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
    const source = readFileSync(
      "../../content/public/pages/newsletter.md",
      "utf8",
    );
    const draft = {
      key: "content/public/pages/newsletter.md",
      source,
      revision: 1,
      updatedAt: Date.now(),
      discardedAt: null,
      baseCommit: "a".repeat(40),
      baseFileHash: null,
    };
    const fetcher = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            base: { source, commit: "a".repeat(40), fileHash: null },
            draft,
            history: [draft],
            publication: null,
            publishing: "ready",
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState(
      null,
      "",
      `/content/newsletterPage/newsletter${search}`,
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <HomeEditor
            record={{ kind: "page", id: "newsletter" }}
            localPreview
          />,
        ),
      );
      await act(async () => {
        await vi.waitFor(() =>
          expect(host.textContent).toContain("draft-only newsletter page"),
        );
      });
      expect(host.querySelector("iframe")).toBeNull();
      expect(
        Array.from(host.querySelectorAll("button")).some((button) =>
          ["Preview", "Retry preview", "Refresh preview"].includes(
            button.textContent?.trim() ?? "",
          ),
        ),
      ).toBe(false);
      expect(
        fetcher.mock.calls.every(
          (call) =>
            !(call[1] as RequestInit | undefined)?.method ||
            (call[1] as RequestInit).method === "GET",
        ),
      ).toBe(true);
      expect(host.textContent).toContain("Review changes");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
