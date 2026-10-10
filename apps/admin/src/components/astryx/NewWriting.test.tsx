import { jsonResponse } from "../../lib/test-json-response";
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Transform the shared SDK/Astryx graph during collection, before timed setup.
import "./NewWriting";
let AdminUIProvider: typeof import("../workspace/AdminUI").AdminUIProvider;
let NewWriting: typeof import("./NewWriting").NewWriting;
import { RECORD_CREATED_EVENT } from "../../lib/editorial-inventory-events";
import {
  clearEditorialRecovery,
  newWritingRecoveryKey,
  recoveryLogoutKey,
  readNewWritingRecovery,
} from "../../lib/draft-recovery";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
async function render(scope = "owner") {
  await act(async () => {
    root.render(
      <AdminUIProvider enabled mode="light">
        <NewWriting recoveryScope={scope} />
      </AdminUIProvider>,
    );
  });
}
/** The title: the create page's first, large field. */
const titleField = () => host.querySelector("textarea")!;
async function type(value: string) {
  const input = titleField();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.resetModules();
  ({ AdminUIProvider } = await import("../workspace/AdminUI"));
  ({ NewWriting } = await import("./NewWriting"));
  // The title grows with its text.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_key: string, _options: unknown, task: () => unknown) =>
        task(),
    },
  });
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("restores only the server-provided account and preserves legacy unscoped data without adopting it", async () => {
  sessionStorage.setItem(
    "editorial:new-writing",
    JSON.stringify({ title: "Legacy private text", slug: "legacy" }),
  );
  localStorage.setItem(
    newWritingRecoveryKey("other"),
    JSON.stringify({ title: "Other account", slug: "other" }),
  );
  await render();
  expect(titleField().value).toBe("");
  expect(sessionStorage.getItem("editorial:new-writing")).toContain(
    "Legacy private text",
  );
  await type("New draft");
  expect(
    readNewWritingRecovery(localStorage, newWritingRecoveryKey("owner"))!,
  ).toMatchObject({ title: "New draft", slug: "new-draft" });
  await render("other");
  expect(titleField().value).toBe("Other account");
  expect(
    readNewWritingRecovery(localStorage, newWritingRecoveryKey("owner"))!.title,
  ).toBe("New draft");
});
it("clears creation recovery on same-tab logout and does not repopulate it", async () => {
  await render();
  await type("Private title");
  await act(async () => {
    await clearEditorialRecovery(localStorage);
  });
  expect(localStorage.getItem(newWritingRecoveryKey("owner"))).toBeNull();
  expect(titleField()).toBeNull();
  expect(host.textContent).toContain("Session ended");
});
it("handles another tab's logout and ignores unrelated storage events", async () => {
  await render();
  await type("Private title");
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" })),
  );
  expect(titleField().value).toBe("Private title");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: recoveryLogoutKey }),
    ),
  );
  expect(titleField()).toBeNull();
});
it("blocks duplicate submissions and stops creation when logout happens during CSRF fetch", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  await render();
  await type("Private title");
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    await clearEditorialRecovery(localStorage);
  });
  await act(async () =>
    resolve(jsonResponse(JSON.stringify({ csrf: "test" }), { status: 200 })),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(newWritingRecoveryKey("owner"))).toBeNull();
});
it("retains creation operation identity after an ambiguous network failure", async () => {
  const ids: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("csrf"))
        return jsonResponse(JSON.stringify({ csrf: "test" }), { status: 200 });
      ids.push(JSON.parse(options!.body as string).requestId);
      throw new TypeError("Network unavailable");
    }),
  );
  await render();
  await type("Retry me");
  for (let count = 0; count < 2; count++) {
    if (count === 1) {
      await render("other");
      await render("owner");
      expect(titleField().value).toBe("Retry me");
      expect(ids).toHaveLength(1); // Recovery never submits a creation request.
    }
    await act(async () => {
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(
    readNewWritingRecovery(localStorage, newWritingRecoveryKey("owner"))!
      .request!.id,
  ).toBe(ids[0]);
  expect(titleField().value).toBe("Retry me");
});

it("downloads current creation fields and its ambiguous retry identity after storage denial", async () => {
  let requestId: string | undefined;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes("csrf"))
      return jsonResponse(JSON.stringify({ csrf: "test" }), { status: 200 });
    requestId = JSON.parse(String(options?.body)).requestId;
    throw new TypeError("synthetic network failure");
  });
  vi.stubGlobal("fetch", fetcher);
  await render();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("synthetic quota denial");
  });
  await type("Newest 雨 e\u0301 title");
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(requestId).toBeTruthy();
  const before = fetcher.mock.calls.length;
  const originalGetItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    name,
  ) {
    if (name.startsWith("editorial-recovery:v"))
      throw new Error("synthetic recovery read denial");
    return originalGetItem.call(this, name);
  });
  class DownloadURL extends URL {
    static createObjectURL = vi.fn(
      (_blob: Blob) => "blob:synthetic-current-copy",
    );
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", DownloadURL);
  const download = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await act(async () => {
    Array.from(host.querySelectorAll("button"))
      .find((button) => button.textContent === "Download recovery copies")!
      .click();
  });
  expect(download).toHaveBeenCalledOnce();
  const blob = DownloadURL.createObjectURL.mock.calls[0][0];
  const contents = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const bundle = JSON.parse(contents);
  expect(bundle.currentCopy).toEqual({
    key: newWritingRecoveryKey("owner"),
    kind: "new-writing",
    payload: {
      title: "Newest 雨 e\u0301 title",
      slug: "newest-e-title",
      customSlug: false,
      request: {
        key: JSON.stringify(["Newest 雨 e\u0301 title", "newest-e-title"]),
        id: requestId,
      },
    },
  });
  expect(bundle.storedStatus).toBe("unavailable");
  expect(fetcher.mock.calls).toHaveLength(before);
  vi.restoreAllMocks();
});

it("locks creation without offering plaintext download when storage denial prevents session admission", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("synthetic storage unavailable");
  });
  await render();
  expect(titleField()).toBeNull();
  expect(host.textContent).toContain("Session ended");
  expect(host.textContent).not.toContain("Download recovery copies");
  expect(fetcher).not.toHaveBeenCalled();
});

it("offers current-copy download when no recovery storage key was available", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await render("");
  await type("Current fields remain available");
  expect(host.textContent).toContain("Download recovery copies");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["expired", "logout"] as const)(
  "removes current-copy download when creation session is %s",
  async (reason) => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("synthetic quota denial");
    });
    await type("Private creation fields before lock");
    expect(host.textContent).toContain("Download recovery copies");
    const { lockProtectedSession } =
      await import("../../lib/protected-admin-json");
    await act(async () => lockProtectedSession(reason));
    expect(titleField()).toBeNull();
    expect(host.textContent).not.toContain("Download recovery copies");
    expect(host.textContent).not.toContain(
      "Private creation fields before lock",
    );
    expect(host.textContent).toContain("Session ended");
    vi.restoreAllMocks();
  },
);

it("refuses plaintext creation download after a persisted logout before its event arrives", async () => {
  await render();
  const originalSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("synthetic quota denial");
  });
  await type("Private creation fields before delayed logout");
  const action = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Download recovery copies",
  )!;
  class DownloadURL extends URL {
    static createObjectURL = vi.fn((_blob: Blob) => "blob:must-not-download");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", DownloadURL);
  originalSetItem.call(
    localStorage,
    recoveryLogoutKey,
    "synthetic-next-logout",
  );
  await act(async () => action.click());
  expect(DownloadURL.createObjectURL).not.toHaveBeenCalled();
  expect(titleField()).toBeNull();
  expect(host.textContent).toContain("Session ended");
});

it("announces the created draft so open libraries list it without a reload", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("csrf"))
        return jsonResponse(JSON.stringify({ csrf: "test" }), { status: 200 });
      return jsonResponse(
        JSON.stringify({
          ok: true,
          draft: {
            key: "content/public/writing/fresh-idea.md",
            source: "---\ntitle: Fresh idea\n---\n",
            revision: 1,
            updatedAt: Date.parse("2026-09-12T03:00:00Z"),
            discardedAt: null,
            baseCommit: "a".repeat(40),
            baseFileHash: null,
          },
        }),
        { status: 201 },
      );
    }),
  );
  const assign = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    assign,
  });
  const events: CustomEvent[] = [];
  const listen = (event: Event) => events.push(event as CustomEvent);
  window.addEventListener(RECORD_CREATED_EVENT, listen);
  try {
    await render();
    await type("Fresh idea");
    await act(async () => {
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toEqual({
      record: { kind: "writing", id: "fresh-idea" },
      title: "Fresh idea",
      summary: "",
      revision: 1,
      updatedAt: "2026-09-12T03:00:00.000Z",
    });
    expect(assign).toHaveBeenCalledWith("/content/writing/fresh-idea");
  } finally {
    window.removeEventListener(RECORD_CREATED_EVENT, listen);
    vi.restoreAllMocks();
  }
});

it("keeps project recovery separate and creates with project identity", async () => {
  await render();
  await type("Article retained");
  await act(async () =>
    root.render(<NewWriting recoveryScope="owner" recordKind="work" />),
  );
  expect(titleField().value).toBe("");
  expect(host.textContent).toContain("Project address");
  await type("New project");
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("csrf"))
        return jsonResponse(JSON.stringify({ csrf: "test" }));
      return jsonResponse(JSON.stringify({ ok: false }), { status: 409 });
    }),
  );
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(calls).toEqual([
    "/api/editorial/csrf",
    "/api/editorial/create?kind=work&id=new-project",
  ]);
  expect(host.textContent).toContain("A project already uses this address");
  await render();
  expect(titleField().value).toBe("Article retained");
  await act(async () =>
    root.render(<NewWriting recoveryScope="owner" recordKind="work" />),
  );
  expect(titleField().value).toBe("New project");
});

it.each(["network", "malformed"])(
  "reports an unconfirmed %s creation without exposing transport errors or losing retry identity",
  async (failure) => {
    const ids: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("csrf"))
          return jsonResponse(JSON.stringify({ csrf: "test" }));
        ids.push(JSON.parse(options!.body as string).requestId);
        if (failure === "network")
          throw new Error("PRIVATE transport diagnostic");
        return new Response("PRIVATE invalid response", { status: 200 });
      }),
    );
    await render();
    await type("Keep this draft");
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => {
        host
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(host.textContent).toContain("Couldn’t confirm draft creation");
      expect(host.textContent).not.toContain("PRIVATE");
      expect(host.textContent).not.toContain("Draft not created");
      expect(titleField().value).toBe("Keep this draft");
    }
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  },
);

it("does not restore recovery into a document locked before mount", async () => {
  const key = newWritingRecoveryKey("owner");
  localStorage.setItem(
    key,
    JSON.stringify({
      title: "Private preserved title",
      slug: "private",
      customSlug: false,
      request: null,
    }),
  );
  const { lockProtectedSession } =
    await import("../../lib/protected-admin-json");
  lockProtectedSession("expired");
  await render();
  expect(host.textContent).toContain("Session ended");
  expect(host.textContent).not.toContain("Private preserved title");
  expect(titleField()).toBeNull();
  expect(localStorage.getItem(key)).toContain("Private preserved title");
});

const createButton = () =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === "Create draft",
  )!;

it("shows explicit creation while typing and incidental blur only preserves browser recovery", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await render();
  expect(createButton().disabled).toBe(true);
  await type("Unfinished idea");
  expect(createButton().disabled).toBe(false);
  await act(async () => {
    titleField().focus();
    titleField().blur();
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    readNewWritingRecovery(localStorage, newWritingRecoveryKey("owner")),
  ).toMatchObject({ title: "Unfinished idea", slug: "unfinished-idea" });
});

it.each(["writing", "work"] as const)(
  "creates a private %s draft through the visible button using its generated address",
  async (recordKind) => {
    const onCreated = vi.fn();
    const fetcher = vi.fn(async (url: string) =>
      jsonResponse(
        JSON.stringify(url.includes("csrf") ? { csrf: "test" } : { ok: true }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await act(async () =>
      root.render(
        <NewWriting
          recoveryScope="owner"
          recordKind={recordKind}
          onCreated={onCreated}
        />,
      ),
    );
    await type("Fresh draft");
    await act(async () => {
      createButton().click();
      await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
    });
    expect(onCreated).toHaveBeenCalledWith({
      kind: recordKind,
      id: "fresh-draft",
    });
    expect(fetcher.mock.calls[1]![0]).toBe(
      `/api/editorial/create?kind=${recordKind}&id=fresh-draft`,
    );
  },
);

it("retains a custom address when title changes and Enter submits explicitly", async () => {
  const onCreated = vi.fn();
  const fetcher = vi.fn(async (url: string) =>
    jsonResponse(
      JSON.stringify(url.includes("csrf") ? { csrf: "test" } : { ok: true }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await act(async () =>
    root.render(<NewWriting recoveryScope="owner" onCreated={onCreated} />),
  );
  await type("Original name");
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Edit address"]')!
      .click(),
  );
  const address = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(address, "Custom address");
    address.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await type("New title");
  expect(address.value).toBe("custom-address");
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {
    titleField().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
  expect(onCreated).toHaveBeenCalledWith({
    kind: "writing",
    id: "custom-address",
  });
  expect(fetcher.mock.calls[1]![0]).toBe(
    "/api/editorial/create?kind=writing&id=custom-address",
  );
});
