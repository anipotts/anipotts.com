import { describe, expect, it } from "vitest";
import {
  LIVE_CLOCK_SLACK_MS,
  createLiveClock,
  relativeAgo,
  untilNextSecond,
} from "./live-clock";

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

  it("reads the whole first minute as just now in minute units", () => {
    expect(relativeAgo(T - 30_000, T, "minute")).toBe("just now");
    expect(relativeAgo(T - 59_000, T, "minute")).toBe("just now");
    expect(relativeAgo(T - 60_000, T, "minute")).toBe("1m ago");
    expect(relativeAgo(T - 2 * 3_600_000, T, "minute")).toBe("2h ago");
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
  function fake(start = T) {
    let now = start;
    let hidden = false;
    const pending = new Map<number, { callback: () => void; at: number }>();
    const delays: number[] = [];
    let next = 0;
    const clock = createLiveClock({
      now: () => now,
      isHidden: () => hidden,
      setTimeout: (callback, ms) => {
        next += 1;
        delays.push(ms);
        pending.set(next, { callback, at: now + ms });
        return next;
      },
      clearTimeout: (id) => {
        pending.delete(id as number);
      },
    });
    /** Moves the wall clock on, firing each timer at its own moment. */
    const advance = (ms: number) => {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = end;
    };
    return {
      clock,
      pending,
      delays,
      advance,
      hide: (value: boolean) => {
        hidden = value;
        clock.visibilityChanged();
      },
    };
  }

  it("runs one timer however many are listening", () => {
    const { clock, pending } = fake();
    const stops = Array.from({ length: 50 }, () => clock.subscribe(() => {}));
    expect(pending.size).toBe(1);
    stops.forEach((stop) => stop());
    expect(pending.size).toBe(0);
  });

  it("ticks every second while visible and pauses while hidden", () => {
    const { clock, pending, advance, hide } = fake();
    let heard = 0;
    const stop = clock.subscribe(() => (heard += 1));
    advance(2_010);
    expect(heard).toBe(2);
    expect(Math.floor(clock.now() / 1000)).toBe(Math.floor((T + 2_000) / 1000));
    hide(true);
    expect(pending.size).toBe(0);
    hide(false);
    // Showing the tab reads the time at once, then resumes the one timer.
    expect(heard).toBe(3);
    expect(pending.size).toBe(1);
    stop();
  });

  // The clock showed the second before for most of every second, and after
  // a load held one for over a second and then skipped the next.
  it("ticks on the second boundary, never late and never skipping one", () => {
    const { clock, delays, advance } = fake(T + 730);
    const seconds: number[] = [];
    const stop = clock.subscribe(() =>
      seconds.push(Math.floor(clock.now() / 1000)),
    );
    // The first tick waits only for the next boundary.
    expect(delays[0]).toBe(1000 - 730 + LIVE_CLOCK_SLACK_MS);
    advance(5_000);
    const first = Math.floor(T / 1000) + 1;
    expect(seconds).toEqual([
      first,
      first + 1,
      first + 2,
      first + 3,
      first + 4,
    ]);
    // Each tick lands just past its boundary, so the next is a second on.
    for (const delay of delays.slice(1)) expect(delay).toBe(1000);
    stop();
  });

  it("realigns after a timer fires late", () => {
    expect(untilNextSecond(T + 250)).toBe(750 + LIVE_CLOCK_SLACK_MS);
    expect(untilNextSecond(T + 999)).toBe(1 + LIVE_CLOCK_SLACK_MS);
    expect(untilNextSecond(T)).toBe(1000 + LIVE_CLOCK_SLACK_MS);
  });
});
