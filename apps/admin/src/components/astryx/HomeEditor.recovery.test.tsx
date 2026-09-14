// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeEditor } from "./HomeEditor";
import { newWritingSource } from "../../lib/writing-draft";
import { recoveryKey, recoveryLogoutKey } from "../../lib/draft-recovery";
import { versionedRecoveryKey } from "../../lib/browser-recovery";
import type { Draft } from "../../editorial/draft-store";

vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
vi.mock("./ArticleBody", () => ({
  ArticleBody: ({
    value,
    onChange,
    flushRef,
    onDirty,
    resetGeneration,
  }: any) => {
    const latest = React.useRef(value);
    const input = React.useRef<HTMLTextAreaElement>(null);
    React.useEffect(() => {
      latest.current = value;
      if (input.current) input.current.value = value;
    }, [resetGeneration]);
    flushRef.current = () => onChange(latest.current);
    return (
      <textarea
        ref={input}
        aria-label="Test article body"
        defaultValue={value}
        onChange={(event) => {
          latest.current = event.target.value;
          onDirty?.();
        }}
      />
    );
  },
}));
vi.mock("./RichTextField", () => ({ RichTextField: () => <p>Subtitle</p> }));
vi.mock("./RecordPanel", () => ({
  RecordPanel: ({ children }: any) => <aside>{children}</aside>,
}));
vi.mock("./SavedArticlePreview", () => ({
  SavedArticlePreview: () => <p>Preview</p>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const record = { kind: "writing", id: "test" } as const;
const owner = "owner@example.invalid";
const key = recoveryKey(owner, record);
const article = (title: string, body: string) =>
  `${newWritingSource(title).replace('summary: ""', 'summary: "Synthetic summary"')}${body}`;
const source = article("Original title", "Original body.");
const mine = article("Retained title", "Retained private body.");
const pending = {
  source: mine,
  expectedRevision: 1,
  requestId: "c2d03b1d-c259-43f7-bf79-457d2863f10e",
};
const draft: Draft = {
  key: "content/public/writing/test.md",
  source,
  revision: 1,
  updatedAt: 1,
  discardedAt: null,
  baseCommit: "a".repeat(40),
  baseFileHash: null,
};
const saved: Draft = {
  ...draft,
  source: article("Saved title", "Saved on another device."),
  revision: 3,
};
let root: Root;
let host: HTMLDivElement;
let compared: Draft | null;
let fetcher: ReturnType<typeof vi.fn>;
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
function button(label: string) {
  const found = [...host.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(found, label).toBeTruthy();
  return found!;
}
async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
}
function sourceValue(label: string) {
  const found = [...host.querySelectorAll("label")].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(found, label).toBeTruthy();
  return (document.getElementById(found!.htmlFor) as HTMLTextAreaElement).value;
}
function saves() {
  return fetcher.mock.calls.filter(([url]) => String(url).includes("/save?"));
}
function recovery() {
  return JSON.parse(localStorage.getItem(key)!);
}
/** Retiring a recovery candidate writes a v2 tombstone rather than deleting the
 * v1 bytes, which stay readable by an older tab. The tombstone is what stops
 * them resurrecting, so assert on it instead of on the v1 key being gone. */
function expectRecoveryRetired() {
  const envelope = localStorage.getItem(versionedRecoveryKey(key));
  expect(envelope).not.toBeNull();
  const parsed = JSON.parse(envelope!);
  expect(parsed.version).toBe(2);
  expect(parsed.payload).toBeNull();
}
async function mount() {
  await act(async () => {
    root.render(<HomeEditor record={record} />);
  });
  await click("Review changes");
  await act(async () => {
    await vi.waitFor(
      () => expect(host.textContent).toContain("Compare before saving again"),
      { timeout: 2000 },
    );
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  // jsdom has no Web Locks, and browser recovery refuses every uncoordinated
  // write without one, so without this stub the whole recovery path is inert
  // and these assertions would pass for the wrong reason.
  if (!navigator.locks)
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (_name: string, ...rest: unknown[]) => {
          const task = rest[rest.length - 1] as () => unknown;
          return await task();
        },
      },
    });
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
    (fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/save?")) {
        const input = JSON.parse(String(options?.body));
        if (input.requestId === pending.requestId)
          return response(
            { ok: false, code: "save_reconciliation_required" },
            409,
          );
        return response({
          ok: true,
          draft: {
            ...saved,
            source: input.source,
            revision: input.expectedRevision + 1,
          },
        });
      }
      if (url.includes("/draft?")) return response({ draft: compared });
      if (url.includes("/restore?"))
        return response({
          draft: {
            ...compared,
            discardedAt: null,
            revision: compared!.revision + 1,
          },
        });
      return response({
        recoveryScope: owner,
        base: { source, baseCommit: draft.baseCommit, baseFileHash: null },
        draft,
        history: [draft],
        publication: null,
        publishing: "not_configured",
      });
    })),
  );
  compared = saved;
  window.history.replaceState(null, "", "/content/writing/test");
  localStorage.setItem(
    key,
    JSON.stringify({ source: mine, saved: source, revision: 1, pending }),
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

it("compares without retrying or changing the retained operation, then saves only an explicit choice", async () => {
  await mount();
  expect(saves()).toHaveLength(1);
  expect(host.textContent).not.toContain("Retry save");
  expect(recovery().pending).toEqual(pending);
  await click("Compare saved draft");
  expect(sourceValue("Saved on another tab or device")).toBe(saved.source);
  expect(sourceValue("Your retained draft")).toBe(mine);
  expect(recovery().pending).toEqual(pending);
  expect(saves()).toHaveLength(1);
  await click("Keep my version");
  expect(saves()).toHaveLength(2);
  const next = JSON.parse(String(saves()[1][1].body));
  expect(next).toMatchObject({ source: mine, expectedRevision: 3 });
  expect(next.requestId).not.toBe(pending.requestId);
  expect(host.textContent).not.toContain("Compare before saving again");
  expectRecoveryRetired();
});

it("can use the compared saved draft without an additional write", async () => {
  await mount();
  await click("Compare saved draft");
  await click("Use saved version");
  expect(saves()).toHaveLength(1);
  expect(host.textContent).not.toContain("Compare before saving again");
  expect(
    (
      host.querySelector(
        '[aria-label="Test article body"]',
      ) as HTMLTextAreaElement
    ).value,
  ).toContain("Saved on another device.");
  expectRecoveryRetired();
});

it("keeps typing buffered during comparison when the owner chooses their version", async () => {
  await mount();
  await click("Back to editor");
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await click("Compare saved draft");
  const input = host.querySelector(
    '[aria-label="Test article body"]',
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "Typed while comparison was loading.");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    finish(response({ draft: saved }));
  });
  expect(saves()).toHaveLength(1);
  expect(recovery().pending).toEqual(pending);
  await click("Keep my version");
  const next = JSON.parse(String(saves()[1][1].body));
  expect(next.source).toContain("Typed while comparison was loading.");
  expect(next.expectedRevision).toBe(3);
});

it("downloads retained edits without retrying or clearing their operation", async () => {
  await mount();
  class DownloadURL extends URL {
    static createObjectURL = vi.fn(() => "blob:synthetic-recovery");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", DownloadURL);
  const download = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await click("Download draft");
  expect(download).toHaveBeenCalledOnce();
  expect(DownloadURL.createObjectURL).toHaveBeenCalledOnce();
  expect(recovery().pending).toEqual(pending);
  expect(recovery().source).toBe(mine);
  expect(saves()).toHaveLength(1);
});

it("retains input and the original operation if comparison fails, then allows another read", async () => {
  await mount();
  fetcher.mockImplementationOnce(async () =>
    response({ error: "unavailable" }, 503),
  );
  await click("Compare saved draft");
  expect(host.textContent).toContain("Couldn’t load the saved draft");
  expect(recovery().pending).toEqual(pending);
  expect(saves()).toHaveLength(1);
  await click("Compare saved draft");
  expect(sourceValue("Your retained draft")).toBe(mine);
  expect(host.textContent).not.toContain("Couldn’t load the saved draft");
});

it("ignores a comparison response that arrives after logout", async () => {
  await mount();
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await click("Compare saved draft");
  await act(async () => {
    window.dispatchEvent(new Event(recoveryLogoutKey));
    finish(response({ draft: saved }));
  });
  expect(host.textContent).not.toContain("Saved on another tab or device");
  expect(saves()).toHaveLength(1);
});

it("explains why a missing saved draft cannot be chosen", async () => {
  compared = null;
  await mount();
  await click("Compare saved draft");
  expect(host.textContent).toContain("No saved draft is available");
  expect(button("Keep my version").disabled).toBe(true);
  expect(button("Use saved version").disabled).toBe(true);
  expect(button("Download draft").disabled).toBe(false);
  expect(recovery().pending).toEqual(pending);
});

it("requires explicit restoration of a discarded saved draft before choosing content", async () => {
  compared = { ...saved, discardedAt: 1 };
  await mount();
  await click("Compare saved draft");
  expect(button("Keep my version").disabled).toBe(true);
  await click("Restore saved draft");
  expect(recovery().pending).toEqual(pending);
  expect(saves()).toHaveLength(1);
  expect(
    JSON.parse(
      String(
        fetcher.mock.calls.find(([url]) => url.includes("/restore?"))![1].body,
      ),
    ),
  ).toEqual({ expectedRevision: 3 });
  await click("Keep my version");
  expect(JSON.parse(String(saves()[1][1].body))).toMatchObject({
    source: mine,
    expectedRevision: 4,
  });
});
