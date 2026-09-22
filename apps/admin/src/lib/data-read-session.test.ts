import { describe, expect, it } from "vitest";
import { DataReadSession, appendDataBody } from "./data-read-session";
import type { DataResult } from "../data/personal-context";
const ready = (title: string): DataResult => ({
  state: "ready",
  scope: "agent",
  observedAt: "2026-01-01",
  data: { title },
});
describe("Data request continuity", () => {
  it("rejects unsafe continuation offsets before appending source text", () => {
    const current = {
      record_id: "fixture",
      revision_id: "one",
      body: "first",
      next_body_offset: 5,
    };
    const next = {
      ...current,
      body: "next",
      body_offset: 5,
      next_body_offset: null,
    };
    for (const offset of [NaN, Infinity, -1, 5.5, 10_000_001]) {
      expect(() =>
        appendDataBody(current, { ...next, next_body_offset: offset }),
      ).toThrow("changed");
      expect(() =>
        appendDataBody(
          { ...current, next_body_offset: offset },
          { ...next, body_offset: offset },
        ),
      ).toThrow("changed");
    }
    expect(current.body).toBe("first");
  });
  it("discards old queries that finish after a newer query", async () => {
    const session = new DataReadSession();
    let finish!: (result: DataResult) => void;
    const first = session.run(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      { method: "search", q: "old" },
    );
    expect(
      await session.run(async () => ready("new"), {
        method: "search",
        q: "new",
      }),
    ).toEqual(ready("new"));
    finish(ready("old"));
    expect(await first).toBeNull();
  });
  it("discards a pending record when the view is closed", async () => {
    const session = new DataReadSession();
    const pending = session.run(async () => ready("record"), {
      method: "get",
      id: "rec-fixture",
    });
    session.invalidate();
    expect(await pending).toBeNull();
  });
  it("appends by source cursor without treating UTF-16 length as the source offset", () => {
    const current = {
      record_id: "rec-fixture",
      revision_id: "rev-one",
      body: "😀",
      next_body_offset: 1,
    };
    expect(
      appendDataBody(current, {
        ...current,
        body: "next",
        body_offset: 1,
        next_body_offset: null,
      }).body,
    ).toBe("😀next");
    expect(() =>
      appendDataBody(current, {
        ...current,
        revision_id: "rev-two",
        body_offset: 1,
        next_body_offset: null,
      }),
    ).toThrow("changed");
    expect(() =>
      appendDataBody(current, {
        ...current,
        body_offset: 2,
        next_body_offset: null,
      }),
    ).toThrow("changed");
    expect(() =>
      appendDataBody(current, {
        ...current,
        body_offset: 1,
        next_body_offset: 1,
      }),
    ).toThrow("changed");
  });
});

it("aborts obsolete transport reads on replacement and closure", async () => {
  const session = new DataReadSession();
  const signals: AbortSignal[] = [];
  const reader = (_request: unknown, signal?: AbortSignal) =>
    new Promise<DataResult>((_resolve, reject) => {
      signals.push(signal!);
      signal!.addEventListener("abort", () => reject(new Error("aborted")), {
        once: true,
      });
    });
  const first = session.run(reader, { method: "search", q: "first" });
  const second = session.run(reader, { method: "search", q: "second" });
  expect(signals[0]!.aborted).toBe(true);
  expect(signals[1]!.aborted).toBe(false);
  expect(await first).toBeNull();
  session.invalidate();
  expect(signals[1]!.aborted).toBe(true);
  expect(await second).toBeNull();
});
