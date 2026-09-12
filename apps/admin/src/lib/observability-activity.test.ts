import { describe, it, expect } from "vitest";
import { projectPersonalContextActivity } from "./observability-activity";
import { deriveServiceState } from "./observability-model";
const now = new Date("2026-09-12T09:00:00.000Z");
const checkpoint = (change_id: number, state = "succeeded") => ({
  change_id,
  trace_id: "a".repeat(32),
  stage: "recorded",
  state,
  record_count: 1,
  observed_at: "2026-09-12T08:00:00+00:00",
});
describe("read-only PersonalContext telemetry backfill", () => {
  it("projects committed activity without fabricating health, contact or latency", async () => {
    const result = await projectPersonalContextActivity(
      { items: [checkpoint(1)], next_cursor: 1 },
      undefined,
      now,
    );
    expect(result.snapshot.events[0].kind).toBe("committed-checkpoint");
    expect(result.snapshot.spans).toEqual([]);
    expect(
      result.snapshot.services.every(
        (s) => deriveServiceState(s, now.getTime()) !== "healthy",
      ),
    ).toBe(true);
    expect(
      result.snapshot.services.find((s) => s.id === "personalcontext-ingestion")
        ?.connection,
    ).toBe("unknown");
  });
  it.each(["pending", "blocked", "excluded", "skipped", "observed"])(
    "retains %s metadata without implying completion",
    async (state) => {
      const result = await projectPersonalContextActivity(
        { items: [checkpoint(1, state)], next_cursor: 1 },
        undefined,
        now,
      );
      expect(result.activity.cursor).toBe(1);
      expect(result.activity.items).toHaveLength(1);
      expect(result.snapshot.events).toEqual([]);
      expect(
        result.snapshot.services.find(
          (s) => s.id === "personalcontext-ingestion",
        )?.outcome,
      ).toBe("unknown");
    },
  );
  it("deduplicates replay and retains cursor on an empty page", async () => {
    const page = { items: [checkpoint(1)], next_cursor: 1 };
    const first = await projectPersonalContextActivity(page, undefined, now);
    const replay = await projectPersonalContextActivity(
      page,
      first.activity,
      now,
    );
    expect(replay.snapshot.events).toEqual(first.snapshot.events);
    expect(
      (
        await projectPersonalContextActivity(
          { items: [], next_cursor: 1 },
          replay.activity,
          now,
        )
      ).activity.cursor,
    ).toBe(1);
  });
  it("records an operational failure without a personal assertion or incident inference", async () => {
    const result = await projectPersonalContextActivity(
      { items: [checkpoint(1, "failed")], next_cursor: 1 },
      undefined,
      now,
    );
    expect(result.snapshot.events[0].kind).toBe("failure");
    expect(result.snapshot.incidents).toEqual([]);
  });
  it("rejects private fields and invalid future pages without mutating previous cursor", async () => {
    const first = await projectPersonalContextActivity(
      { items: [checkpoint(1)], next_cursor: 1 },
      undefined,
      now,
    );
    for (const page of [
      { items: [{ ...checkpoint(2), body: "private" }], next_cursor: 2 },
      {
        items: [{ ...checkpoint(2), observed_at: "2099-01-01T00:00:00Z" }],
        next_cursor: 2,
      },
      { items: [], next_cursor: 1, private: "value" },
    ]) {
      await expect(
        projectPersonalContextActivity(page, first.activity, now),
      ).rejects.toThrow();
      expect(first.activity.cursor).toBe(1);
    }
  });
});
