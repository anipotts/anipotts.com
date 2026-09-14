// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SaveScheduler } from "../../lib/save-scheduler";
import { newWritingSource } from "../../lib/writing-draft";
import { HomeEditor } from "./HomeEditor";

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
  expect(host.textContent).toContain("Couldn’t start publishing");
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
  const inspect = [
    "Inspect",
    ["View source", "Version history", "Compare with website"],
  ];
  const draftActions = [
    "Open production editor",
    "Download draft",
    "Import draft…",
  ];
  let menu = await openMenu();
  expect(sections(menu)).toEqual([inspect, ["Draft", draftActions]]);
  expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(6);
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
  expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(7);
});
