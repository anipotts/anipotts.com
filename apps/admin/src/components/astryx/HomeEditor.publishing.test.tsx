// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { newWritingSource } from "../../lib/writing-draft";
import { createHash, webcrypto } from "node:crypto";
import { HomeEditor } from "./HomeEditor";

const handoff = vi.hoisted(() => ({
  start: vi.fn(),
  stable: vi.fn(() => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
}));
vi.mock("../../lib/editorial-handoff-client", () => ({
  startEditorialHandoff: handoff.start,
  stableHandoffOperationId: handoff.stable,
  handoffSha256: async (value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));

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
  newWritingSource("Original title")
    .replace('summary: ""', 'summary: "A short summary"')
    .replace("status: draft", "status: published\npublished_at: 2026-09-12") +
  "Original body.";
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
  publicationMode: "direct",
  directPublication: {
    publicationId: "prior-published",
    revision: 1,
    sourceSha256: "b".repeat(64),
    publishedAt: "2026-09-12T00:00:00.000Z",
  },
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
  vi.stubGlobal("crypto", webcrypto);
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
  await click("Review changes");
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

it("publishes the reviewed revision, source hash and loaded pointer once despite duplicate clicks", async () => {
  let finish!: (value: Response) => void;
  const posts: any[] = [];
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
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.querySelector("button") && host.textContent).toContain(
        "Approve and publish",
      ),
    );
  });
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Approve and publish",
  )!;
  await act(async () => {
    button.click();
    button.click();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
  });
  expect(posts[0]).toMatchObject({
    expectedRevision: 1,
    expectedPublicationId: "prior-published",
    reviewedSourceSha256: createHash("sha256").update(source).digest("hex"),
    discloseSource: true,
  });
  await click("Back to editor");
  const laterTitle = host.querySelector(
    ".document-title textarea",
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(laterTitle, "Typed during publishing");
    laterTitle.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    finish(
      response({
        directPublication: {
          publicationId: "new-published",
          revision: 1,
          sourceSha256: posts[0].reviewedSourceSha256,
          publishedAt: "2026-09-12T01:00:00.000Z",
        },
        status: "published",
      }),
    ),
  );
  expect(posts).toHaveLength(1);
  expect(laterTitle.value).toBe("Typed during publishing");
});
it("opens production handoff while a dirty local save is still pending and retains edits on failure", async () => {
  let finish!: (value: Response) => void;
  let sourceSent = "";
  let savePending = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/save")) {
        savePending = true;
        sourceSent = JSON.parse(init!.body as string).source;
        return new Promise<Response>((resolve) => (finish = resolve));
      }
      return response(snapshot);
    }),
  );
  let payload: Promise<any> | undefined;
  handoff.start.mockImplementation((p: Promise<any>) => {
    payload = p;
    return p.then(() => {
      throw new Error("Popup closed");
    });
  });
  await mount("?view=review", true);
  const title = host.querySelector(".document-title textarea") as
    HTMLInputElement | HTMLTextAreaElement;
  expect(title).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      title instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(title, "New local title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (
      host.querySelector(
        'button[aria-label="Document actions"]',
      ) as HTMLButtonElement
    ).click();
  });
  const transfer = [...document.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent?.includes("Continue in production"),
  ) as HTMLElement;
  expect(transfer).toBeTruthy();
  await act(async () => transfer.click());
  expect(handoff.start).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.waitFor(() => expect(savePending).toBe(true));
  });
  expect(sourceSent).toContain("New local title");
  await act(async () => {
    finish(
      response({
        ok: true,
        draft: { ...draft, source: sourceSent, revision: 2 },
        valid: true,
      }),
    );
  });
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain("Popup closed"));
  });
  expect((await payload).source).toContain("New local title");
  expect((await payload).localRevision).toBe(2);
  expect(title.value).toBe("New local title");
});

it("retains the review and explains a blocked local publish", async () => {
  handoff.start.mockRejectedValue(
    new Error("Allow the production sign-in window, then retry publishing."),
  );
  await mount("?view=review", true);
  await click("Approve and publish");
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain(
        "Allow the production sign-in window, then retry publishing.",
      ),
    );
  });
  expect(
    host.querySelector('[aria-label="Reviewed source"]')?.textContent,
  ).toBe(source);
  expect(
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve and publish",
    )?.disabled,
  ).toBe(false);
});
