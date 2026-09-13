import { describe, expect, it } from "vitest";
import { applyActivityPage, emptyActivity } from "./life-activity";
const item = (change_id: number) => ({
  change_id,
  trace_id: "1".repeat(32),
  stage: "indexed",
  state: "succeeded",
  record_count: 1,
  observed_at: "2026-01-01T00:00:00Z",
});
describe("Life activity resume", () => {
  it("replays checkpoints idempotently and resumes at the committed cursor", () => {
    const page = { items: [item(1), item(2)], next_cursor: 2 };
    const first = applyActivityPage(emptyActivity(), page);
    expect(applyActivityPage(first, page)).toEqual(first);
    expect(
      applyActivityPage(first, { items: [item(3)], next_cursor: 3 }).items,
    ).toHaveLength(3);
  });
  it("rejects private extra fields, changed checkpoints and inconsistent cursors", () => {
    const current = applyActivityPage(emptyActivity(), {
      items: [item(1)],
      next_cursor: 1,
    });
    for (const page of [
      { items: [{ ...item(2), body: "private fixture" }], next_cursor: 2 },
      { items: [{ ...item(1), record_count: 2 }], next_cursor: 1 },
      { items: [item(2)], next_cursor: 4 },
      { items: [item(3), item(2)], next_cursor: 2 },
    ])
      expect(() => applyActivityPage(current, page)).toThrow();
    expect(current.cursor).toBe(1);
  });
  it("bounds retained history and distinguishes catch-up from an idle source", () => {
    const first = applyActivityPage(emptyActivity(), {
      items: Array.from({ length: 100 }, (_, i) => item(i + 1)),
      next_cursor: 100,
    });
    expect(first.catchingUp).toBe(true);
    const next = applyActivityPage(first, {
      items: [item(101)],
      next_cursor: 101,
    });
    expect(next.items).toHaveLength(100);
    expect(next.items[0]!.change_id).toBe(2);
    expect(next.catchingUp).toBe(false);
    expect(applyActivityPage(next, { items: [], next_cursor: 101 })).toEqual(
      next,
    );
  });
});
