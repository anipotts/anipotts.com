// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { newWritingSource } from "../../lib/writing-draft";
import { HomeEditor } from "./HomeEditor";

vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
vi.mock("./ArticleBody", () => ({
  ArticleBody: ({ value, onChange, flushRef }: any) => {
    const latest = React.useRef(value);
    flushRef.current = () => onChange(latest.current);
    return (
      <textarea
        aria-label="Test article body"
        defaultValue={value}
        onChange={(e) => {
          latest.current = e.target.value;
        }}
      />
    );
  },
}));
vi.mock("./RichTextField", () => ({ RichTextField: () => <p>Subtitle</p> }));
vi.mock("./SavedArticlePreview", () => ({
  SavedArticlePreview: ({ revision }: any) => (
    <p data-preview-revision={revision}>Article preview</p>
  ),
}));
vi.mock("./RecordPanel", () => ({
  RecordPanel: ({ title, children, onClose }: any) => (
    <aside aria-label={title}>
      <button onClick={onClose}>Close panel</button>
      {children}
    </aside>
  ),
}));
vi.mock("./ReviewChanges", () => ({
  ReviewChanges: ({ after }: any) => (
    <pre aria-label="Reviewed source">{after}</pre>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const source =
  newWritingSource("Original title").replace(
    'summary: ""',
    'summary: "A short summary"',
  ) + "Original body.";
const draft = {
  key: "content/public/writing/test.md",
  source,
  revision: 1,
  updatedAt: Date.now(),
  discardedAt: null,
  baseCommit: "a".repeat(40),
  baseFileHash: null,
};
const snapshot = {
  base: {
    source: newWritingSource("Original title"),
    commit: "a".repeat(40),
    fileHash: null,
  },
  draft,
  history: [draft],
  publication: null,
  publishing: "ready",
};
function response(data: unknown) {
  return new Response(JSON.stringify(data));
}
async function mount(search = "", localPreview = true) {
  window.history.replaceState(null, "", `/content/writing/test${search}`);
  await act(async () => {
    root.render(
      <HomeEditor
        record={{ kind: "writing", id: "test" }}
        localPreview={localPreview}
      />,
    );
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(
        host.querySelector('textarea[aria-label="Test article body"]'),
      ).not.toBeNull(),
    );
  });
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => {
    button!.click();
  });
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      return response(snapshot);
    }),
  );
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
it("deep-linked preview loads the saved revision and keeps the same document through popstate", async () => {
  await mount("?view=preview&theme=dark");
  expect(window.location.search).toContain("view=preview");
  expect(host.textContent).toContain("Article preview");
  const body = host.querySelector('textarea[aria-label="Test article body"]');
  await act(async () => {
    window.history.replaceState(null, "", "/content/writing/test?theme=dark");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(host.querySelector('textarea[aria-label="Test article body"]')).toBe(
    body,
  );
  expect(host.textContent).not.toContain("Article preview");
  await click("Preview");
  expect(window.location.search).toContain("theme=dark");
  expect(window.location.search).toContain("view=preview");
});
it("deep-linked history opens one panel alongside the mounted document", async () => {
  await mount("?panel=history");
  expect(
    host.querySelector('aside[aria-label="Version history"]'),
  ).not.toBeNull();
  const body = host.querySelector('textarea[aria-label="Test article body"]');
  await click("Properties");
  expect(host.querySelectorAll("aside")).toHaveLength(1);
  expect(host.querySelector('aside[aria-label="Properties"]')).not.toBeNull();
  expect(host.querySelector('textarea[aria-label="Test article body"]')).toBe(
    body,
  );
  await click("Close panel");
  expect(window.location.search).not.toContain("panel=");
});

it("closing Properties does not silently approve newly edited metadata", async () => {
  await mount("?view=review");
  await click("Properties");
  const label = [...host.querySelectorAll("label")].find(
    (el) => el.textContent?.trim() === "Tags",
  );
  expect(label).toBeTruthy();
  const input = document.getElementById(label!.htmlFor) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "new-tag");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Close panel");
  expect(host.textContent).toContain("This review is out of date");
  expect(
    host.querySelector('[aria-label="Reviewed source"]')?.textContent,
  ).not.toContain("new-tag");
});
it("leaving review during session preparation never starts publication", async () => {
  let finish!: (value: Response) => void;
  const csrf = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetcher = vi.fn(async (url: string) =>
    url.includes("/csrf") ? csrf : response(snapshot),
  );
  vi.stubGlobal("fetch", fetcher);
  await mount("?view=review", false);
  await click("Approve and publish");
  await act(async () => {
    await vi.waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => url.includes("/csrf"))).toBe(
        true,
      ),
    );
  });
  await click("Back to editor");
  await act(async () => {
    finish(response({ csrf: "test-only" }));
    await csrf;
  });
  expect(fetcher.mock.calls.some(([url]) => url.includes("/publish"))).toBe(
    false,
  );
});

it("restores the main panel scroll position when returning from preview", async () => {
  host.id = "astryx-app-shell-main";
  await mount();
  host.scrollTop = 480;
  const body = host.querySelector('textarea[aria-label="Test article body"]');
  await click("Preview");
  expect(host.textContent).toContain("Article preview");
  host.scrollTop = 24;
  await click("Edit");
  await act(async () => {
    await vi.waitFor(() => expect(host.scrollTop).toBe(480));
  });
  expect(host.querySelector('textarea[aria-label="Test article body"]')).toBe(
    body,
  );
  expect(window.scrollTo).not.toHaveBeenCalled();
});
