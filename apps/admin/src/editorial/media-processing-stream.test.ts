import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  consumePng,
  PngInspector,
  ProcessingBudget,
} from "./media-processing-stream";
import {
  bytesStream,
  joinBytes,
  pngChunk,
  pngFixture,
  pngParts,
  splitBytes,
} from "../../test/fixtures/media-processing";
const policy = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 16 * 1024 * 1024,
  maxDimension: 16384,
};
async function inspect(parts: Uint8Array[], collect = false) {
  const budget = new ProcessingBudget();
  try {
    return await consumePng(bytesStream(parts), policy, budget, collect);
  } finally {
    budget.finish();
  }
}

describe("bounded PNG container stream, not a pixel decoder", () => {
  it("checks CRCs across every byte boundary and hashes exact bytes with native crypto", async () => {
    const bytes = pngFixture();
    const result = await inspect(splitBytes(bytes, 1), true);
    expect(result).toMatchObject({
      width: 1,
      height: 1,
      bitDepth: 8,
      colorType: 6,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    });
    const altered = bytes.slice();
    altered[altered.length - 1]! ^= 1;
    await expect(inspect([altered])).rejects.toMatchObject({
      code: "invalid_png",
    });
  });
  it("requires complete terminal IEND and actual EOF, rejects every truncation and trailing byte", async () => {
    const bytes = pngFixture();
    for (let size = 0; size < bytes.length; size++)
      await expect(inspect([bytes.subarray(0, size)])).rejects.toMatchObject({
        code: "invalid_png",
      });
    await expect(inspect([bytes, new Uint8Array([0])])).rejects.toMatchObject({
      code: "invalid_png",
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const budget = new ProcessingBudget();
    let done = false;
    const promise = consumePng(stream, policy, budget).then((value) => {
      done = true;
      return value;
    });
    controller.enqueue(bytes);
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    controller.close();
    await promise;
    budget.finish();
  });
  it("never accepts IEND followed by a late provider failure", async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent) controller.error(new Error("late provider failure"));
          else {
            sent = true;
            controller.enqueue(pngFixture());
          }
        },
      },
      { highWaterMark: 0 },
    );
    const budget = new ProcessingBudget();
    try {
      await expect(consumePng(stream, policy, budget, true)).rejects.toThrow(
        "late provider failure",
      );
    } finally {
      budget.finish();
    }
  });
  it("rejects animation, metadata in canonical output, unexpected depth/dimensions and unknown critical chunks", async () => {
    const bad = [
      {
        bytes: pngFixture(1, 1, {
          beforeData: [pngChunk("acTL", new Uint8Array(8))],
        }),
        code: "animation_unsupported",
      },
      {
        bytes: pngFixture(1, 1, {
          beforeData: [pngChunk("BADR", new Uint8Array())],
        }),
        code: "invalid_png",
      },
    ];
    for (const fixture of bad)
      await expect(inspect([fixture.bytes])).rejects.toMatchObject({
        code: fixture.code,
      });
    for (const fixture of [
      pngFixture(1, 1, { bitDepth: 16 }),
      pngFixture(1, 1, { colorType: 3 }),
    ]) {
      const inspector = new PngInspector({ ...policy, canonical8Bit: true });
      expect(() => inspector.feed(fixture)).toThrow("output_depth");
    }
    expect(() =>
      new PngInspector({ ...policy, dimensions: { width: 2, height: 1 } }).feed(
        pngFixture(),
      ),
    ).toThrow("output_geometry");
    expect(() =>
      new PngInspector({ ...policy, canonical8Bit: true }).feed(
        pngFixture(1, 1, {
          beforeData: [pngChunk("tEXt", new Uint8Array([0]))],
        }),
      ),
    ).toThrow("invalid_png");
  });
  it("bounds both total encoded bytes and a single provider buffer, cancelling rejected output", async () => {
    let cancelled = 0;
    const budget = new ProcessingBudget();
    try {
      await expect(
        consumePng(
          bytesStream([new Uint8Array(1024 * 1024 + 1)], () => cancelled++),
          policy,
          budget,
        ),
      ).rejects.toMatchObject({ code: "output_too_large" });
      expect(cancelled).toBe(1);
      await expect(
        consumePng(
          bytesStream(splitBytes(pngFixture(), 8)),
          { ...policy, maxBytes: 40 },
          budget,
        ),
      ).rejects.toMatchObject({ code: "output_too_large" });
    } finally {
      budget.finish();
    }
  });
  it("discards more than 10 MiB of framed IDAT without returning bytes; this does not validate its pixels", async () => {
    const parts = pngParts(4096, 4096, {
      data: new Uint8Array(10 * 1024 * 1024 + 1),
    });
    const budget = new ProcessingBudget();
    try {
      const result = await consumePng(
        bytesStream(parts.flatMap((part) => splitBytes(part, 64 * 1024))),
        { ...policy, maxBytes: 12 * 1024 * 1024 },
        budget,
      );
      expect(result.size).toBeGreaterThan(policy.maxBytes);
      expect(result).not.toHaveProperty("bytes");
      expect(result.sha256).toBe(
        createHash("sha256").update(joinBytes(parts)).digest("hex"),
      );
    } finally {
      budget.finish();
    }
  });
  it("explicitly accepts container-correct invalid compressed data as framing evidence only", async () => {
    const result = await inspect([
      pngFixture(1, 1, { data: new Uint8Array([1, 2, 3]) }),
    ]);
    expect(result.width).toBe(1);
  });
  it("cancels a pending read on caller abort without waiting for a stuck cancellation hook", async () => {
    const abort = new AbortController();
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled++;
        return new Promise(() => {});
      },
    });
    const budget = new ProcessingBudget(1000, abort.signal);
    const promise = consumePng(stream, policy, budget);
    abort.abort();
    await expect(promise).rejects.toMatchObject({
      code: "processing_cancelled",
    });
    expect(cancelled).toBe(1);
    budget.finish();
  });
  it("rejects an endless no-progress stream instead of starving the deadline timer", async () => {
    let cancelled = 0;
    const budget = new ProcessingBudget();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array());
      },
      cancel() {
        cancelled++;
      },
    });
    try {
      await expect(consumePng(stream, policy, budget)).rejects.toMatchObject({
        code: "invalid_png",
      });
    } finally {
      budget.finish();
    }
    expect(cancelled).toBe(1);
  });
  it("times out stalled output and observes late rejection without returning a receipt", async () => {
    const budget = new ProcessingBudget(5);
    try {
      await expect(
        consumePng(new ReadableStream(), policy, budget),
      ).rejects.toMatchObject({ code: "processing_timeout" });
    } finally {
      budget.finish();
    }
    const late = new ProcessingBudget(5);
    let reject!: (reason: Error) => void;
    const pending = late.wait(
      new Promise<never>((_, failure) => {
        reject = failure;
      }),
    );
    await expect(pending).rejects.toMatchObject({ code: "processing_timeout" });
    reject(new Error("late rejection"));
    await Promise.resolve();
    late.finish();
  });
});
