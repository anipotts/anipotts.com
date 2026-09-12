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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
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
it("trusts only the exact frame and current navigation for status and size", () => {
  const frame = render();
  const current = request(frame);
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
