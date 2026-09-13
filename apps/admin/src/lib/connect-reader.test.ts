import { describe, expect, it, vi } from "vitest";
import { readConnect } from "./connect-reader";
import { projectConnectStatus } from "./connect-observation";
const observation = () =>
  projectConnectStatus(
    { auth_runtime: { connect_api: "running" } },
    new Date(Date.now() - 120000).toISOString(),
  );
describe("bounded Connect transport", () => {
  it.each([false, true])(
    "cancels stalled bodies, including late responses (%s)",
    async (late) => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const stream = new ReadableStream({ cancel });
      let deliver!: (response: Response) => void;
      const response = new Response(stream, {
        headers: { "content-type": "application/json" },
      });
      try {
        const pending = readConnect(() =>
          late
            ? new Promise((resolve) => {
                deliver = resolve;
              })
            : Promise.resolve(response),
        );
        await vi.advanceTimersByTimeAsync(1500);
        expect((await pending).status).toBe("unavailable");
        if (late) {
          deliver(response);
          await vi.advanceTimersByTimeAsync(0);
        }
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("does not fetch without a capability", async () => {
    expect(await readConnect()).toEqual({
      status: "unconfigured",
      observation: null,
    });
  });
  it("preserves source timestamp rather than making stale evidence fresh", async () => {
    const value = observation();
    expect(await readConnect(async () => Response.json(value))).toEqual({
      status: "available",
      observation: value,
    });
  });
  it("rejects raw source payloads, extra private fields and invalid values", async () => {
    for (const value of [
      { auth_runtime: {} },
      { ...observation(), secret: "private" },
      {
        ...observation(),
        fields: { ...observation().fields, connect_api: "private" },
      },
    ]) {
      expect(await readConnect(async () => Response.json(value))).toEqual({
        status: "unavailable",
        observation: null,
      });
    }
  });
  it("bounds response size and suppresses upstream error text", async () => {
    expect(
      (
        await readConnect(
          async () =>
            new Response("x".repeat(8193), {
              headers: { "content-type": "application/json" },
            }),
        )
      ).status,
    ).toBe("unavailable");
    expect(
      await readConnect(async () => {
        throw Error("private");
      }),
    ).toEqual({ status: "unavailable", observation: null });
  });
  it("times out even when a source ignores cancellation", async () => {
    vi.useFakeTimers();
    try {
      const pending = readConnect(async () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(1500);
      expect((await pending).status).toBe("unavailable");
    } finally {
      vi.useRealTimers();
    }
  });
});
