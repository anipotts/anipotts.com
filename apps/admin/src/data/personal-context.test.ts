import { describe, expect, it, vi } from "vitest";
import { lifeReadPath, readPersonalContext } from "./personal-context";

describe("Life read boundary", () => {
  it("rejects mismatched or malformed body continuation metadata", async () => {
    const data = {
      record_id: "fixture",
      revision_id: "one",
      body: "text",
      body_offset: 5,
      next_body_offset: null,
    };
    const read = (response: Record<string, unknown>) =>
      readPersonalContext(
        { method: "get", id: "fixture", body_offset: 5 },
        { scope: "agent", read: async () => response },
      );
    expect((await read(data)).state).toBe("ready");
    for (const body_offset of [undefined, 0, NaN, Infinity, 5.5])
      expect((await read({ ...data, body_offset })).state).toBe("invalid");
    for (const next_body_offset of [
      undefined,
      NaN,
      Infinity,
      -1,
      5,
      5.5,
      10_000_001,
    ])
      expect((await read({ ...data, next_body_offset })).state).toBe("invalid");
  });
  it("rejects provider continuation cursors outside the request bounds", async () => {
    for (const next_offset of [-1, 1.5, 10_000_001, 0]) {
      expect(
        (
          await readPersonalContext(
            { method: "search", q: "fixture" },
            {
              scope: "agent",
              read: async () => ({ items: [], total: 1, next_offset }),
            },
          )
        ).state,
      ).toBe("invalid");
    }
  });
  it("finishes a stalled transport and aborts the underlying read", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    try {
      const pending = readPersonalContext(
        { method: "status" },
        {
          scope: "agent",
          read: async (_path, input) => {
            signal = input;
            return new Promise(() => {});
          },
        },
      );
      await vi.advanceTimersByTimeAsync(5000);
      expect((await pending).state).toBe("unavailable");
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects incomplete success responses and oversized payloads", async () => {
    for (const data of [{}, { body: "x".repeat(1024 * 1024) }]) {
      expect(
        (
          await readPersonalContext(
            { method: "status" },
            { scope: "agent", read: async () => data },
          )
        ).state,
      ).toBe("invalid");
    }
  });
  it("requires an explicit context scope, exact defaults and bounded token count", async () => {
    const data = {
      context_consumer: "agent",
      context_text: "fixture",
      mode: "lookup",
      budget: 3000,
      recent_days: 7,
      token_count: 1,
      selected: [],
      omitted: [],
    };
    expect(
      (
        await readPersonalContext(
          { method: "preview", q: "fixture" },
          { scope: "agent", read: async () => data },
        )
      ).state,
    ).toBe("ready");
    expect(
      (
        await readPersonalContext(
          { method: "preview", q: "fixture" },
          {
            scope: "agent",
            read: async () => ({ ...data, token_count: 3001 }),
          },
        )
      ).state,
    ).toBe("invalid");
    expect(
      (
        await readPersonalContext(
          { method: "preview", q: "fixture" },
          {
            scope: "agent",
            read: async () => ({ ...data, context_consumer: undefined }),
          },
        )
      ).state,
    ).toBe("denied");
  });
  it("defaults to disconnected without retrieving private records", async () => {
    expect((await readPersonalContext({ method: "status" })).state).toBe(
      "disconnected",
    );
  });
  it("keeps preview lookup-only and bounded", () => {
    const path = new URL(
      lifeReadPath({ method: "preview", q: "a&consumer=owner" }),
      "http://fixture.invalid",
    );
    expect(Object.fromEntries(path.searchParams)).toEqual({
      q: "a&consumer=owner",
      mode: "lookup",
      budget: "3000",
      recent_days: "7",
    });
  });
  it("rejects traversal, excessive queries and invalid cursors before transport", async () => {
    for (const request of [
      { method: "get", id: "../status" },
      { method: "search", q: "a".repeat(2049) },
      { method: "activity", after: -1 },
    ] as const) {
      expect(
        (
          await readPersonalContext(request, {
            scope: "agent",
            read: async () => {
              throw new Error("Should never run");
            },
          })
        ).state,
      ).toBe("invalid");
    }
  });
  it("does not leak provider exceptions or mistake failure for an empty result", async () => {
    const result = await readPersonalContext(
      { method: "status" },
      {
        scope: "agent",
        read: async () => {
          throw new Error("private-path-and-body");
        },
      },
    );
    expect(result.state).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("private-path-and-body");
  });
  it("rejects a mislabeled ordinary-agent preview", async () => {
    expect(
      (
        await readPersonalContext(
          { method: "preview", q: "fixture" },
          { scope: "owner", read: async () => ({ context_consumer: "agent" }) },
        )
      ).state,
    ).toBe("denied");
  });
  it("retains source pagination and effective-date uncertainty", async () => {
    const data = {
      items: [
        {
          occurred_at: null,
          date_precision: "unknown",
          observed_at: "2026-01-02",
          status: "provisional",
        },
      ],
      next_offset: 30,
      total: 40,
    };
    const result = await readPersonalContext(
      { method: "timeline" },
      { scope: "agent", read: async () => data },
    );
    expect(result.state === "ready" && result.data).toEqual(data);
  });
});
