import { describe, expect, it } from "vitest";
import {
  consumePng,
  ProcessingBudget,
} from "../../src/editorial/media-processing-stream";

// Fixed real encoded 1x1 PNG; native workerd crypto/stream qualification only.
// No Images binding, decoder simulation, account call or storage mutation.
const encoded =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const policy = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 16 * 1024 * 1024,
  maxDimension: 16384,
};

describe("media stream foundation in workerd", () => {
  it("checks native incremental SHA-256, PNG CRC and bytewise stream completion", async () => {
    const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
    let offset = 0;
    const budget = new ProcessingBudget();
    try {
      const result = await consumePng(
        new ReadableStream({
          pull(controller) {
            if (offset === bytes.length) controller.close();
            else controller.enqueue(bytes.slice(offset, ++offset));
          },
        }),
        policy,
        budget,
        true,
      );
      const expected = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes),
      );
      expect(result.sha256).toBe(
        [...expected]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
      );
      expect(result.bytes).toEqual(bytes);
      expect(result).toMatchObject({
        width: 1,
        height: 1,
        bitDepth: 8,
        colorType: 2,
      });
    } finally {
      budget.finish();
    }
  });
  it("rejects native late stream failure after a complete PNG", async () => {
    const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
    let sent = false;
    const budget = new ProcessingBudget();
    try {
      await expect(
        consumePng(
          new ReadableStream(
            {
              pull(controller) {
                if (sent) controller.error(new Error("late failure"));
                else {
                  sent = true;
                  controller.enqueue(bytes);
                }
              },
            },
            { highWaterMark: 0 },
          ),
          policy,
          budget,
        ),
      ).rejects.toThrow("late failure");
    } finally {
      budget.finish();
    }
  });
  it("cancels a pending native read without returning successful evidence", async () => {
    const abort = new AbortController();
    let cancelled = false;
    const budget = new ProcessingBudget(1000, abort.signal);
    try {
      const promise = consumePng(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        policy,
        budget,
      );
      abort.abort();
      await expect(promise).rejects.toMatchObject({
        code: "processing_cancelled",
      });
      expect(cancelled).toBe(true);
    } finally {
      budget.finish();
    }
  });
});
