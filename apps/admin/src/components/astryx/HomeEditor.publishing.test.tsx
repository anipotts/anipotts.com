// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SaveScheduler } from "../../lib/save-scheduler";
import { newWritingSource } from "../../lib/writing-draft";
import { HomeEditor } from "./HomeEditor";
import { RECORD_SAVED_EVENT } from "../../lib/editorial-inventory-events";

vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
vi.mock("./ArticleBody", () => ({
  ArticleBody: ({ value, onChange, flushRef, onDirty }: any) => {
    const latest = React.useRef(value);
    flushRef.current = () => onChange(latest.current);
    return (
      <textarea
        aria-label="Test article body"
        defaultValue={value}
        onChange={(e) => {
          latest.current = e.target.value;
          onDirty?.();
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
vi.mock("./ReviewChanges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ReviewChanges")>()),
  ReviewChanges: ({ after, labelledBy }: any) => (
    <pre
      aria-label="Reviewed source"
      aria-labelledby={labelledBy}
      className="editor-revision-diff"
    >
      {after}
    </pre>
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
it("keeps one publish action beside Back to editor in the document toolbar", async () => {
  await mount("?view=review", false);
  const toolbar = host.querySelector(
    '[role="toolbar"][aria-label="Document actions"]',
  );
  expect(toolbar).not.toBeNull();
  expect(
    [...host.querySelectorAll("h1")].map((node) => node.textContent),
  ).toEqual(["Review changes"]);
  const heading = host.querySelector("h1")!;
  expect(
    host
      .querySelector(".editor-revision-diff")
      ?.getAttribute("aria-labelledby"),
  ).toBe(heading.id);
  expect(host.querySelector(".editor-revision-diff h2")).toBeNull();
  expect(
    heading.parentElement?.querySelector('[aria-label="Diff legend"]'),
  ).not.toBeNull();
  const saveStatus = host.querySelector('[aria-label="Draft save status"]');
  expect(
    host.querySelectorAll('[aria-label="Draft save status"]'),
  ).toHaveLength(1);
  expect(
    heading.closest(".editor-review-title-row")?.contains(saveStatus),
  ).toBe(true);
  expect(toolbar!.contains(saveStatus)).toBe(false);
  const buttons = [...host.querySelectorAll("button")];
  const publish = buttons.filter(
    (button) => button.textContent?.trim() === "Approve and publish",
  );
  expect(publish).toHaveLength(1);
  expect(toolbar!.contains(publish[0])).toBe(true);
  expect(
    [...toolbar!.querySelectorAll("button")].some(
      (button) => button.textContent?.trim() === "Back to editor",
    ),
  ).toBe(true);
  expect(publish[0].hasAttribute("aria-describedby")).toBe(false);
  expect(publish[0].hasAttribute("title")).toBe(false);
  expect(host.textContent).not.toContain(
    "Publishes this record’s source to GitHub and the website",
  );
});

it("shows an unchanged base without asserting a privately saved draft", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({
        ...snapshot,
        base: { ...snapshot.base, source },
        draft: null,
        history: [],
      }),
    ),
  );
  await mount("", false);
  const status = host.querySelector('[role="status"][data-save-state]');
  expect(status?.getAttribute("data-save-state")).toBe("unchanged");
  expect(status?.textContent).toBe("No changes");
  expect(host.textContent).not.toContain("Saved privately");
});

it.each([
  { localPreview: true, state: "saved-locally", label: "Saved locally" },
  { localPreview: false, state: "saved-privately", label: "Saved privately" },
])(
  "identifies an acknowledged $state revision",
  async ({ localPreview, state, label }) => {
    await mount("", localPreview);
    const status = host.querySelector('[role="status"][data-save-state]');
    expect(status?.getAttribute("data-save-state")).toBe(state);
    expect(status?.textContent).toBe(label);
    expect(status?.closest('[aria-label="Document actions"]')).not.toBeNull();
  },
);

it("does not mark newer buffered edits saved when an earlier save is acknowledged", async () => {
  let finish!: (value: Response) => void;
  let sourceSent = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/save")) {
        sourceSent = JSON.parse(init!.body as string).source;
        return new Promise<Response>((resolve) => (finish = resolve));
      }
      return response(snapshot);
    }),
  );
  await mount("", false);
  const title = host.querySelector(
    ".document-title textarea",
  ) as HTMLTextAreaElement;
  const typeTitle = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(title, value);
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const status = () => host.querySelector('[role="status"][data-save-state]');
  await typeTitle("First buffered title");
  expect(status()?.getAttribute("data-save-state")).toBe("changed");
  await click("Publish");
  await act(async () => {
    await vi.waitFor(() =>
      expect(sourceSent).toContain("First buffered title"),
    );
  });
  expect(["changed", "saving"]).toContain(
    status()?.getAttribute("data-save-state"),
  );
  await typeTitle("Newer buffered title");
  expect(status()?.getAttribute("data-save-state")).toBe("changed");
  await act(async () => {
    finish(
      response({
        ok: true,
        draft: { ...draft, source: sourceSent, revision: 2 },
        valid: true,
      }),
    );
  });
  expect(status()?.getAttribute("data-save-state")).toBe("changed");
  expect(status()?.textContent).toBe("Unsaved changes");
  expect(title.value).toBe("Newer buffered title");
});

it("submits the reviewed revision once and preserves the legacy publication contract", async () => {
  let finish!: (value: Response) => void;
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/publish")) {
        posts.push(JSON.parse(init!.body as string));
        return new Promise<Response>((resolve) => (finish = resolve));
      }
      return response(snapshot);
    }),
  );
  await mount("?view=review", false);
  const publish = [...host.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Approve and publish",
  )!;
  await act(async () => {
    publish.click();
    publish.click();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
  });
  expect(posts[0]).toEqual({
    expectedRevision: 1,
    operationId: expect.any(String),
    discloseSource: true,
  });
  await act(async () => {
    finish(
      response({
        publication: {
          id: "test-publication",
          phase: "validate",
          version: 1,
          attempts: 0,
          dueAt: 0,
          lease: null,
          leaseUntil: 0,
          blocked: null,
          checkpoint: {},
        },
      }),
    );
  });
  expect(publish.disabled).toBe(true);
  expect(host.textContent).toContain("Publication");
  expect(posts).toHaveLength(1);
});

it("preserves local publishing restrictions until transfer is released", async () => {
  await mount("?view=review", true);
  const publish = [...host.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Approve and publish",
  )!;
  expect(publish.disabled).toBe(true);
});

it("rejects publication when buffered edits no longer match the reviewed revision", async () => {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/publish")) posts.push(url);
      if (url.includes("/save"))
        return response({
          ok: true,
          draft: {
            ...draft,
            source: JSON.parse(init!.body as string).source,
            revision: 2,
          },
          valid: true,
        });
      return response(snapshot);
    }),
  );
  await mount("?view=review", false);
  const title = host.querySelector(
    ".document-title textarea",
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(title, "Changed after review");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Approve and publish");
  expect(posts).toEqual([]);
  expect(host.textContent).toContain("The draft changed before publishing");
  expect(title.value).toBe("Changed after review");
});

it("keeps the local production navigation fallback in the menu without claiming transfer", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  await mount("?view=review", true);
  expect(
    [...host.querySelectorAll("button, a")].some(
      (el) => el.textContent?.trim() === "Open production editor",
    ),
  ).toBe(false);
  await act(async () => {
    (
      host.querySelector(
        'button[aria-label="Document actions"]',
      ) as HTMLButtonElement
    ).click();
  });
  const fallback = [...document.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent?.includes("Open production editor"),
  ) as HTMLElement;
  expect(fallback.textContent).toContain("Download this local draft");
  await act(async () => fallback.click());
  expect(open).toHaveBeenCalledWith(
    "https://admin.anipotts.com/content/writing/test",
    "_blank",
    "noopener,noreferrer",
  );
});

it("groups document actions under labeled menu sections, not dividers", async () => {
  // Hold autosave so the committed edit stays unsaved while the menu is read.
  vi.spyOn(SaveScheduler.prototype, "changed").mockImplementation(() => {});
  await mount("", true);
  const title = host.querySelector(
    ".document-title textarea",
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(title, "Unsaved title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const openMenu = async () => {
    await act(async () => {
      (
        host.querySelector(
          'button[aria-label="Document actions"]',
        ) as HTMLButtonElement
      ).click();
    });
    const menu = document.querySelector(
      '[role="menu"][aria-label="Document actions"]',
    )!;
    expect(menu.querySelector('[role="separator"], hr')).toBeNull();
    return menu;
  };
  const sections = (menu: Element) =>
    [...menu.querySelectorAll('[role="group"]')].map((group) => [
      group.getAttribute("aria-label"),
      [...group.querySelectorAll('[role="menuitem"]')].map(
        (item) => item.querySelector("span > span")?.textContent,
      ),
    ]);
  const inspect = ["Inspect", ["View source", "Compare with website"]];
  const draftActions = [
    "Open production editor",
    "Download draft",
    "Import draft…",
  ];
  let menu = await openMenu();
  expect(sections(menu)).toEqual([inspect, ["Draft", draftActions]]);
  expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
  // Leaving the editor tab commits the buffered title, so Save now appears.
  const viewSource = [...menu.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent === "View source",
  ) as HTMLElement;
  await act(async () => viewSource.click());
  menu = await openMenu();
  expect(sections(menu)).toEqual([
    inspect,
    ["Draft", [...draftActions, "Save now"]],
  ]);
  expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(6);
});

it("polls an unfinished publication only while the page is visible", async () => {
  let hidden = false;
  const visibility = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  const publication = {
    id: "test-publication",
    phase: "validate",
    version: 1,
    attempts: 0,
    dueAt: 0,
    lease: null,
    leaseUntil: 0,
    blocked: null,
    checkpoint: {},
  };
  const polls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("operationId=")) {
        polls.push(url);
        return response({ publication: { ...publication } });
      }
      return response({ ...snapshot, publication });
    }),
  );
  vi.useFakeTimers();
  try {
    await mount();
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    const setHidden = (value: boolean) =>
      act(async () => {
        hidden = value;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await advance(4000);
    expect(polls).toHaveLength(1);
    await setHidden(true);
    await advance(60000);
    expect(polls).toHaveLength(1);
    await setHidden(false);
    await advance(3999);
    expect(polls).toHaveLength(1);
    await advance(1);
    expect(polls).toHaveLength(2);
  } finally {
    vi.useRealTimers();
    if (visibility) Object.defineProperty(document, "hidden", visibility);
    else Reflect.deleteProperty(document, "hidden");
  }
});

it("releases an unread record error body and shows the load failure", async () => {
  const cancel = vi.fn(async () => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      const failed = new Response("unavailable", { status: 503 });
      Object.defineProperty(failed, "body", { value: { cancel } });
      return failed;
    }),
  );
  window.history.replaceState(null, "", "/content/writing/test");
  await act(async () => {
    root.render(<HomeEditor record={{ kind: "writing", id: "test" }} />);
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Couldn’t load this draft."),
    );
  });
  expect(cancel).toHaveBeenCalledOnce();
});

it("updates the library row once when this tab's publication reaches live", async () => {
  const job = (phase: string) => ({
    id: "test-publication",
    phase,
    version: 1,
    attempts: 0,
    dueAt: 0,
    lease: null,
    leaseUntil: 0,
    blocked: null,
    checkpoint: {},
  });
  let finish!: (value: Response) => void;
  let phase = "deploy";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("operationId="))
        return response({ publication: job(phase) });
      if (url.includes("/publish"))
        return new Promise<Response>((resolve) => (finish = resolve));
      return response(snapshot);
    }),
  );
  const events: CustomEvent[] = [];
  const listen = (event: Event) => events.push(event as CustomEvent);
  window.addEventListener(RECORD_SAVED_EVENT, listen);
  try {
    await mount("?view=review", false);
    const publish = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve and publish",
    )!;
    await act(async () => {
      publish.click();
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    });
    vi.useFakeTimers();
    await act(async () => finish(response({ publication: job("validate") })));
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    await advance(4000);
    expect(events).toHaveLength(0);
    phase = "live";
    await advance(4000);
    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toMatchObject({
      record: { kind: "writing", id: "test" },
      title: "Original title",
      revision: 1,
      changesPending: false,
      publishedAt: expect.any(String),
    });
    await advance(60000);
    expect(events).toHaveLength(1);
  } finally {
    vi.useRealTimers();
    window.removeEventListener(RECORD_SAVED_EVENT, listen);
  }
});

it("updates the library row when a discarded draft is recovered", async () => {
  const discarded = { ...draft, discardedAt: Date.now() };
  const restored = { ...draft, revision: 2, updatedAt: Date.now() };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("restore"))
        return response({ ok: true, draft: restored });
      return response({ ...snapshot, draft: discarded, history: [discarded] });
    }),
  );
  const events: CustomEvent[] = [];
  const listen = (event: Event) => events.push(event as CustomEvent);
  window.addEventListener(RECORD_SAVED_EVENT, listen);
  try {
    await mount();
    await click("Recover draft");
    await act(async () => {
      await vi.waitFor(() => expect(events).toHaveLength(1));
    });
    expect(events[0]!.detail).toMatchObject({
      record: { kind: "writing", id: "test" },
      title: "Original title",
      revision: 2,
      changesPending: true,
    });
  } finally {
    window.removeEventListener(RECORD_SAVED_EVENT, listen);
  }
});

it("reconciles a lost submit response without creating another publication", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/publish?")) {
        requests.push(JSON.parse(init!.body as string));
        throw new TypeError("network interrupted after acceptance");
      }
      if (url.includes("/publication?"))
        return response({
          publication: {
            id: requests[0].operationId,
            phase: "validate",
            version: 0,
            attempts: 0,
            dueAt: 0,
            lease: null,
            leaseUntil: 0,
            blocked: null,
            checkpoint: {},
            queue: {
              position: 2,
              pending: 2,
              alarmAt: null,
              head: {
                id: "older",
                sequence: 1,
                record: { kind: "work", id: "sample-project" },
                revision: 1,
                createdAt: 0,
                phase: "validate",
                version: 3,
                attempts: 2,
                dueAt: 0,
                leaseUntil: 0,
                blocked: "unreleased_public_changes",
                cancelRequested: false,
              },
            },
          },
        });
      return response(snapshot);
    }),
  );
  await mount("?view=review", false);
  await click("Approve and publish");
  expect(requests).toHaveLength(1);
  expect(host.textContent).toContain("sample-project");
  expect(host.textContent).not.toContain("Couldn’t confirm publication");
  expect(
    host.querySelector('[aria-label="Publication progress"]'),
  ).not.toBeNull();
  expect(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Approve and publish",
    )?.disabled,
  ).toBe(true);
});

it("prepares a new private revision when reviewing an identical cancelled publication", async () => {
  const requests: Record<string, unknown>[] = [];
  let saved = draft;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/save?")) {
        const input = JSON.parse(init!.body as string);
        saved = { ...draft, source: input.source, revision: 2 };
        expect(input.expectedRevision).toBe(1);
        return response({ ok: true, draft: saved, valid: true });
      }
      if (url.includes("/publish?")) {
        requests.push(JSON.parse(init!.body as string));
        return response({
          publication: {
            id: "new-operation",
            revision: 2,
            phase: "validate",
            version: 0,
            attempts: 0,
            dueAt: 0,
            lease: null,
            leaseUntil: 0,
            blocked: null,
            checkpoint: {},
          },
        });
      }
      return response({
        ...snapshot,
        publication: {
          id: "old-operation",
          revision: 1,
          phase: "cancelled",
          version: 1,
          attempts: 0,
          dueAt: 0,
          lease: null,
          leaseUntil: 0,
          blocked: null,
          checkpoint: {},
        },
      });
    }),
  );
  await mount("?view=review", false);
  await click("Approve and publish");
  expect(saved.source).toBe(draft.source);
  expect(requests).toHaveLength(1);
  expect(requests[0].expectedRevision).toBe(2);
  expect(requests[0].operationId).not.toBe("old-operation");
});

it("direct publishing reviews the current public baseline and sends exact source identities without Git", async () => {
  const { publicationSourceHash } =
    await import("@anipotts/content/editorial/publication-contract");
  const publishedSource = source.replace(
    "status: draft",
    "status: published\npublished_at: 2026-09-20",
  );
  const currentSource = publishedSource.replace("Original body.", "New body.");
  const cmsBase = {
    source: publishedSource,
    baseCommit: "a".repeat(40),
    baseFileHash: "b".repeat(40),
    publicationId: "8d9c853e-21e7-4aeb-adf2-2bfc9d3fe0de",
  };
  let payload: any;
  const publication = {
    mode: "direct",
    id: "41a75aab-8666-4e76-ad26-0e227199cbde",
    phase: "validate",
    version: 0,
    attempts: 0,
    dueAt: Date.now(),
    lease: null,
    leaseUntil: 0,
    blocked: null,
    checkpoint: {},
    publicationId: null,
    revision: 1,
    queue: { pending: 1, position: null, head: null, alarmAt: Date.now() },
    canCancel: true,
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/csrf")) return response({ csrf: "test-only" });
    if (url.includes("/baseline")) return response({ base: cmsBase });
    if (url.includes("/publish?")) {
      payload = JSON.parse(String(init?.body));
      return response({ publication });
    }
    return response({
      ...snapshot,
      publicationMode: "direct",
      base: cmsBase,
      draft: { ...draft, source: currentSource },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  await mount("", false);
  await click("Publish");
  await click("Approve and publish");
  await act(async () => {
    await vi.waitFor(() => expect(payload).toBeDefined());
  });
  expect(payload).toMatchObject({
    expectedRevision: 1,
    expectedPublicationId: cmsBase.publicationId,
    expectedBaselineSha256: await publicationSourceHash(publishedSource),
    reviewedSourceSha256: await publicationSourceHash(currentSource),
  });
  expect(fetcher.mock.calls.some(([url]) => url.includes("/baseline"))).toBe(
    true,
  );
  expect(host.textContent).not.toContain("GitHub");
});

it("explains a known direct publisher refusal instead of claiming an ambiguous send", async () => {
  const publishedSource = source.replace(
    "status: draft",
    "status: published\npublished_at: 2026-09-20",
  );
  const cmsBase = {
    ...snapshot.base,
    source: publishedSource,
    publicationId: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/baseline")) return response({ base: cmsBase });
      if (url.includes("/publish?"))
        return new Response(
          JSON.stringify({
            error: "legacy_publication_requires_reconciliation",
          }),
          { status: 409 },
        );
      if (url.includes("/publication?")) return response({ publication: null });
      return response({
        ...snapshot,
        publicationMode: "direct",
        base: cmsBase,
        draft: {
          ...draft,
          source: publishedSource.replace("Original body.", "Changed body."),
        },
      });
    }),
  );
  await mount("", false);
  await click("Publish");
  await click("Approve and publish");
  await act(async () => {
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("/publication?")),
      ).toBe(true),
    );
  });
  expect(host.textContent).toContain("previous publisher has unfinished work");
  expect(host.textContent).not.toContain("Couldn’t confirm publication");
});
