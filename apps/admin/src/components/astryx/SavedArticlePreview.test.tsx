// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { SavedArticlePreview } from "./SavedArticlePreview";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  delete document.documentElement.dataset.theme;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});
function render(src = "/preview/record?kind=writing&id=post&revision=1") {
  act(() =>
    root.render(<SavedArticlePreview src={src} title="Draft preview" />),
  );
  return host.querySelector("iframe")!;
}
function request(frame: HTMLIFrameElement) {
  return new URL(frame.src).searchParams.get("previewRequest");
}
function send(
  frame: HTMLIFrameElement,
  data: object,
  source: MessageEventSource | null = frame.contentWindow,
) {
  act(() =>
    window.dispatchEvent(new MessageEvent("message", { source, data })),
  );
}
it("installs its message receiver before starting each frame navigation", () => {
  const add = window.addEventListener.bind(window);
  const observed: Array<string | null> = [];
  vi.spyOn(window, "addEventListener").mockImplementation(
    (type, listener, options) => {
      if (type === "message")
        observed.push(
          host.querySelector("iframe")?.getAttribute("src") ?? null,
        );
      add(type, listener, options);
    },
  );
  render();
  render("/preview/home?kind=page&id=home&revision=2");
  expect(observed).toEqual([null, null]);
  expect(host.querySelector("iframe")?.getAttribute("src")).toContain(
    "revision=2",
  );
});
it("trusts only the exact frame and current navigation for status and size", () => {
  const frame = render();
  const current = request(frame);
  expect(new URL(frame.src).searchParams.get("embedded")).toBe("1");
  send(frame, {
    type: "editorial-preview-status",
    request: current,
    status: Object.create(null),
  });
  expect(frame.hidden).toBe(true);
  send(
    frame,
    { type: "editorial-preview-status", request: current, status: "ready" },
    window,
  );
  expect(frame.hidden).toBe(true);
  send(frame, {
    type: "editorial-preview-status",
    request: "old",
    status: "ready",
  });
  expect(frame.hidden).toBe(true);
  send(frame, {
    type: "editorial-preview-status",
    request: current,
    status: "ready",
  });
  expect(frame.hidden).toBe(false);
  send(frame, {
    type: "editorial-preview-size",
    request: current,
    height: 1200.5,
  });
  expect(frame.style.height).toBe("1201px");
  send(frame, {
    type: "editorial-preview-size",
    request: current,
    height: Infinity,
  });
  expect(frame.style.height).toBe("1201px");
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
});
it("times out, retries with a new identity, and never remounts the frame", () => {
  const frame = render();
  const old = request(frame);
  act(() => vi.advanceTimersByTime(15000));
  expect(host.textContent).toContain("Preview unavailable");
  act(() => (host.querySelector("button") as HTMLButtonElement).click());
  expect(host.querySelector("iframe")).toBe(frame);
  expect(request(frame)).not.toBe(old);
  send(frame, {
    type: "editorial-preview-status",
    request: old,
    status: "ready",
  });
  expect(frame.hidden).toBe(true);
  send(frame, {
    type: "editorial-preview-status",
    request: request(frame),
    status: "ready",
  });
  expect(frame.hidden).toBe(false);
});
it("distinguishes stale revisions and ignores previous-src messages after navigation", () => {
  const frame = render();
  const old = request(frame);
  render("/preview/record?kind=writing&id=post&revision=2");
  send(frame, {
    type: "editorial-preview-status",
    request: old,
    status: "stale",
  });
  expect(host.textContent).toContain("Loading preview");
  send(frame, {
    type: "editorial-preview-status",
    request: request(frame),
    status: "stale",
  });
  expect(host.textContent).toContain("no longer matches");
});

it("passes the resolved parent dark theme even when the system is light", () => {
  document.documentElement.dataset.theme = "dark";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const frame = render();
  expect(new URL(frame.src).searchParams.get("theme")).toBe("dark");
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
});
it("renavigates on parent theme changes and rejects the previous render", async () => {
  document.documentElement.dataset.theme = "light";
  const frame = render();
  const previous = request(frame);
  await act(async () => {
    document.documentElement.dataset.theme = "dark";
    await Promise.resolve();
  });
  expect(new URL(frame.src).searchParams.get("theme")).toBe("dark");
  expect(request(frame)).not.toBe(previous);
  send(frame, {
    type: "editorial-preview-status",
    request: previous,
    status: "ready",
  });
  expect(frame.hidden).toBe(true);
  send(frame, {
    type: "editorial-preview-status",
    request: request(frame),
    status: "ready",
  });
  expect(frame.hidden).toBe(false);
});
it("follows system changes and cleans up its listener", () => {
  let change: (() => void) | undefined;
  const remove = vi.fn();
  const query = {
    matches: true,
    addEventListener: vi.fn((_name: string, listener: () => void) => {
      change = listener;
    }),
    removeEventListener: remove,
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  const frame = render();
  expect(new URL(frame.src).searchParams.get("theme")).toBe("dark");
  query.matches = false;
  act(() => change?.());
  expect(new URL(frame.src).searchParams.get("theme")).toBe("light");
  act(() => root.unmount());
  expect(remove).toHaveBeenCalledWith("change", change);
  root = createRoot(host);
});
