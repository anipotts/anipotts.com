// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  unlockRecoveryFixture,
  settleRecoveryFixture,
  readRecoveryFixture,
} from "../../../test/recovery-key-fixture";
import "./NewWriting";
let NewWriting: typeof import("./NewWriting").NewWriting;
let Provider: typeof import("../workspace/AdminUI").AdminUIProvider;
let navigation: typeof import("../../lib/editorial-navigation");
let recovery: typeof import("../../lib/draft-recovery");
let host: HTMLDivElement, root: Root;
const outstanding: (() => void)[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.resetModules();
  ({ NewWriting } = await import("./NewWriting"));
  ({ AdminUIProvider: Provider } = await import("../workspace/AdminUI"));
  navigation = await import("../../lib/editorial-navigation");
  recovery = await import("../../lib/draft-recovery");
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
  await unlockRecoveryFixture();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(async () => {
  for (const release of outstanding.splice(0)) release();
  await act(async () => {
    await settleRecoveryFixture();
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(kind: "writing" | "work" = "writing") {
  await act(async () => {
    root.render(
      <Provider enabled mode="light">
        <NewWriting
          recoveryScope="owner"
          recordKind={kind}
          back={{
            href: `/content/${kind === "work" ? "projects" : "writing"}`,
            label: "Back to library",
          }}
        />
      </Provider>,
    );
  });
  await act(async () => {
    await settleRecoveryFixture();
  });
}
async function title(value: string) {
  await act(async () => {
    const field = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function address(value: string) {
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Edit address"]')!
      .click();
  });
  await act(async () => {
    const field = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
function holdCrypto() {
  const entered = deferred(),
    held = deferred();
  outstanding.push(held.resolve);
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  let first = true;
  vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
    if (first) {
      first = false;
      entered.resolve();
      await held.promise;
    }
    return encrypt(...args);
  });
  return { entered: entered.promise, release: held.resolve };
}
function back() {
  const link = host.querySelector<HTMLAnchorElement>(
    'a[aria-label="Back to library"]',
  )!;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  return event.defaultPrevented;
}
it.each(["writing", "work"] as const)(
  "%s immediate Back waits for native crypto and preserves the exact custom address",
  async (kind) => {
    await mount(kind);
    const held = holdCrypto();
    await title("Keep this 雨 title");
    await held.entered;
    await address("exact-雨-address-");
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {
        root.render(<p>Library</p>);
      });
    await act(async () => {
      expect(back()).toBe(true);
    });
    expect(commit).not.toHaveBeenCalled();
    expect(unload()).toBe(true);
    expect(host.textContent).toContain("Keeping title before leaving");
    await act(async () => {
      held.release();
      await settleRecoveryFixture();
    });
    expect(commit).toHaveBeenCalledOnce();
    const key =
      kind === "work"
        ? recovery.newProjectRecoveryKey("owner")
        : recovery.newWritingRecoveryKey("owner");
    expect(await readRecoveryFixture(key, "new-writing")).toMatchObject({
      title: "Keep this 雨 title",
      slug: "exact-address-",
      customSlug: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("marks input unsafe inside the input event, before the write effect can await", async () => {
  await mount();
  let warnedInEvent = false;
  const listener = () => {
    warnedInEvent = unload();
  };
  document.addEventListener("input", listener);
  try {
    await title("Immediate unload");
  } finally {
    document.removeEventListener("input", listener);
  }
  expect(warnedInEvent).toBe(true);
  await act(async () => {
    await settleRecoveryFixture();
  });
  expect(unload()).toBe(false);
});
it("a completed older barrier cannot clear or navigate away from newer pending input", async () => {
  await mount();
  const first = holdCrypto();
  await title("Old title");
  await first.entered;
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  await act(async () => navigation.navigateAdmin("/content/writing"));
  await title("Newer title");
  // Hold the later ordinary write too, while allowing the old active write and
  // durable leave barrier to finish. This exposes stale unsafe-state clearing.
  const encrypt = vi.mocked(crypto.subtle.encrypt).getMockImplementation()!;
  const nextHeld = deferred(),
    nextEntered = deferred();
  outstanding.push(nextHeld.resolve);
  vi.mocked(crypto.subtle.encrypt).mockImplementation(async (...args) => {
    const chunk = JSON.parse(JSON.parse(new TextDecoder().decode(args[2]))) as {
      text?: string;
    };
    if (chunk.text && JSON.parse(chunk.text).payload?.title === "Newer title") {
      nextEntered.resolve();
      await nextHeld.promise;
    }
    return encrypt(...args);
  });
  await act(async () => {
    first.release();
    await nextEntered.promise;
  });
  expect(commit).not.toHaveBeenCalled();
  expect(unload()).toBe(true);
  expect(host.querySelector("textarea")!.value).toBe("Newer title");
  await act(async () => {
    nextHeld.resolve();
    await settleRecoveryFixture();
  });
  expect(unload()).toBe(false);
});
it("latest navigation intent wins while its durable recovery barrier is held", async () => {
  await mount();
  const held = holdCrypto();
  await title("Latest destination");
  await held.entered;
  const commit = vi
    .spyOn(navigation, "commitAdminNavigation")
    .mockImplementation(() => {});
  await act(async () => {
    navigation.navigateAdmin("/content/writing");
    navigation.navigateAdmin("/content/projects");
  });
  expect(commit).not.toHaveBeenCalled();
  await act(async () => {
    held.release();
    await settleRecoveryFixture();
  });
  expect(commit).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledWith("/content/projects");
});
it.each(["storage", "changed"] as const)(
  "%s recovery refusal keeps the form and unload warning",
  async (mode) => {
    await mount();
    const held = mode === "changed" ? holdCrypto() : null;
    if (mode === "storage")
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("synthetic quota");
      });
    await title("Retain this input");
    const foreign = JSON.stringify({
      title: "Other tab",
      slug: "other-tab",
      customSlug: false,
      request: null,
    });
    if (held) {
      await held.entered;
      localStorage.setItem(recovery.newWritingRecoveryKey("owner"), foreign);
    }
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    await act(async () => navigation.navigateAdmin("/content/writing"));
    await act(async () => {
      held?.release();
      await settleRecoveryFixture();
    });
    expect(commit).not.toHaveBeenCalled();
    expect(unload()).toBe(true);
    if (held)
      expect(
        localStorage.getItem(recovery.newWritingRecoveryKey("owner")),
      ).toBe(foreign);
    expect(host.querySelector("textarea")!.value).toBe("Retain this input");
    expect(host.textContent).toContain(
      "Resolve browser recovery before leaving this title",
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(["expired", "logout", "unmount"] as const)(
  "%s while encryption is held fences late navigation",
  async (reason) => {
    await mount();
    const held = holdCrypto();
    await title("Private pending input");
    await held.entered;
    const commit = vi
      .spyOn(navigation, "commitAdminNavigation")
      .mockImplementation(() => {});
    await act(async () => navigation.navigateAdmin("/content/writing"));
    await act(async () => {
      if (reason === "unmount") root.render(<p>Other view</p>);
      else {
        const { lockProtectedSession } =
          await import("../../lib/protected-admin-json");
        lockProtectedSession(reason);
      }
    });
    await act(async () => {
      held.release();
      await settleRecoveryFixture();
    });
    expect(commit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
