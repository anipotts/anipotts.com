// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EasternClock, RelativeTime } from "./Workspace";
import { sharedLiveClock } from "../../lib/live-clock";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
let desktop = false;
let changed: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-01T16:00:00Z"));
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  desktop = false;
  changed = undefined;
  vi.stubGlobal("matchMedia", () => ({
    matches: desktop,
    addEventListener: (_event: string, listener: () => void) => {
      changed = listener;
    },
    removeEventListener: () => {
      changed = undefined;
    },
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("stops ambient clock subscriptions below 1024 and restores them on desktop", () => {
  act(() => root.render(<EasternClock />));
  expect(host.querySelector("time")).toBeNull();
  expect(sharedLiveClock().running()).toBe(false);
  act(() => {
    desktop = true;
    changed?.();
  });
  expect(host.querySelector(".workspace-clock")).not.toBeNull();
  expect(sharedLiveClock().running()).toBe(true);
  act(() => {
    desktop = false;
    changed?.();
  });
  expect(host.querySelector("time")).toBeNull();
  expect(sharedLiveClock().running()).toBe(false);
});
it("retains live freshness when the ambient clock is hidden", () => {
  const at = Date.now() - 10_000;
  act(() =>
    root.render(
      <>
        <EasternClock />
        <RelativeTime value={at} />
      </>,
    ),
  );
  expect(host.querySelector(".workspace-clock")).toBeNull();
  expect(sharedLiveClock().running()).toBe(true);
  expect(host.textContent).toBe("10s ago");
  act(() => vi.advanceTimersByTime(2010));
  expect(host.textContent).toBe("12s ago");
});
