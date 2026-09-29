import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { adminDocumentBootstrap } from "../../src/lib/admin-document-bootstrap";
import { adminDocumentSessionKey } from "../../src/lib/admin-document-session";
import {
  recoveryLogoutGenerationKey,
  recoveryLogoutIntentKey,
} from "../../src/lib/browser-recovery";
let dom;
const key = recoveryLogoutGenerationKey;
const marker = "Synthetic private SSR sentinel";
function html({
  baseline = null,
  intent = null,
  failStorage = false,
  between = "",
} = {}) {
  dom = new JSDOM(
    `<!doctype html><html><head><script>${adminDocumentBootstrap("/data/records?kind=note")}<\/script>${between}</head><body><div data-admin-private-document style="display:contents"><astro-island props='{"private":"${marker}"}'><div>${marker}</div></astro-island></div></body></html>`,
    {
      url: "https://admin.anipotts.com/data/records",
      runScripts: "dangerously",
      beforeParse(window) {
        if (baseline !== null) window.localStorage.setItem(key, baseline);
        if (intent !== null)
          window.localStorage.setItem(recoveryLogoutIntentKey, intent);
        if (failStorage)
          Object.defineProperty(window, "localStorage", {
            get() {
              throw new Error("storage unavailable");
            },
          });
      },
    },
  );
  return dom.window[adminDocumentSessionKey];
}
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
async function consumer() {
  vi.resetModules();
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("CustomEvent", dom.window.CustomEvent);
  return import("../../src/lib/protected-admin-json");
}
afterEach(() => {
  dom?.window.close();
  vi.unstubAllGlobals();
});
it.each([null, "old"])(
  "latches a logout between head and late private body when baseline was %s",
  async (baseline) => {
    const state = html({
      baseline,
      between: `<script>localStorage.setItem(${JSON.stringify(key)},'new');window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(key)}}));<\/script>`,
    });
    await settle();
    expect(state.generation).toBe(baseline);
    expect(state.locked).toBe(true);
    expect(state.reason).toBe("logout");
    expect(dom.window.document.body.textContent).not.toContain(marker);
    expect(dom.window.document.querySelector("astro-island")).toBeNull();
    expect(
      dom.window.document
        .querySelector("[data-admin-session-reentry] a")
        ?.getAttribute("href"),
    ).toBe("/data/records?kind=note");
    const api = await consumer();
    expect(api.protectedSessionIsLocked()).toBe(true);
    const watcher = vi.fn();
    api.watchProtectedSession(watcher);
    expect(watcher).toHaveBeenCalledWith("logout");
    const fetcher = vi.fn();
    await expect(
      api.protectedAdminJson("/api/private-reader/credential", {}, fetcher),
    ).rejects.toMatchObject({ kind: "locked" });
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("removes later streamed SSR and island props before browser consumers bind", async () => {
  html();
  await settle();
  const state = dom.window[adminDocumentSessionKey];
  dom.window.localStorage.setItem(key, "new");
  dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key }));
  const root = dom.window.document.querySelector(
    "[data-admin-private-document]",
  );
  root.innerHTML = `<astro-island props='{"private":"${marker}"}'><div>${marker}</div></astro-island>`;
  await settle();
  expect(root.childNodes).toHaveLength(0);
  expect(state.generation).toBeNull();
  expect(dom.window.document.body.textContent).not.toContain(marker);
});
it("compares the head baseline even if the storage event was not delivered", async () => {
  const state = html();
  await settle();
  dom.window.localStorage.setItem(key, "new");
  const api = await consumer();
  expect(api.protectedSessionIsLocked()).toBe(true);
  expect(state.generation).toBeNull();
  await settle();
  expect(dom.window.document.body.textContent).not.toContain(marker);
});
it.each([null, "already-recorded"])(
  "admits a fresh document with unchanged generation %s",
  async (baseline) => {
    const state = html({ baseline });
    await settle();
    expect(state.locked).toBe(false);
    const api = await consumer();
    expect(api.protectedSessionIsLocked()).toBe(false);
    expect(dom.window.document.body.textContent).toContain(marker);
    const response = await api.protectedAdminJson(
      "/api/editorial/csrf",
      {},
      async () => Response.json({ csrf: "synthetic" }),
    );
    expect(await response.json()).toEqual({ csrf: "synthetic" });
  },
);
it("storage failure is unavailable custody rather than a fabricated logout", async () => {
  const state = html({ failStorage: true });
  await settle();
  expect(state.storageAvailable).toBe(false);
  expect(state.locked).toBe(true);
  expect(state.reason).toBe("locked");
  expect(dom.window.document.body.textContent).not.toContain(marker);
  const api = await consumer();
  const watcher = vi.fn();
  api.watchProtectedSession(watcher);
  expect(watcher).toHaveBeenCalledWith("locked");
});
it.each(["clear", "same-window", "bfcache"])(
  "latches %s before island loading, keeps recovery and blocks fresh requests",
  async (kind) => {
    const state = html({ baseline: "old" });
    await settle();
    dom.window.localStorage.setItem(
      "editorial-recovery:v2:synthetic",
      "Synthetic retained recovery",
    );
    if (kind === "clear") {
      dom.window.localStorage.removeItem(key);
      dom.window.dispatchEvent(
        new dom.window.StorageEvent("storage", { key: null }),
      );
    } else if (kind === "same-window")
      dom.window.dispatchEvent(new dom.window.Event(key));
    else {
      dom.window.dispatchEvent(
        new dom.window.PageTransitionEvent("pagehide", { persisted: true }),
      );
      dom.window.dispatchEvent(
        new dom.window.PageTransitionEvent("pageshow", { persisted: true }),
      );
    }
    expect(state.locked).toBe(true);
    const api = await consumer();
    const fetcher = vi.fn();
    await expect(
      api.protectedAdminJson("/api/editorial/record", {}, fetcher),
    ).rejects.toMatchObject({ kind: "locked" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      dom.window.localStorage.getItem("editorial-recovery:v2:synthetic"),
    ).toBe("Synthetic retained recovery");
  },
);
it("keeps a mounted browser tree inert while consumers perform their own teardown", async () => {
  const state = html();
  await settle();
  const api = await consumer();
  expect(api.protectedSessionIsLocked()).toBe(false);
  const watcher = vi.fn();
  api.watchProtectedSession(watcher);
  dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key }));
  const root = dom.window.document.querySelector(
    "[data-admin-private-document]",
  );
  expect(state.locked).toBe(true);
  expect(root.hasAttribute("inert")).toBe(true);
  expect(
    dom.window.document.documentElement.hasAttribute(
      "data-admin-document-locked",
    ),
  ).toBe(true);
  expect(watcher).toHaveBeenCalledWith("logout");
  await settle();
  expect(root.childNodes).toHaveLength(0);
  root.innerHTML = `<astro-island props='{"private":"${marker}"}'><div>${marker}</div></astro-island>`;
  await settle();
  expect(root.childNodes).toHaveLength(0);
  expect(dom.window.document.body.textContent).not.toContain(marker);
});
it("reconciles a missed logout event before a second admitted request and getter", async () => {
  html();
  await settle();
  const api = await consumer();
  expect(api.protectedSessionIsLocked()).toBe(false);
  dom.window.localStorage.setItem(key, "new");
  const fetcher = vi.fn();
  await expect(
    api.protectedAdminJson("/api/editorial/record", {}, fetcher),
  ).rejects.toMatchObject({ kind: "locked" });
  expect(fetcher).not.toHaveBeenCalled();
  expect(api.protectedSessionIsLocked()).toBe(true);
  await settle();
  expect(dom.window.document.body.textContent).not.toContain(marker);
});
it("rejects a late response and later JSON consumption when logout notification is missed", async () => {
  html();
  await settle();
  const api = await consumer();
  let complete;
  const pending = api.protectedAdminJson(
    "/api/editorial/record",
    {},
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  dom.window.localStorage.setItem(key, "new");
  complete(Response.json({ private: marker }));
  await expect(pending).rejects.toMatchObject({ kind: "locked" });
});
it("rechecks buffered JSON before its caller receives plaintext", async () => {
  html();
  await settle();
  const api = await consumer();
  const response = await api.protectedAdminJson(
    "/api/editorial/record",
    {},
    async () => Response.json({ private: marker }),
  );
  dom.window.localStorage.setItem(key, "new");
  await expect(response.json()).rejects.toMatchObject({ kind: "locked" });
});
it("gives mounted React its native unmount before physical purge, after synchronous custody teardown", async () => {
  html();
  await settle();
  const api = await consumer();
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { createElement, useEffect, useState, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const island = dom.window.document.querySelector("astro-island");
  const privateRoot = dom.window.document.querySelector(
    "[data-admin-private-document]",
  );
  const order = [];
  function Private() {
    const [title, setTitle] = useState(marker);
    useEffect(() => {
      const stop = api.watchProtectedSession(() => {
        order.push("custody teardown");
        dom.window.localStorage.setItem(
          "synthetic recovery buffer",
          "retained on expiry",
        );
        setTitle("");
      });
      return () => {
        order.push("react unmount");
        stop();
      };
    }, []);
    return createElement("div", null, title);
  }
  const root = createRoot(island);
  island.addEventListener("astro:unmount", () => root.unmount(), {
    once: true,
  });
  await act(async () => root.render(createElement(Private)));
  expect(privateRoot.textContent).toContain(marker);
  await act(async () => {
    dom.window.dispatchEvent(
      new dom.window.PageTransitionEvent("pagehide", { persisted: true }),
    );
    await settle();
  });
  expect(order).toEqual(["custody teardown", "react unmount"]);
  expect(privateRoot.childNodes).toHaveLength(0);
  expect(dom.window.localStorage.getItem("synthetic recovery buffer")).toBe(
    "retained on expiry",
  );
});
it("changes observed props only after native unmount and physical detach", async () => {
  html();
  await settle();
  const api = await consumer();
  expect(api.protectedSessionIsLocked()).toBe(false);
  let connectedPropChanges = 0;
  class Island extends dom.window.HTMLElement {
    static get observedAttributes() {
      return ["props"];
    }
    attributeChangedCallback() {
      if (this.isConnected) connectedPropChanges++;
    }
  }
  dom.window.customElements.define("astro-island", Island);
  connectedPropChanges = 0;
  const island = dom.window.document.querySelector("astro-island");
  let connectedAtUnmount = false;
  island.addEventListener("astro:unmount", () => {
    connectedAtUnmount = island.isConnected;
  });
  dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key }));
  await settle();
  expect(connectedAtUnmount).toBe(true);
  expect(island.isConnected).toBe(false);
  expect(island.hasAttribute("props")).toBe(false);
  expect(connectedPropChanges).toBe(0);
});

it("a new document opened during cleanup latches intent before any generation advance", async () => {
  const state = html({ intent: "active-local-cleanup" });
  await settle();
  expect(state.generation).toBeNull();
  expect(state.locked).toBe(true);
  expect(dom.window.document.body.textContent).not.toContain(marker);
  expect(
    dom.window.document
      .querySelector("[data-admin-session-reentry] a")
      .getAttribute("href"),
  ).toBe("/auth/logout");
  expect(
    dom.window.document.querySelector("[data-admin-session-reentry] a")
      .textContent,
  ).toBe("Finish sign out");
  const api = await consumer();
  const fetcher = vi.fn();
  await expect(
    api.protectedAdminJson("/api/private-reader/credential", {}, fetcher),
  ).rejects.toMatchObject({ kind: "locked" });
  dom.window.localStorage.removeItem(recoveryLogoutIntentKey);
  dom.window.dispatchEvent(
    new dom.window.StorageEvent("storage", { key: recoveryLogoutIntentKey }),
  );
  await settle();
  expect(state.locked).toBe(true);
  expect(
    dom.window.document.querySelector("[data-admin-session-reentry] a")
      .textContent,
  ).toBe("Sign in again");
  await expect(
    api.protectedAdminJson("/api/private-reader/credential", {}, fetcher),
  ).rejects.toMatchObject({ kind: "locked" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("existing documents latch intent creation even before logout generation changes", async () => {
  const state = html();
  const api = await consumer();
  const fetcher = vi.fn(
    async () =>
      new Response('{"ok":true}', {
        headers: { "content-type": "application/json" },
      }),
  );
  await api.protectedAdminJson("/api/editorial/record", {}, fetcher);
  dom.window.localStorage.setItem(recoveryLogoutIntentKey, "pending");
  // The transport reconciles intent even while the cross-tab event is delayed.
  await expect(
    api.protectedAdminJson("/api/editorial/record", {}, fetcher),
  ).rejects.toMatchObject({ kind: "locked" });
  await settle();
  expect(state.locked).toBe(true);
  expect(dom.window.document.body.textContent).not.toContain(marker);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("a fresh document after local transaction finish can reenter without granting server authority", async () => {
  const state = html({ baseline: "completed-local-generation" });
  await settle();
  expect(state.locked).toBe(false);
  const api = await consumer();
  const fetcher = vi.fn(
    async () =>
      new Response('{"error":"owner_required"}', {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  );
  await expect(
    api.protectedAdminJson("/api/editorial/record", {}, fetcher),
  ).rejects.toMatchObject({ kind: "expired" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(api.protectedSessionIsLocked()).toBe(true);
});
it("intent events latch an already parsed document even after another tab finished removal", async () => {
  const state = html();
  await settle();
  dom.window.dispatchEvent(
    new dom.window.StorageEvent("storage", {
      key: recoveryLogoutIntentKey,
      oldValue: "completed",
      newValue: null,
    }),
  );
  await settle();
  expect(state.locked).toBe(true);
  expect(dom.window.document.body.textContent).not.toContain(marker);
});
