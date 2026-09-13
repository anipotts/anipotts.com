import { expect, it, vi } from "vitest";
import { SaveScheduler } from "./save-scheduler";

it("debounces typing but persists continuous edits within three seconds", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const scheduler = new SaveScheduler(save);
  for (let i = 0; i < 6; i++) {
    scheduler.changed();
    vi.advanceTimersByTime(500);
  }
  expect(save).toHaveBeenCalledTimes(1);
  scheduler.changed();
  vi.advanceTimersByTime(599);
  expect(save).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(save).toHaveBeenCalledTimes(2);
  scheduler.dispose();
  vi.useRealTimers();
});

it("cancels pending timers when the editor closes", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const scheduler = new SaveScheduler(save);
  scheduler.changed();
  scheduler.dispose();
  vi.runAllTimers();
  expect(save).not.toHaveBeenCalled();
  vi.useRealTimers();
});
