import { afterEach, expect, it, vi } from "vitest";
import type { Draft } from "../editorial/draft-store";
import { readEditorialSnapshot } from "./editorial-snapshot-read";
afterEach(() => vi.useRealTimers());
it("distinguishes missing/discarded snapshots from read failure", async () => {
  expect(await readEditorialSnapshot(async () => null)).toEqual({
    status: "missing",
  });
  expect(
    await readEditorialSnapshot(async () => ({ discardedAt: 42 }) as Draft),
  ).toEqual({ status: "missing" });
  expect(
    await readEditorialSnapshot(async () => {
      throw Error("private details");
    }),
  ).toEqual({ status: "unavailable" });
  const draft = { discardedAt: null, revision: 7 } as Draft;
  expect(await readEditorialSnapshot(async () => draft)).toEqual({
    status: "found",
    draft,
  });
});
it.each(["resolve", "reject"])(
  "bounds a stalled bootstrap/read and handles late %s",
  async (finish) => {
    vi.useFakeTimers();
    let resolve!: (draft: Draft | null) => void;
    let reject!: (error: Error) => void;
    const reading = readEditorialSnapshot(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await reading).toEqual({ status: "unavailable" });
    if (finish === "resolve")
      resolve({ discardedAt: null, revision: 7 } as Draft);
    else reject(Error("Late private provider failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(await reading).toEqual({ status: "unavailable" });
    expect(vi.getTimerCount()).toBe(0);
  },
);
