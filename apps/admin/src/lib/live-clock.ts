import { useSyncExternalStore } from "react";

/**
 * One ticking clock for every relative time on the page. A single timer
 * runs once a second while the tab is visible and anything is listening; it
 * stops when the tab hides and ticks at once when the tab shows again. Each
 * reader re-renders only when its own text changes, so a "3h ago" cell
 * renders once an hour even though the clock ticks every second.
 */
export const LIVE_CLOCK_TICK_MS = 1000;

type Options = {
  now?: () => number;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (timer: unknown) => void;
  isHidden?: () => boolean;
};

export function createLiveClock(options: Options = {}) {
  const now = options.now ?? (() => Date.now());
  const start =
    options.setInterval ?? ((callback, ms) => setInterval(callback, ms));
  const stop =
    options.clearInterval ??
    ((timer) => clearInterval(timer as ReturnType<typeof setInterval>));
  const isHidden =
    options.isHidden ??
    (() => typeof document !== "undefined" && document.hidden);
  const listeners = new Set<() => void>();
  let current = now();
  let timer: unknown = null;
  const tick = () => {
    current = now();
    for (const listener of listeners) listener();
  };
  const sync = () => {
    const run = listeners.size > 0 && !isHidden();
    if (run && timer === null) timer = start(tick, LIVE_CLOCK_TICK_MS);
    if (!run && timer !== null) {
      stop(timer);
      timer = null;
    }
  };
  const visibility = () => {
    if (!isHidden()) tick();
    sync();
  };
  // With nothing listening the clock is not ticking, so a first read takes
  // the time afresh (to the second, so repeated reads in one render agree).
  const read = () => {
    if (listeners.size === 0 && Math.abs(now() - current) >= 1000)
      current = now();
    return current;
  };
  return {
    now: read,
    subscribe(listener: () => void) {
      if (listeners.size === 0 && typeof document !== "undefined")
        document.addEventListener("visibilitychange", visibility);
      listeners.add(listener);
      current = now();
      sync();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof document !== "undefined")
          document.removeEventListener("visibilitychange", visibility);
        sync();
      };
    },
    /** Test seam: whether the one timer is running. */
    running: () => timer !== null,
    visibilityChanged: visibility,
  };
}

export type LiveClock = ReturnType<typeof createLiveClock>;

let shared: LiveClock | null = null;
export function sharedLiveClock(): LiveClock {
  shared ??= createLiveClock();
  return shared;
}

/**
 * The admin's one age formatter: "12s ago" under a minute, "5m ago" under an
 * hour, "3h ago" under a day, then "2d ago". A time in the future (clock
 * skew) reads "just now". `unit: "minute"` reads "just now" for the whole
 * first minute, for a line that should change at most once a minute.
 */
export function relativeAgo(
  at: number,
  now: number,
  unit: "second" | "minute" = "second",
): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < (unit === "minute" ? 60 : 5)) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const still = () => () => undefined;

/**
 * Text derived from the shared clock. The component re-renders only when the
 * derived text changes. `serverNow` keeps the server render and hydration in
 * step. A `fixed` time (a fixture read at its own moment, a test) never
 * subscribes, so nothing ticks.
 */
export function useLiveText(
  format: (now: number) => string,
  serverNow: number,
  fixed?: number,
  clock: LiveClock = sharedLiveClock(),
): string {
  return useSyncExternalStore(
    fixed === undefined ? clock.subscribe : still,
    () => format(fixed ?? clock.now()),
    () => format(fixed ?? serverNow),
  );
}
