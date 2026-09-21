import { describe, expect, it } from "vitest";
import { LIVE_CLOCK_TICK_MS, createLiveClock, relativeAgo } from "./live-clock";

const T = Date.parse("2026-09-21T18:00:00Z");

describe("relative time text", () => {
  it.each([
    [0, "just now"],
    [4_000, "just now"],
    [12_000, "12s ago"],
    [59_000, "59s ago"],
    [60_000, "1m ago"],
    [59 * 60_000, "59m ago"],
    [60 * 60_000, "1h ago"],
    [23 * 3_600_000, "23h ago"],
    [24 * 3_600_000, "1d ago"],
    [9 * 86_400_000, "9d ago"],
    [-30_000, "just now"],
  ])("%i ms reads %s", (age, text) => {
    expect(relativeAgo(T - age, T)).toBe(text);
  });

  it("changes every second under a minute, every minute under an hour, then hourly", () => {
    const changes = (from: number, to: number, step: number) => {
      let count = 0;
      let last = relativeAgo(T, T + from);
      for (let t = from + step; t <= to; t += step) {
        const next = relativeAgo(T, T + t);
        if (next !== last) count += 1;
        last = next;
      }
      return count;
    };
    // 10 s to 20 s: ten changes, one a second.
    expect(changes(10_000, 20_000, 1_000)).toBe(10);
    // 5 min to 10 min, sampled every second: five changes, one a minute.
    expect(changes(5 * 60_000, 10 * 60_000, 1_000)).toBe(5);
    // 2 h to 5 h, sampled every minute: three changes, one an hour.
    expect(changes(2 * 3_600_000, 5 * 3_600_000, 60_000)).toBe(3);
  });
});

describe("the shared clock", () => {
  function fake() {
    let now = T;
    let hidden = false;
    const intervals = new Set<number>();
    let next = 0;
    const callbacks = new Map<number, () => void>();
    const clock = createLiveClock({
      now: () => now,
      isHidden: () => hidden,
      setInterval: (callback, ms) => {
        expect(ms).toBe(LIVE_CLOCK_TICK_MS);
        next += 1;
        intervals.add(next);
        callbacks.set(next, callback);
        return next;
      },
      clearInterval: (id) => {
        intervals.delete(id as number);
        callbacks.delete(id as number);
      },
    });
    const tick = (ms: number) => {
      now += ms;
      for (const callback of callbacks.values()) callback();
    };
    return {
      clock,
      intervals,
      tick,
      hide: (value: boolean) => {
        hidden = value;
        clock.visibilityChanged();
      },
    };
  }

  it("runs one timer however many times are listening", () => {
    const { clock, intervals } = fake();
    const stops = Array.from({ length: 50 }, () => clock.subscribe(() => {}));
    expect(intervals.size).toBe(1);
    stops.forEach((stop) => stop());
    expect(intervals.size).toBe(0);
  });

  it("ticks every second while visible and pauses while hidden", () => {
    const { clock, intervals, tick, hide } = fake();
    let heard = 0;
    const stop = clock.subscribe(() => (heard += 1));
    tick(1_000);
    tick(1_000);
    expect(heard).toBe(2);
    expect(clock.now()).toBe(T + 2_000);
    hide(true);
    expect(intervals.size).toBe(0);
    hide(false);
    // Showing the tab reads the time at once, then resumes the one timer.
    expect(heard).toBe(3);
    expect(intervals.size).toBe(1);
    stop();
  });
});
