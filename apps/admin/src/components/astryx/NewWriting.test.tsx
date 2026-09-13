// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewWriting } from "./NewWriting";
import {
  clearEditorialRecovery,
  newWritingRecoveryKey,
  recoveryLogoutKey,
} from "../../lib/draft-recovery";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
function render(scope = "owner") {
  act(() => root.render(<NewWriting recoveryScope={scope} />));
}
function type(value: string) {
  const input = host.querySelector("input")!;
  act(() => {
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
it("restores only the server-provided account and preserves legacy unscoped data without adopting it", () => {
  sessionStorage.setItem(
    "editorial:new-writing",
    JSON.stringify({ title: "Legacy private text", slug: "legacy" }),
  );
  localStorage.setItem(
    newWritingRecoveryKey("other"),
    JSON.stringify({ title: "Other account", slug: "other" }),
  );
  render();
  expect(host.querySelector("input")!.value).toBe("");
  expect(sessionStorage.getItem("editorial:new-writing")).toContain(
    "Legacy private text",
  );
  type("New draft");
  expect(
    JSON.parse(localStorage.getItem(newWritingRecoveryKey("owner"))!),
  ).toMatchObject({ title: "New draft", slug: "new-draft" });
  render("other");
  expect(host.querySelector("input")!.value).toBe("Other account");
  expect(
    JSON.parse(localStorage.getItem(newWritingRecoveryKey("owner"))!).title,
  ).toBe("New draft");
});
it("clears creation recovery on same-tab logout and does not repopulate it", () => {
  render();
  type("Private title");
  act(() => clearEditorialRecovery(localStorage));
  expect(localStorage.getItem(newWritingRecoveryKey("owner"))).toBeNull();
  expect(host.querySelector("input")!.value).toBe("");
  expect(host.querySelector("input")!.disabled).toBe(true);
  expect(host.textContent).toContain("Session ended");
});
it("handles another tab's logout and ignores unrelated storage events", () => {
  render();
  type("Private title");
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
  render();
  type("Private title");
  act(() => {
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
  render();
  type("Retry me");
  for (let count = 0; count < 2; count++) {
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
    JSON.parse(localStorage.getItem(newWritingRecoveryKey("owner"))!).request
      .id,
  ).toBe(ids[0]);
  expect(host.querySelector("input")!.value).toBe("Retry me");
});
