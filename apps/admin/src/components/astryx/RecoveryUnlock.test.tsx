// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
let RecoveryUnlock: typeof import("./RecoveryUnlock").RecoveryUnlock;
let AdminUIProvider: typeof import("../workspace/Workspace").AdminUIProvider;
let downloaded: Blob | undefined;
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  downloaded = undefined;
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  class DownloadURL extends URL {
    static createObjectURL = vi.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:synthetic-key";
    });
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", DownloadURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  ({ RecoveryUnlock } = await import("./RecoveryUnlock"));
  ({ AdminUIProvider } = await import("../workspace/Workspace"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(
  scope: string | undefined = "synthetic-owner",
  enabled = false,
) {
  await act(async () =>
    root.render(
      <AdminUIProvider enabled={enabled} mode="light">
        <RecoveryUnlock scope={scope}>
          <textarea aria-label="Synthetic authoring" />
        </RecoveryUnlock>
      </AdminUIProvider>,
    ),
  );
}
async function create() {
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.textContent === "Create a new recovery key",
  )!;
  await act(async () => {
    button.click();
    await vi.waitFor(() => expect(Boolean(downloaded)).toBe(true));
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Synthetic file unreadable"));
    reader.readAsText(downloaded!);
  });
}
async function choose(raw: string) {
  const file = new File([raw], "synthetic-recovery-key.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(raw) });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(!input.isConnected || !input.disabled).toBe(true);
  });
}
it.each([false, true])(
  "keeps authoring gated through native saved-file re-import (workspace pilot=%s)",
  async (enabled) => {
    await mount("synthetic-owner", enabled);
    expect(Boolean(host.querySelector('[data-admin-ui="openai"]'))).toBe(
      enabled,
    );
    const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(picker.labels?.[0]?.textContent).toContain("Recovery key file");
    expect(picker.accept).toBe("application/json,.json");
    expect(picker.disabled).toBe(false);
    expect(host.querySelector("h1")?.textContent).toBe(
      "Unlock browser recovery",
    );
    expect(Boolean(host.querySelector('button[data-size="lg"]'))).toBe(enabled);
    expect(host.querySelector("textarea")).toBeNull();
    const raw = await create();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Choose the key file you just saved");
    expect(
      Boolean(
        host.querySelector('[data-actions-placement][data-color="info"]'),
      ),
    ).toBe(enabled);
    await choose(raw);
    await act(async () => {
      await vi.waitFor(() =>
        expect(Boolean(host.querySelector("textarea"))).toBe(true),
      );
    });
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toBe(
      "Synthetic authoring",
    );
    expect(Object.keys(localStorage)).toEqual([]);
  },
);
it("refuses a different setup file and never removes stranded ciphertext when a new key is explicitly chosen", async () => {
  const prior =
    'editorial-recovery:v3:["synthetic-owner","writing","older","' +
    "a".repeat(64) +
    '"]';
  localStorage.setItem(prior, "opaque stranded bytes");
  await mount();
  const raw = await create();
  const { createBrowserRecoveryKeyFile } =
    await import("../../lib/browser-recovery-encryption");
  await choose(await createBrowserRecoveryKeyFile());
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain("This key does not match"),
    );
  });
  expect(host.querySelector("textarea")).toBeNull();
  await choose(raw);
  await act(async () => {
    await vi.waitFor(() =>
      expect(Boolean(host.querySelector("textarea"))).toBe(true),
    );
  });
  expect(localStorage.getItem(prior)).toBe("opaque stranded bytes");
});
it("does not unlock an ended Access document or expose authoring without a server owner scope", async () => {
  await mount();
  const raw = await create();
  const { lockProtectedSession } =
    await import("../../lib/protected-admin-json");
  await act(async () => lockProtectedSession("expired"));
  await choose(raw);
  expect(host.querySelector("textarea")).toBeNull();
  await act(async () =>
    root.render(
      <RecoveryUnlock>
        <textarea aria-label="Synthetic authoring" />
      </RecoveryUnlock>,
    ),
  );
  expect(host.querySelector("textarea")).toBeNull();
});
it("keeps setup controls disabled in server markup until hydration installs handlers", async () => {
  act(() => root.unmount());
  const page = (
    <RecoveryUnlock scope="synthetic-owner">
      <textarea aria-label="Synthetic authoring" />
    </RecoveryUnlock>
  );
  host.innerHTML = renderToString(page);
  expect(
    host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
  ).toBe(true);
  expect(
    [...host.querySelectorAll("button")].every((button) => button.disabled),
  ).toBe(true);
  host.querySelector("button")!.click();
  expect(Boolean(downloaded)).toBe(false);
  await act(async () => {
    root = hydrateRoot(host, page);
  });
  expect(
    host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
  ).toBe(false);
  expect(host.querySelector("textarea")).toBeNull();
});
it.each([
  ["canonical", false],
  ["capture", false],
  ["canonical", true],
  ["capture", true],
] as const)(
  "hydrates deterministic server markup before showing existing %s recovery copies (workspace pilot=%s)",
  async (variant, enabled) => {
    act(() => root.unmount());
    const key =
      'editorial-recovery:v3:["synthetic-owner","writing","older","' +
      "a".repeat(64) +
      '"]';
    const raw = "opaque stored bytes";
    const storedKey =
      variant === "capture" ? `${key}:capture:${crypto.randomUUID()}` : key;
    localStorage.setItem(storedKey, raw);
    const page = (
      <AdminUIProvider enabled={enabled} mode="light">
        <RecoveryUnlock scope="synthetic-owner">
          <textarea aria-label="Synthetic authoring" />
        </RecoveryUnlock>
      </AdminUIProvider>
    );
    const browserWindow = window;
    try {
      vi.stubGlobal("window", undefined);
      host.innerHTML = renderToString(page);
    } finally {
      vi.stubGlobal("window", browserWindow);
    }
    expect(host.textContent).not.toContain("Download opaque recovery copies");
    const onRecoverableError = vi.fn();
    const onUncaughtError = vi.fn();
    await act(async () => {
      root = hydrateRoot(host, page, { onRecoverableError, onUncaughtError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(onUncaughtError).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Download opaque recovery copies");
    expect(localStorage.getItem(storedKey)).toBe(raw);
    expect(host.querySelector("textarea")).toBeNull();
  },
);
it("ignores a late first file selection after the latest re-import has unlocked", async () => {
  await mount();
  const raw = await create();
  let finish!: (value: string) => void;
  const stale = new File(["synthetic"], "stale.json");
  Object.defineProperty(stale, "text", {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [stale] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  await choose(raw);
  await act(async () => {
    await vi.waitFor(() =>
      expect(Boolean(host.querySelector("textarea"))).toBe(true),
    );
  });
  await act(async () => finish("{late invalid bytes"));
  expect(Boolean(host.querySelector("textarea"))).toBe(true);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("cancels pending native key generation on unmount and ignores a second synchronous setup click", async () => {
  await mount();
  const { recoverySession } =
    await import("../../lib/browser-recovery-session");
  const nativeDigest = vi.spyOn(crypto.subtle, "digest");
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.textContent === "Create a new recovery key",
  )!;
  await act(async () => {
    button.click();
    button.click();
    expect(nativeDigest).toHaveBeenCalledTimes(1);
    const pendingNativeGeneration = nativeDigest.mock.results[0]!.value;
    root.unmount();
    await pendingNativeGeneration;
    await Promise.resolve();
  });
  expect(Boolean(downloaded)).toBe(false);
  expect(recoverySession().vault.state.status).toBe("locked");
  expect(Object.keys(localStorage)).toEqual([]);
});

it("discovers capture-only key identities, refuses unrelated keys and exports exact owner-scoped opaque copies after key loss", async () => {
  const { createBrowserRecoveryKeyFile } =
    await import("../../lib/browser-recovery-encryption");
  const file = await createBrowserRecoveryKeyFile();
  const keyId = JSON.parse(file).keyId as string;
  const key = `editorial-recovery:v3:${JSON.stringify(["synthetic-owner", "writing", "only-capture", keyId])}:capture:${crypto.randomUUID()}`;
  const foreign = `editorial-recovery:v3:${JSON.stringify(["other-owner", "writing", "only-capture", keyId])}:capture:${crypto.randomUUID()}`;
  const raw = "{opaque captured bytes\r\n";
  localStorage.setItem(key, raw);
  localStorage.setItem(foreign, "foreign owner bytes");
  const before = { ...localStorage };
  await mount();
  expect(host.textContent).toContain("Download opaque recovery copies");
  await choose(await createBrowserRecoveryKeyFile());
  expect(host.textContent).toContain("This key does not match");
  expect(host.querySelector("textarea")).toBeNull();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "I no longer have the key")!
      .click(),
  );
  expect(host.textContent).toContain("Earlier encrypted copies are preserved");
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find(
        (button) => button.textContent === "Download opaque recovery copies",
      )!
      .click(),
  );
  expect(Boolean(downloaded)).toBe(true);
  const exported = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Synthetic opaque export unreadable"));
    reader.readAsText(downloaded!);
  });
  expect(JSON.parse(exported).entries).toEqual({ [key]: raw });
  expect({ ...localStorage }).toEqual(before);
  await choose(file);
  expect(Boolean(host.querySelector("textarea"))).toBe(true);
});
