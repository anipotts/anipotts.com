import { describe, it, expect, vi } from "vitest";
import { readObservability } from "./observability-reader";
import { createUnconfiguredSnapshot } from "./observability-model";

describe("bounded observability read capability", () => {
  it("does not connect without an explicit capability", async () => {
    expect((await readObservability()).status).toBe("unconfigured");
  });
  it("accepts a complete allowlisted live projection", async () => {
    const snapshot = { ...createUnconfiguredSnapshot(), source: "live" };
    expect(
      (await readObservability(async () => Response.json(snapshot))).status,
    ).toBe("connected");
  });
  it("rejects private fields without surfacing the provider payload", async () => {
    const result = await readObservability(async () =>
      Response.json({ ...createUnconfiguredSnapshot(), privateBody: "secret" }),
    );
    expect(result.status).toBe("disconnected");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("rejects oversized streamed bodies", async () => {
    expect(
      (
        await readObservability(
          async () =>
            new Response("x".repeat(262145), {
              headers: { "content-type": "application/json" },
            }),
        )
      ).status,
    ).toBe("disconnected");
  });
  it("bounds a hung capability even when it ignores abort", async () => {
    vi.useFakeTimers();
    const pending = readObservability(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(1500);
    expect((await pending).status).toBe("disconnected");
    vi.useRealTimers();
  });
  it("recovers independently after transport failure", async () => {
    expect(
      (
        await readObservability(async () => {
          throw new Error("private exception");
        })
      ).status,
    ).toBe("disconnected");
    expect(
      (
        await readObservability(async () =>
          Response.json({ ...createUnconfiguredSnapshot(), source: "live" }),
        )
      ).status,
    ).toBe("connected");
  });
});
