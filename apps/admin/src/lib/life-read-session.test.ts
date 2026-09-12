import { describe, expect, it } from "vitest";
import { LifeReadSession, appendLifeBody } from "./life-read-session";
import type { LifeResult } from "../data/personal-context";
const ready = (title: string): LifeResult => ({
  state: "ready",
  scope: "agent",
  observedAt: "2026-01-01",
  data: { title },
});
describe("Life request continuity", () => {
  it("discards old queries that finish after a newer query", async () => {
    const session = new LifeReadSession();
    let finish!: (result: LifeResult) => void;
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
    const session = new LifeReadSession();
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
      appendLifeBody(current, {
        ...current,
        body: "next",
        body_offset: 1,
        next_body_offset: null,
      }).body,
    ).toBe("😀next");
    expect(() =>
      appendLifeBody(current, {
        ...current,
        revision_id: "rev-two",
        body_offset: 1,
        next_body_offset: null,
      }),
    ).toThrow("changed");
    expect(() =>
      appendLifeBody(current, {
        ...current,
        body_offset: 2,
        next_body_offset: null,
      }),
    ).toThrow("changed");
    expect(() =>
      appendLifeBody(current, {
        ...current,
        body_offset: 1,
        next_body_offset: 1,
      }),
    ).toThrow("changed");
  });
});
