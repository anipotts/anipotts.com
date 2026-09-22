// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { newProjectSource } from "../../lib/project-draft";
import { newWritingSource } from "../../lib/writing-draft";
import * as navigation from "../../lib/editorial-navigation";
import { HomeEditor } from "./HomeEditor";
import { useWorkspaceMemory } from "./EditorialWorkspaceShell";

function WorkspaceMemory() {
  useWorkspaceMemory("content");
  return null;
}
import { EditorialApp } from "./EditorialApp";
import { recoveryKey, draftRecovery } from "../../lib/draft-recovery";
import {
  versionedRecoveryKey,
  recoveryLogoutGenerationKey,
} from "../../lib/browser-recovery";

vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
const projectMedia = vi.hoisted(() => ({ props: null as any }));
vi.mock("./ProjectMedia", () => ({
  ProjectMedia: (props: any) => {
    projectMedia.props = props;
    return <div data-testid="project-media" />;
  },
}));
vi.mock("./ArticleBody", () => ({
  ArticleBody: ({
    value,
    resetGeneration,
    onChange,
    flushRef,
    onDirty,
  }: any) => {
    const latest = React.useRef(value);
    const dirty = React.useRef(false);
    const [display, setDisplay] = React.useState(value);
    React.useEffect(() => {
      latest.current = value;
      dirty.current = false;
      setDisplay(value);
    }, [value, resetGeneration]);
    // Match the real ArticleBody boundary: unchanged mounted content never serializes.
    flushRef.current = () => {
      if (dirty.current) {
        dirty.current = false;
        onChange(latest.current);
      }
    };
    return (
      <textarea
        aria-label="Test article body"
        value={display}
        onChange={(e) => {
          latest.current = e.target.value;
          dirty.current = true;
          setDisplay(e.target.value);
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
// Already public, so the review's visibility preparation leaves it unchanged.
const source =
  newWritingSource("Original title")
    .replace('summary: ""', 'summary: "A short summary"')
    .replace("status: draft", "status: published\npublished_at: 2026-09-20") +
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
  publication: null,
  publishing: "ready",
};
function response(data: unknown) {
  return new Response(JSON.stringify(data));
}
async function mount(search = "", localPreview = true, withIdentity = false) {
  window.history.replaceState(null, "", `/content/writing/test${search}`);
  await act(async () => {
    root.render(
      <>
        {withIdentity && <WorkspaceMemory />}
        <HomeEditor
          record={{ kind: "writing", id: "test" }}
          localPreview={localPreview}
        />
      </>,
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
    (el) =>
      el.textContent?.trim() === label ||
      el.getAttribute("aria-label") === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}
/** Opens the editor bar's overflow and chooses one of its items. */
async function menuItem(label: string) {
  await act(async () => {
    (
      host.querySelector(
        'button[aria-label="More actions"]',
      ) as HTMLButtonElement
    ).click();
  });
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (node) => node.textContent?.trim() === label,
  ) as HTMLElement | undefined;
  expect(item, label).toBeTruthy();
  await act(async () => item!.click());
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
  expect(host.querySelector('aside[aria-label="History"]')).not.toBeNull();
  const body = host.querySelector('textarea[aria-label="Test article body"]');
  await menuItem("Properties");
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
  await menuItem("Properties");
  const label = [...host.querySelectorAll("label")].find(
    (el) => el.textContent?.trim() === "Tags",
  );
  expect(label).toBeTruthy();
  const input = document.getElementById(label!.htmlFor) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "new-tag,");
    // A comma turns the typed text into a tag chip.
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
  await click("Publish now");
  await act(async () => {
    await vi.waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => url.includes("/csrf"))).toBe(
        true,
      ),
    );
  });
  // The review sheet's close returns to the editor.
  await click("Close panel");
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
  await click("Preview");
  await act(async () => {
    await vi.waitFor(() => expect(host.scrollTop).toBe(480));
  });
  expect(host.querySelector('textarea[aria-label="Test article body"]')).toBe(
    body,
  );
  expect(window.scrollTo).not.toHaveBeenCalled();
});

async function editBody(value: string) {
  const body = host.querySelector(
    'textarea[aria-label="Test article body"]',
  ) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(body, value);
    body.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it.each(["/life", "/cdn-cgi/access/logout"])(
  "links flush buffered edits once before navigating: %s",
  async (href) => {
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    let savedSource = "";
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/save?")) {
        savedSource = JSON.parse(String(options?.body)).source;
        return pending;
      }
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      return response(snapshot);
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await editBody("Buffered private edit.");
    const link = document.createElement("a");
    link.href = href;
    host.append(link);
    await act(async () => {
      link.click();
      link.click();
    });
    expect(commit).not.toHaveBeenCalled();
    expect(savedSource).toContain("Buffered private edit.");
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("/save?")),
    ).toHaveLength(1);
    await act(async () => {
      finish(
        response({
          ok: true,
          draft: { ...draft, source: savedSource, revision: 2 },
        }),
      );
      await pending;
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(
      new URL(href, window.location.href).href,
    );
  },
);

it.each(["palette", "logout"])(
  "%s navigation stays in the editor when its save fails",
  async (action) => {
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/save?")) throw new Error("offline");
        if (url.includes("/csrf")) return response({ csrf: "test-only" });
        return response(snapshot);
      }),
    );
    await mount();
    await editBody("Retain this offline edit.");
    await act(async () => {
      if (action === "palette")
        navigation.navigateAdmin("/operations/observability");
      else {
        const link = document.createElement("a");
        link.href = "/cdn-cgi/access/logout";
        host.append(link);
        link.click();
      }
    });
    expect(commit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Save them before leaving this draft");
    expect(
      (
        host.querySelector(
          'textarea[aria-label="Test article body"]',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Retain this offline edit.");
  },
);

it("typing during a navigation save keeps the newer buffer on screen", async () => {
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let savedSource = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/save?")) {
        savedSource = JSON.parse(String(options?.body)).source;
        return pending;
      }
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      return response(snapshot);
    }),
  );
  await mount();
  await editBody("First edit.");
  await act(async () => {
    navigation.navigateAdmin("/life");
  });
  await editBody("Newer edit while saving.");
  await act(async () => {
    finish(
      response({
        ok: true,
        draft: { ...draft, source: savedSource, revision: 2 },
      }),
    );
    await pending;
  });
  expect(commit).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Save them before leaving this draft");
  expect(
    (
      host.querySelector(
        'textarea[aria-label="Test article body"]',
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("Newer edit while saving.");
});
it.each(["loading", "failed"])(
  "allows workspace navigation while the initial editor is %s",
  async (mode) => {
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        mode === "loading"
          ? new Promise<Response>(() => {})
          : Promise.reject(new Error("unavailable")),
      ),
    );
    await act(async () => {
      root.render(
        <HomeEditor
          record={{ kind: "writing", id: "test" }}
          localPreview={true}
        />,
      );
    });
    expect(
      host.querySelector('textarea[aria-label="Test article body"]'),
    ).toBeNull();
    await act(async () => {
      navigation.navigateAdmin("/content");
    });
    expect(commit).toHaveBeenCalledWith("/content");
    expect(host.textContent).not.toContain("Couldn’t save before leaving");
  },
);
it.each(["loading", "failed"])(
  "allows ordinary same-origin links while the initial editor is %s",
  async (mode) => {
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        mode === "loading"
          ? new Promise<Response>(() => {})
          : Promise.reject(new Error("unavailable")),
      ),
    );
    await act(async () => {
      root.render(
        <HomeEditor
          record={{ kind: "writing", id: "test" }}
          localPreview={true}
        />,
      );
    });
    const anchor = document.createElement("a");
    anchor.href = "/life";
    anchor.textContent = "Life";
    host.append(anchor);
    await act(async () => anchor.click());
    expect(commit).toHaveBeenCalledWith(
      new URL("/life", window.location.origin).href,
    );
  },
);
it("keeps the document mounted and hidden inside its Astryx surface during preview", async () => {
  await mount();
  const body = host.querySelector('textarea[aria-label="Test article body"]')!;
  const surface = body.closest(".astryx-stack");
  expect(surface).not.toBeNull();
  await click("Preview");
  expect(body.closest("[hidden]")).not.toBeNull();
  expect((body.closest("[hidden]") as HTMLElement).style.display).toBe("none");
  await click("Preview");
  expect(host.querySelector('textarea[aria-label="Test article body"]')).toBe(
    body,
  );
  expect(body.closest("[hidden]")).toBeNull();
});

it("does not clear recovery when sign-out navigation is canceled", async () => {
  const key = recoveryKey("test-owner", { kind: "writing", id: "test" });
  localStorage.setItem(key, "recoverable private edit");
  await act(async () => {
    root.render(
      <EditorialApp
        title="Content"
        area="content"
        localPreview={false}
        siteUrl="https://anipotts.com/"
      />,
    );
  });
  const link = host.querySelector(
    'a[href="/auth/logout"]',
  ) as HTMLAnchorElement;
  expect(link).not.toBeNull();
  const cancel = (event: Event) => event.preventDefault();
  document.addEventListener("click", cancel);
  try {
    await act(async () => link.click());
    expect(localStorage.getItem(key)).toBe("recoverable private edit");
  } finally {
    document.removeEventListener("click", cancel);
  }
});

it("remembers pushed editor views and panels for the Content workspace", async () => {
  await mount("?theme=dark", true, true);
  await click("Preview");
  expect(sessionStorage.getItem("admin:navigation:content")).toBe(
    "/content/writing/test?view=preview",
  );
  expect(sessionStorage.getItem("admin:navigation:content")).toContain(
    "view=preview",
  );
  await menuItem("Properties");
  expect(sessionStorage.getItem("admin:navigation:content")).toContain(
    "panel=properties",
  );
  await click("Close panel");
  expect(sessionStorage.getItem("admin:navigation:content")).not.toContain(
    "panel=",
  );
  expect(sessionStorage.getItem("admin:navigation:content")).toContain(
    "view=preview",
  );
});

it.each(
  ["", "?view=review", "?view=preview", "?panel=history"].flatMap((search) => [
    { search, sameSource: true },
    { search, sameSource: false },
  ]),
)(
  "reopens $search with recovered source (server matches: $sameSource) without autosaving and preserves its pending request",
  async ({ search, sameSource }) => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (_key: string, _options: unknown, task: () => unknown) =>
          task(),
      },
    });
    const key = recoveryKey("recovery-owner", { kind: "writing", id: "test" });
    const exact = source.replaceAll("\n", "\r\n") + "\r\n雨 e\u0301";
    const pending = {
      source: exact,
      expectedRevision: 1,
      requestId: "11111111-1111-4111-8111-111111111111",
    };
    const savedRecovery = {
      source: exact,
      saved: "prior baseline\r\n",
      revision: 1,
      pending,
    };
    localStorage.setItem(key, JSON.stringify(savedRecovery));
    const writes: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("/csrf")) return response({ csrf: "synthetic" });
        if (options?.method === "POST") {
          writes.push({ url, body: JSON.parse(options.body as string) });
          return response({
            ok: true,
            draft: { ...draft, source: exact, revision: 2 },
          });
        }
        return response({
          ...snapshot,
          recoveryScope: "recovery-owner",
          draft: { ...draft, source: sameSource ? exact : source },
        });
      }),
    );
    await mount(search);
    expect(host.textContent).toContain("Recovered edits are ready to review");
    await act(async () => {
      await new Promise((done) => setTimeout(done, 700));
    });
    expect(writes).toEqual([]);
    expect(localStorage.getItem(key)).toBe(JSON.stringify(savedRecovery));
    await click("Save recovered edits");
    expect(writes).toHaveLength(1);
    expect(writes[0].url).toContain("/save?");
    expect(writes[0].body).toEqual(pending);
    expect(
      JSON.parse(localStorage.getItem(versionedRecoveryKey(key))!).payload,
    ).toBeNull();
  },
);
it("preserves opaque recovery and renders a bounded explanation instead of replacing it with server text", async () => {
  const key = recoveryKey("recovery-owner", { kind: "writing", id: "test" });
  const raw = JSON.stringify({ version: 99, source: "private future copy" });
  localStorage.setItem(versionedRecoveryKey(key), raw);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({ ...snapshot, recoveryScope: "recovery-owner" }),
    ),
  );
  await mount();
  expect(host.textContent).toContain("This browser copy needs a newer editor");
  expect(host.textContent).toContain("Download stored recovery");
  expect(host.textContent).not.toContain("private future copy");
  expect(localStorage.getItem(versionedRecoveryKey(key))).toBe(raw);
});
it("offers divergent old-tab recovery explicitly and does not save the selection", async () => {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_key: string, _options: unknown, task: () => unknown) =>
        task(),
    },
  });
  const key = recoveryKey("recovery-owner", { kind: "writing", id: "test" });
  const initial = { source, saved: source, revision: 1, pending: null };
  localStorage.setItem(key, JSON.stringify(initial));
  const channel = draftRecovery(localStorage, key);
  channel.read();
  await channel.write(initial);
  const olderTab = {
    ...initial,
    source: source + "\r\nRecovered from old tab 雨",
  };
  localStorage.setItem(key, JSON.stringify(olderTab));
  const fetcher = vi.fn(async () =>
    response({ ...snapshot, recoveryScope: "recovery-owner" }),
  );
  vi.stubGlobal("fetch", fetcher);
  await mount();
  expect(host.textContent).toContain("Another tab changed browser recovery");
  await click("Recover older tab copy");
  expect(
    host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Test article body"]',
    )!.value,
  ).toContain("Recovered from old tab 雨");
  expect(host.textContent).toContain("Recovered edits are ready to review");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(key)).toBe(JSON.stringify(olderTab));
});

it("does not replay recovery from before an old-tab logout when no event was received", async () => {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_key: string, _options: unknown, task: () => unknown) =>
        task(),
    },
  });
  const key = recoveryKey("recovery-owner", { kind: "writing", id: "test" });
  const previous = draftRecovery(localStorage, key);
  previous.read();
  await previous.write({
    source: source + "\nText from before logout",
    saved: source,
    revision: 1,
    pending: null,
  });
  previous.close();
  localStorage.setItem(
    recoveryLogoutGenerationKey,
    "logged-out-in-old-browser-tab",
  );
  const raw = localStorage.getItem(versionedRecoveryKey(key));
  const fetcher = vi.fn(async () =>
    response({ ...snapshot, recoveryScope: "recovery-owner" }),
  );
  vi.stubGlobal("fetch", fetcher);
  await mount();
  expect(host.textContent).toContain(
    "This stored copy belongs to a session that was signed out",
  );
  expect(host.textContent).not.toContain("Recovered edits are ready to review");
  expect(
    host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Test article body"]',
    )!.value,
  ).not.toContain("Text from before logout");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(versionedRecoveryKey(key))).toBe(raw);
});

it("opening note is multiline and survives saving before breadcrumb navigation", async () => {
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  let savedSource = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/save?")) {
        savedSource = JSON.parse(String(options?.body)).source;
        return response({
          ok: true,
          draft: { ...draft, source: savedSource, revision: 2 },
        });
      }
      return response(snapshot);
    }),
  );
  await mount();
  const label = [...host.querySelectorAll("label")].find((el) =>
    el.textContent?.includes("Opening note"),
  );
  const opening = document.getElementById(
    label!.htmlFor,
  ) as HTMLTextAreaElement;
  expect(opening.tagName).toBe("TEXTAREA");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(
      opening,
      "A real conversation prompted this.\nI wanted to keep a note.",
    );
    opening.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const link = document.createElement("a");
  link.href = "/content?group=writing&q=awareness";
  host.append(link);
  await act(async () => link.click());
  expect(savedSource).toContain("A real conversation prompted this.");
  expect(savedSource).toContain("I wanted to keep a note.");
  expect(savedSource).toContain("Original body.");
  expect(commit).toHaveBeenCalledOnce();
});

it("holds project navigation and unload while media is pending", async () => {
  const projectSource = newProjectSource("example", "Example");
  vi.mocked(fetch).mockImplementation(async () =>
    response({
      ...snapshot,
      base: { ...snapshot.base, source: projectSource },
      draft: {
        ...draft,
        key: "content/public/projects/example.md",
        source: projectSource,
      },
      history: [],
    }),
  );
  window.history.replaceState(null, "", "/content/projects/example");
  await act(async () =>
    root.render(
      <HomeEditor record={{ kind: "work", id: "example" }} localPreview />,
    ),
  );
  expect(host.querySelector('[data-testid="project-media"]')).not.toBeNull();
  act(() => projectMedia.props.onPendingChange(true));
  await menuItem("Properties");
  expect(host.querySelector('aside[aria-label="Properties"]')).toBeNull();
  expect(host.textContent).toContain(
    "Finish uploading or close the image crop",
  );
  const unload = new Event("beforeunload", { cancelable: true });
  act(() => window.dispatchEvent(unload));
  expect(unload.defaultPrevented).toBe(true);
  act(() => {
    window.history.replaceState(
      null,
      "",
      "/content/projects/example?view=preview",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(window.location.search).not.toContain("view=preview");
  act(() => projectMedia.props.onPendingChange(false));
  await menuItem("Properties");
  expect(host.querySelector('aside[aria-label="Properties"]')).not.toBeNull();
});

it("loads older revisions with the server cursor and retains history through a failed page retry", async () => {
  let failOlder = true;
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      if (url.includes("/csrf")) return response({ csrf: "test-only" });
      if (url.includes("/history")) {
        if (url.includes("beforeRevision=3")) {
          if (failOlder) return new Response(null, { status: 503 });
          return response({
            history: [{ ...draft, revision: 2 }, draft],
            nextBeforeRevision: null,
          });
        }
        return response({
          history: [{ ...draft, revision: 3 }],
          nextBeforeRevision: 3,
        });
      }
      return response({
        ...snapshot,
        history: [{ ...draft, revision: 3 }],
        nextBeforeRevision: 3,
      });
    }),
  );
  await mount("?panel=history");
  const originalBody = (
    host.querySelector(
      'textarea[aria-label="Test article body"]',
    ) as HTMLTextAreaElement
  ).value;
  await click("Load older revisions");
  expect(host.textContent).toContain("Couldn’t load history");
  expect(host.textContent).toContain("r3");
  failOlder = false;
  await click("Try again");
  expect(host.textContent).toContain("r3");
  expect(host.textContent).toContain("r2");
  expect(host.textContent).toContain("r1");
  expect(host.textContent).not.toContain("Load older revisions");
  expect(
    requested.filter((url) => url.includes("beforeRevision=3")),
  ).toHaveLength(2);
  expect(
    (
      host.querySelector(
        'textarea[aria-label="Test article body"]',
      ) as HTMLTextAreaElement
    ).value,
  ).toBe(originalBody);
});
