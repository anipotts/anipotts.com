// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/source";
import { HomeEditor } from "./HomeEditor";
import * as navigation from "../../lib/editorial-navigation";
import { adminNavigationEvent } from "../../lib/editorial-navigation";
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
    // Like the real body editor, an unmounted body has nothing left to flush.
    React.useEffect(
      () => () => {
        flushRef.current = null;
      },
      [],
    );
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
type SaveInput = {
  source: string;
  expectedRevision: number;
  requestId: string;
};
let root: Root;
let host: HTMLDivElement;
let compared: Draft | null;
let fetcher: ReturnType<typeof vi.fn>;
/** Overrides the save reply; undefined falls through to the default server. */
let answerSave: (input: SaveInput, body: string) => Response | undefined;
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
function buttons(label: string) {
  return [...host.querySelectorAll("button")].filter(
    (element) => element.textContent?.trim() === label,
  );
}
function button(label: string) {
  const found = buttons(label)[0];
  expect(found, label).toBeTruthy();
  return found!;
}
function body() {
  return host.querySelector(
    '[aria-label="Test article body"]',
  ) as HTMLTextAreaElement | null;
}
async function type(value: string) {
  await act(async () => {
    const input = body()!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** Let the typing pause elapse so the save scheduler flushes. */
async function pause() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
}
function saveBodies(): SaveInput[] {
  return saves().map(([, init]) => JSON.parse(String(init.body)));
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
/** The snapshot this tab most recently wrote to browser recovery. */
function writtenRecovery() {
  return JSON.parse(localStorage.getItem(versionedRecoveryKey(key))!).payload;
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
async function mount(ready = "Compare before saving again") {
  await act(async () => {
    root.render(<HomeEditor record={record} />);
  });
  await click("Publish");
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain(ready), {
      timeout: 2000,
    });
  });
}
/** Opens the saved draft with no recovered operation. */
async function mountClean() {
  localStorage.clear();
  await act(async () => {
    root.render(<HomeEditor record={record} />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(body()).not.toBeNull(), { timeout: 2000 });
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
        const answer = answerSave(input, String(options?.body));
        if (answer) return answer;
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
  answerSave = () => undefined;
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

it("keeps retained edits as a new draft when no saved draft exists", async () => {
  compared = null;
  await mount();
  await click("Compare saved draft");
  expect(button("Keep my version").disabled).toBe(false);
  expect(buttons("Use saved version")).toHaveLength(0);
  // One title for every no-saved-draft trigger, matching a null-current conflict.
  expect(host.textContent).toContain("Saved draft not found");
  expect(host.textContent).not.toContain("Compare before saving again");
  expect(host.textContent).toContain(
    "No saved draft is available to compare. Keep your version to save your retained edits as a new draft.",
  );
  expect(host.textContent).not.toContain("comparing again");
  expect(host.textContent).not.toContain("Saved on another tab or device");
  expect(button("Download draft").disabled).toBe(false);
  expect(recovery().pending).toEqual(pending);
  expect(saves()).toHaveLength(1);
  await click("Keep my version");
  expect(saves()).toHaveLength(2);
  const next = saveBodies()[1];
  expect(next).toMatchObject({ source: mine, expectedRevision: 0 });
  expect(next.requestId).not.toBe(pending.requestId);
  expect(host.textContent).not.toContain("Compare before saving again");
  expectRecoveryRetired();
});

it("offers a new draft when a conflict reports no saved draft", async () => {
  answerSave = (input) =>
    input.requestId === pending.requestId
      ? response(
          {
            ok: false,
            code: "revision_conflict",
            current: null,
            conflictId: pending.requestId,
            valid: true,
          },
          409,
        )
      : undefined;
  await mount("Keep my version");
  expect(button("Keep my version").disabled).toBe(false);
  expect(buttons("Use saved version")).toHaveLength(0);
  expect(host.textContent).not.toContain("Another edit was saved");
  expect(host.textContent).toContain("Saved draft not found");
  expect(host.textContent).toContain("No saved draft is available to compare");
  await click("Keep my version");
  expect(saves()).toHaveLength(2);
  const next = saveBodies()[1];
  expect(next).toMatchObject({ source: mine, expectedRevision: 0 });
  expect(next.requestId).not.toBe(pending.requestId);
  expect(host.textContent).not.toContain("Saved draft not found");
  expectRecoveryRetired();
});

it("stops resending a draft the server refused, then saves a different edit", async () => {
  answerSave = (input) =>
    input.source.endsWith("Refused body.")
      ? response({ ok: false, code: "invalid_draft_request", valid: true }, 400)
      : undefined;
  await mountClean();
  await type("Refused body.");
  await pause();
  expect(saves()).toHaveLength(1);
  // A later typing pause over the same text is not a new operation.
  await type("Refused body. Almost");
  await type("Refused body.");
  await pause();
  expect(saves()).toHaveLength(1);
  expect(host.textContent).toContain("Server refused this save");
  expect(host.textContent).toContain("Your edits are kept on this device.");
  expect(host.textContent).toContain("Download a copy, then reload");
  // The remaining causes are server-side, so editing is not the way out.
  expect(host.textContent).not.toContain("edit the draft");
  expect(host.textContent).not.toContain("Retry save");
  expect(button("Download draft").disabled).toBe(false);
  expect(writtenRecovery()).toMatchObject({ pending: null });
  expect(writtenRecovery().source).toContain("Refused body.");
  await type("Accepted body.");
  await pause();
  expect(saves()).toHaveLength(2);
  const [refused, next] = saveBodies();
  expect(next.source).toContain("Accepted body.");
  expect(next.expectedRevision).toBe(1);
  expect(next.requestId).not.toBe(refused.requestId);
  expect(host.textContent).not.toContain("Server refused this save");
});

it("hides Save now while a save is refused", async () => {
  answerSave = (input) =>
    input.source.endsWith("Refused body.")
      ? response({ ok: false, code: "invalid_draft_request", valid: true }, 400)
      : undefined;
  await mountClean();
  await type("Refused body.");
  await pause();
  expect(host.textContent).toContain("Server refused this save");
  await act(async () => {
    (
      host.querySelector(
        'button[aria-label="Document actions"]',
      ) as HTMLButtonElement
    ).click();
  });
  const items = [
    ...document.querySelectorAll(
      '[role="menu"][aria-label="Document actions"] [role="menuitem"]',
    ),
  ].map((item) => item.textContent ?? "");
  expect(items.some((label) => label.includes("Download draft"))).toBe(true);
  expect(items.some((label) => label.includes("Save now"))).toBe(false);
  expect(saves()).toHaveLength(1);
});

it("reloads a refused draft into the saved draft with the edits ready to review", async () => {
  answerSave = (input) =>
    input.source.endsWith("Refused body.")
      ? response({ ok: false, code: "invalid_draft_request", valid: true }, 400)
      : undefined;
  await mountClean();
  await type("Refused body.");
  await pause();
  expect(saves()).toHaveLength(1);
  const [refused] = saveBodies();
  const records = () =>
    fetcher.mock.calls.filter(([url]) => String(url).includes("/record?"));
  expect(records()).toHaveLength(1);
  // Reload: a fresh editor over the same device storage.
  act(() => root.unmount());
  answerSave = () => undefined;
  root = createRoot(host);
  await act(async () => {
    root.render(<HomeEditor record={record} />);
  });
  await act(async () => {
    await vi.waitFor(
      () =>
        expect(host.textContent).toContain(
          "Recovered edits are ready to review",
        ),
      { timeout: 2000 },
    );
  });
  expect(records()).toHaveLength(2);
  expect(body()!.value).toContain("Refused body.");
  expect(host.textContent).not.toContain("Server refused this save");
  expect(saves()).toHaveLength(1);
  await click("Save recovered edits");
  expect(saves()).toHaveLength(2);
  const next = saveBodies()[1];
  expect(next).toMatchObject({ source: refused.source, expectedRevision: 1 });
  expect(next.requestId).not.toBe(refused.requestId);
});

it("does not promise device retention for a refused save when browser recovery fails", async () => {
  answerSave = (input) =>
    input.source.endsWith("Refused body.")
      ? response({ ok: false, code: "invalid_draft_request", valid: true }, 400)
      : undefined;
  await mountClean();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("synthetic storage failure");
  });
  await type("Refused body.");
  await pause();
  expect(saves()).toHaveLength(1);
  expect(host.textContent).toContain("Browser recovery needs attention");
  expect(host.textContent).toContain("Server refused this save");
  expect(host.textContent).not.toContain("kept on this device");
  expect(host.textContent).toContain("Download a copy before you reload");
});

it.each([
  ["invalid_draft_request", "Server refused this save", "Refused body."],
  [
    "source_too_large",
    "Draft is too large to save",
    "x".repeat(MAX_SOURCE_BYTES + 1),
  ],
])(
  "keeps one refusal message when leaving after %s",
  async (code, title, text) => {
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    answerSave = (input) =>
      input.source.endsWith("Refused body.")
        ? response({ ok: false, code, valid: true }, 400)
        : undefined;
    await mountClean();
    await type(text);
    await pause();
    expect(buttons("Download draft")).toHaveLength(1);
    const alerts = host.querySelectorAll('[role="alert"]').length;
    await act(async () => {
      navigation.navigateAdmin("/content");
    });
    expect(commit).not.toHaveBeenCalled();
    // Saving is not possible, so the leave warning must not ask for it.
    expect(host.textContent).not.toContain("Save them before leaving");
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(alerts);
    expect(buttons("Download draft")).toHaveLength(1);
    expect(host.textContent).toContain(title);
    expect(host.textContent).toContain("Download a copy before leaving");
  },
);

it("names comparison and download when leaving before a comparison", async () => {
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  await mount();
  await act(async () => {
    navigation.navigateAdmin("/content");
  });
  expect(commit).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Save them before leaving");
  expect(host.textContent).toContain(
    "Your latest edits are not saved. Compare the saved draft and choose a version, or download a copy before leaving this draft.",
  );
  await click("Compare saved draft");
  await act(async () => {
    navigation.navigateAdmin("/content");
  });
  expect(commit).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Save them before leaving");
  expect(host.textContent).toContain(
    "Your latest edits are not saved. Choose which version to keep, or download a copy before leaving this draft.",
  );
  expect(saves()).toHaveLength(1);
});

it("names the version choice and download when leaving a conflict", async () => {
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  answerSave = (input) =>
    input.requestId === pending.requestId
      ? response(
          {
            ok: false,
            code: "revision_conflict",
            current: saved,
            conflictId: pending.requestId,
            valid: true,
          },
          409,
        )
      : undefined;
  await mount("Another edit was saved");
  await act(async () => {
    navigation.navigateAdmin("/content");
  });
  expect(commit).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Save them before leaving");
  expect(host.textContent).toContain(
    "Your latest edits are not saved. Choose which version to keep, or download a copy before leaving this draft.",
  );
  expect(saves()).toHaveLength(1);
});

it("does not frame a later refusal as a held leave once saving resumed", async () => {
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  answerSave = (input) =>
    input.source.endsWith("Refused body.")
      ? response({ ok: false, code: "invalid_draft_request", valid: true }, 400)
      : undefined;
  await mountClean();
  // Leaving flushes immediately, so no typing pause is needed to save.
  await type("Refused body.");
  await act(async () => {
    navigation.navigateAdmin("/content");
  });
  expect(commit).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Download a copy before leaving");
  await type("Accepted body.");
  await act(async () => {
    navigation.navigateAdmin("/content");
  });
  expect(commit).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain("Server refused this save");
  await type("Refused body.");
  await pause();
  expect(host.textContent).toContain("Server refused this save");
  expect(host.textContent).not.toContain("Download a copy before leaving");
  expect(host.textContent).toContain("Download a copy, then reload");
});

it("holds an operation the server says was reused for an explicit comparison", async () => {
  let reused: string | undefined;
  answerSave = (input) => {
    reused ??= input.requestId;
    return input.requestId === reused
      ? response(
          { ok: false, code: "idempotency_key_reused", valid: true },
          400,
        )
      : undefined;
  };
  await mountClean();
  await type("Reused body.");
  await pause();
  expect(saves()).toHaveLength(1);
  await type("Reused body. More typing.");
  await pause();
  expect(saves()).toHaveLength(1);
  expect(host.textContent).toContain("Compare before saving again");
  expect(host.textContent).toContain("already used for different content");
  expect(host.textContent).not.toContain("Retry save");
  expect(writtenRecovery().pending.requestId).toBe(reused);
  expect(writtenRecovery().source).toContain("More typing.");
  await click("Compare saved draft");
  await click("Keep my version");
  expect(saves()).toHaveLength(2);
  const next = saveBodies()[1];
  expect(next.source).toContain("More typing.");
  expect(next.expectedRevision).toBe(3);
  expect(next.requestId).not.toBe(reused);
  expect(host.textContent).not.toContain("Compare before saving again");
});

it("never sends a draft over the save limit, including bodies the API refuses outright", async () => {
  // editorial-home-api.ts refuses an oversized body before the draft store runs.
  answerSave = (_, raw) =>
    new TextEncoder().encode(raw).byteLength > MAX_SOURCE_BYTES * 6 + 1024
      ? response({ error: "invalid_request" }, 400)
      : undefined;
  await mountClean();
  await type("x".repeat(MAX_SOURCE_BYTES * 6 + 2048));
  await pause();
  expect(saves()).toHaveLength(0);
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(adminNavigationEvent, {
        detail: "/content",
        cancelable: true,
      }),
    );
  });
  expect(saves()).toHaveLength(0);
  expect(host.textContent).toContain("Draft is too large to save");
  expect(host.textContent).toContain("512 KB");
  expect(host.textContent).not.toContain("Retry save");
  class DownloadURL extends URL {
    static createObjectURL = vi.fn(() => "blob:synthetic-oversized");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", DownloadURL);
  const download = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await click("Download draft");
  expect(download).toHaveBeenCalledOnce();
  expect(saves()).toHaveLength(0);
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
