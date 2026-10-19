// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "./EditorialApp";

let root: Root;
let host: HTMLDivElement;
let rejectModule: (error: Error) => void;
type EditorModule = typeof import("./HomeEditor");
let loadModule: ReturnType<typeof vi.fn<() => Promise<EditorModule>>>;
let EditorialApp: typeof import("./EditorialApp").EditorialApp;
let navigation: typeof import("../../lib/editorial-navigation");
let session: typeof import("../../lib/protected-admin-json");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn());
  loadModule = vi.fn<() => Promise<EditorModule>>(
    () =>
      new Promise<EditorModule>((_resolve, reject) => {
        rejectModule = reject;
      }),
  );
  // Reject the actual dynamic import used by React.lazy, rather than throwing
  // from an already-loaded editor component.
  vi.doMock("./HomeEditor", loadModule);
  [{ EditorialApp }, navigation, session] = await Promise.all([
    import("./EditorialApp"),
    import("../../lib/editorial-navigation"),
    import("../../lib/protected-admin-json"),
  ]);
  window.history.replaceState(null, "", "/content/writing/test");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.doUnmock("./HomeEditor");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function failModule() {
  await act(async () =>
    root.render(
      <EditorialApp
        title="Writing"
        area="content"
        localPreview
        siteUrl="https://anipotts.com/"
        editorRecord={{ kind: "writing", id: "test" }}
      />,
    ),
  );
  expect(
    host.querySelector('[role="status"][aria-label="Loading editor"]'),
  ).not.toBeNull();
  expect(loadModule).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectModule(new Error("synthetic private error detail"));
  });
  expect(host.textContent).toContain("Editor could not load");
  expect(host.textContent).not.toContain("synthetic private error detail");
  expect(
    host.querySelector('[role="status"][aria-label="Loading editor"]'),
  ).toBeNull();
  expect(host.querySelector('[data-loading-region="body"]')).toBeNull();
}

it("contains a rejected editor import and offers a deliberate guarded document reload", async () => {
  const requested = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener(navigation.adminNavigationEvent, requested);
  try {
    await failModule();
    // The shell still provides its normal library navigation after the failure.
    expect(host.querySelector('a[href="/content/writing"]')).not.toBeNull();
    expect(host.querySelector('a[href="/content/projects"]')).not.toBeNull();
    expect(requested).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    const reload = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reload editor",
    );
    expect(reload).toBeTruthy();
    await act(async () => reload!.click());
    expect(requested).toHaveBeenCalledTimes(1);
    const event = requested.mock.calls[0]![0] as CustomEvent<string>;
    expect(event.detail).toBe(window.location.href);
    expect(event.defaultPrevented).toBe(true);
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener(navigation.adminNavigationEvent, requested);
  }
});

it("keeps session locking above a failed module rather than offering an editor retry", async () => {
  await failModule();
  await act(async () => session.lockProtectedSession("expired"));
  expect(host.textContent).toContain("Session ended");
  expect(host.textContent).toContain("Sign in again");
  expect(host.textContent).not.toContain("Reload editor");
  expect(host.textContent).not.toContain("Editor could not load");
  expect(loadModule).toHaveBeenCalledTimes(1);
});
