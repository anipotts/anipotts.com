// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewWriting } from "./NewWriting";
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
    root.render(<NewWriting recoveryScope={scope} />);
  });
}
async function type(value: string) {
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
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
  expect(host.querySelector("input")!.value).toBe("");
  expect(sessionStorage.getItem("editorial:new-writing")).toContain(
    "Legacy private text",
  );
  await type("New draft");
  expect(
    readNewWritingRecovery(localStorage, newWritingRecoveryKey("owner"))!,
  ).toMatchObject({ title: "New draft", slug: "new-draft" });
  await render("other");
  expect(host.querySelector("input")!.value).toBe("Other account");
  expect(
    readNewWritingRecovery(localStorage, newWritingRecoveryKey("owner"))!.title,
  ).toBe("New draft");
});
it("clears creation recovery on same-tab logout and does not repopulate it", async () => {
  await render();
  await type("Private title");
  act(() => clearEditorialRecovery(localStorage));
  expect(localStorage.getItem(newWritingRecoveryKey("owner"))).toBeNull();
  expect(host.querySelector("input")!.value).toBe("");
  expect(host.querySelector("input")!.disabled).toBe(true);
  expect(host.textContent).toContain("Session ended");
});
it("handles another tab's logout and ignores unrelated storage events", async () => {
  await render();
  await type("Private title");
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" })),
  );
  expect(host.querySelector("input")!.value).toBe("Private title");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: recoveryLogoutKey }),
    ),
  );
  expect(host.querySelector("input")!.value).toBe("");
  expect(host.querySelector("input")!.disabled).toBe(true);
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
  act(() => clearEditorialRecovery(localStorage));
  await act(async () =>
    resolve(new Response(JSON.stringify({ csrf: "test" }), { status: 200 })),
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
        return new Response(JSON.stringify({ csrf: "test" }), { status: 200 });
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
      expect(host.querySelector("input")!.value).toBe("Retry me");
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
  expect(host.querySelector("input")!.value).toBe("Retry me");
});

it("announces the created draft so open libraries list it without a reload", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("csrf"))
        return new Response(JSON.stringify({ csrf: "test" }), { status: 200 });
      return new Response(
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
  expect(host.querySelector("input")!.value).toBe("");
  expect(host.textContent).toContain("Project address");
  await type("New project");
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("csrf"))
        return new Response(JSON.stringify({ csrf: "test" }));
      return new Response(JSON.stringify({ ok: false }), { status: 409 });
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
  expect(host.querySelector("input")!.value).toBe("Article retained");
  await act(async () =>
    root.render(<NewWriting recoveryScope="owner" recordKind="work" />),
  );
  expect(host.querySelector("input")!.value).toBe("New project");
});

it.each(["network", "malformed"])(
  "reports an unconfirmed %s creation without exposing transport errors or losing retry identity",
  async (failure) => {
    const ids: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("csrf"))
          return new Response(JSON.stringify({ csrf: "test" }));
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
      expect(host.querySelector("input")!.value).toBe("Keep this draft");
    }
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  },
);
