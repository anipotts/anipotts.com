import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ProcessingBudget } from "./media-processing-stream";
import { mediaImagesAdapter, type PrivateImages } from "./media-images-adapter";
import { MAX_MEDIA_BYTES } from "./media-store";
import {
  bytesStream,
  pngChunk,
  orientationJpeg,
  pngFixture,
  pngParts,
  splitBytes,
  syntheticImages,
} from "../../test/fixtures/media-processing";
const original = pngFixture(8, 6);
const info = {
  format: "image/png",
  width: 8,
  height: 6,
  fileSize: original.length,
};
const intent = { ratio: 1, zoom: 1, x: 0, y: 0 };
const reply = (bytes: Uint8Array) => () => bytesStream(splitBytes(bytes, 7));

describe("disabled Images foundation with synthetic provider outputs", () => {
  it("is disabled without an explicit injected binding and rejects oversized input before provider work", async () => {
    await expect(
      mediaImagesAdapter().inspectOriginal(original),
    ).rejects.toMatchObject({ code: "processing_disabled" });
    const fixture = syntheticImages({ info, outputs: [] });
    const adapter = mediaImagesAdapter(fixture.binding);
    await expect(
      adapter.inspectOriginal(new Uint8Array(MAX_MEDIA_BYTES + 1)),
    ).rejects.toMatchObject({ code: "image_too_large" });
    expect(fixture.calls()).toEqual({ infoCalls: 0, outputCalls: 0 });
  });
  it("retains exact 10 MiB input admission in orchestration, without claiming a synthetic decoder qualifies it", async () => {
    const bytes = new Uint8Array(MAX_MEDIA_BYTES);
    bytes.set([255, 216]);
    bytes.set([255, 217], bytes.length - 2);
    const fixture = syntheticImages({
      info: {
        format: "image/jpeg",
        width: 8,
        height: 6,
        fileSize: bytes.length,
      },
      outputs: [reply(original)],
    });
    const result = await mediaImagesAdapter(fixture.binding).inspectOriginal(
      bytes,
    );
    expect(result.original.size).toBe(MAX_MEDIA_BYTES);
    expect(result.original.id).toBe(
      `${createHash("sha256").update(bytes).digest("hex")}.jpg`,
    );
  });
  it("returns completed-transcode evidence, discards full-size output and retains exact original identity", async () => {
    const fixture = syntheticImages({ info, outputs: [reply(original)] });
    const before = original.slice();
    const result = await mediaImagesAdapter(fixture.binding).inspectOriginal(
      original,
    );
    expect(original).toEqual(before);
    expect(result.original).toEqual({
      id: `${createHash("sha256").update(original).digest("hex")}.png`,
      type: "image/png",
      size: original.length,
    });
    expect(result.display).toEqual({ width: 8, height: 6 });
    expect(result.discardedPng).not.toHaveProperty("bytes");
    expect(result.evidence).toBe("provider-transcode-completed");
    expect(fixture.outputOptions).toEqual([
      { format: "image/png", anim: false },
    ]);
  });
  it("prepares only current-policy crop bytes after full decode output completes, with actual 8-bit output checked", async () => {
    const crop = pngFixture(6, 6);
    const fixture = syntheticImages({
      info,
      outputs: [reply(original), reply(crop)],
    });
    const result = await mediaImagesAdapter(fixture.binding).prepareCrop(
      original,
      intent,
    );
    expect(result.bytes).toEqual(crop);
    expect(result.media.size).toBeLessThanOrEqual(MAX_MEDIA_BYTES);
    expect(result.provenance.parent).toEqual(result.decode.original);
    expect(result.provenance.output).toEqual(result.media);
    expect(fixture.transforms).toEqual([
      [],
      [
        { trim: { left: 0, top: 0, width: 6, height: 6 } },
        { width: 6, height: 6, fit: "squeeze" },
      ],
    ]);
    expect(fixture.outputOptions).toEqual(
      Array.from({ length: 2 }, () => ({ format: "image/png", anim: false })),
    );
  });
  it("rejects actual 16-bit, wrong-sized and animated crop output without any successful candidate", async () => {
    for (const [crop, code] of [
      [pngFixture(6, 6, { bitDepth: 16 }), "output_depth"],
      [pngFixture(7, 6), "output_geometry"],
      [
        pngFixture(6, 6, { beforeData: [pngChunk("acTL", new Uint8Array(8))] }),
        "animation_unsupported",
      ],
    ] as const) {
      const fixture = syntheticImages({
        info,
        outputs: [reply(original), reply(crop)],
      });
      await expect(
        mediaImagesAdapter(fixture.binding).prepareCrop(original, intent),
      ).rejects.toMatchObject({ code });
    }
  });
  it("fails closed on a crop exceeding 10 MiB without expanding publication or storage policy", async () => {
    const tooLarge = pngParts(6, 6, {
      data: new Uint8Array(MAX_MEDIA_BYTES + 1),
    });
    let cancelled = 0;
    const fixture = syntheticImages({
      info,
      outputs: [
        reply(original),
        () =>
          bytesStream(
            tooLarge.flatMap((part) => splitBytes(part, 64 * 1024)),
            () => cancelled++,
          ),
      ],
    });
    await expect(
      mediaImagesAdapter(fixture.binding).prepareCrop(original, intent),
    ).rejects.toMatchObject({ code: "output_too_large" });
    expect(cancelled).toBe(1);
  });
  it("ignores hostile own length/byteLength and iteration while copying exact native bytes", async () => {
    const bytes = original.slice();
    const iterator = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    Object.defineProperty(bytes, "length", {
      get() {
        throw new Error("caller length must not run");
      },
    });
    Object.defineProperty(bytes, "byteLength", { value: 1 });
    Object.defineProperty(bytes, Symbol.iterator, { value: iterator });
    const fixture = syntheticImages({ info, outputs: [reply(original)] });
    const result = await mediaImagesAdapter(fixture.binding).inspectOriginal(
      bytes,
    );
    expect(result.original.id).toBe(
      `${createHash("sha256").update(original).digest("hex")}.png`,
    );
    expect(result.original.size).toBe(original.length);
    expect(iterator).not.toHaveBeenCalled();
  });
  it("rejects intrinsic storage over the input limit before copy or provider work despite forged small length", async () => {
    const bytes = new Uint8Array(MAX_MEDIA_BYTES + 1);
    Object.defineProperty(bytes, "length", { value: 4 });
    Object.defineProperty(bytes, "byteLength", { value: 4 });
    const iterator = vi.fn(function* () {
      yield* original;
    });
    Object.defineProperty(bytes, Symbol.iterator, { value: iterator });
    const fixture = syntheticImages({ info, outputs: [] });
    await expect(
      mediaImagesAdapter(fixture.binding).inspectOriginal(bytes),
    ).rejects.toMatchObject({ code: "image_too_large" });
    expect(iterator).not.toHaveBeenCalled();
    expect(fixture.calls()).toEqual({ infoCalls: 0, outputCalls: 0 });
  });
  it("reports absolute timeout for a rejected provider microtask before the timer callback", async () => {
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const fixture = syntheticImages({ info, outputs: [] });
    fixture.binding.info = async () => {
      await Promise.resolve(); // Reject after wait() performs its entry check.
      now = 1001;
      throw new Error("private provider failure");
    };
    try {
      await expect(
        mediaImagesAdapter(fixture.binding).inspectOriginal(original, {
          timeoutMs: 1000,
        }),
      ).rejects.toMatchObject({
        code: "processing_timeout",
        message: "processing_timeout",
      });
    } finally {
      clock.mockRestore();
    }
  });
  it("maps an asymmetric 90-degree display crop into the original encoded trim before resize", async () => {
    const jpeg = orientationJpeg(6);
    const fixture = syntheticImages({
      info: {
        format: "image/jpeg",
        fileSize: jpeg.length,
        width: 8,
        height: 6,
      },
      outputs: [reply(pngFixture(6, 8)), reply(pngFixture(2, 2))],
    });
    const result = await mediaImagesAdapter(fixture.binding).prepareCrop(jpeg, {
      ratio: 1,
      zoom: 3,
      x: 0,
      y: 100,
    });
    expect(result.provenance.plan.effective).toEqual({
      x: 0,
      y: 6,
      width: 2,
      height: 2,
    });
    expect(fixture.transforms[1]).toEqual([
      { trim: { left: 6, top: 4, width: 2, height: 2 } },
      { width: 2, height: 2, fit: "squeeze" },
    ]);
  });
  it("does not let caller mutation change the in-flight original byte identity", async () => {
    const bytes = original.slice();
    const fixture = syntheticImages({ info, outputs: [reply(original)] });
    const pending = mediaImagesAdapter(fixture.binding).inspectOriginal(bytes);
    bytes.fill(0);
    expect((await pending).original.id).toBe(
      `${createHash("sha256").update(original).digest("hex")}.png`,
    );
  });
  it("snapshots validated crop intent before held metadata or transcode awaits", async () => {
    for (const phase of ["info", "transcode"]) {
      const fixture = syntheticImages({
        info,
        outputs: [reply(original), reply(pngFixture(6, 6))],
      });
      const baseline = syntheticImages({
        info,
        outputs: [reply(original), reply(pngFixture(6, 6))],
      });
      const expected = await mediaImagesAdapter(baseline.binding).prepareCrop(
        original,
        intent,
      );
      let entered!: () => void;
      const waiting = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const originalInfo = fixture.binding.info;
      const originalInput = fixture.binding.input;
      if (phase === "info")
        fixture.binding.info = async (...args) => {
          const result = await originalInfo(...args);
          entered();
          await held;
          return result;
        };
      else
        fixture.binding.input = (...args) => {
          const transformer = originalInput(...args);
          const output = transformer.output;
          transformer.output = async (options) => {
            const result = await output(options);
            entered();
            await held;
            return result;
          };
          return transformer;
        };
      const mutable = { ...intent };
      const pending = mediaImagesAdapter(fixture.binding).prepareCrop(
        original,
        mutable,
      );
      await waiting;
      mutable.ratio = 2.4;
      mutable.zoom = 2;
      mutable.x = 100;
      release();
      const result = await pending;
      expect(result.provenance).toEqual(expected.provenance);
      expect(result.bytes).toEqual(expected.bytes);
    }
    const fixture = syntheticImages({ info, outputs: [] });
    await expect(
      mediaImagesAdapter(fixture.binding).prepareCrop(original, {
        ...intent,
        ratio: NaN,
      }),
    ).rejects.toMatchObject({ code: "invalid_crop" });
    expect(fixture.calls().infoCalls).toBe(0);
  });
  it("checks the deadline after final crop provenance assembly", async () => {
    const fixture = syntheticImages({
      info,
      outputs: [reply(original), reply(pngFixture(6, 6))],
    });
    const clock = vi.spyOn(performance, "now");
    let time = 0,
      checkpoints = 0;
    clock.mockImplementation(() => time);
    const originalCheckpoint = ProcessingBudget.prototype.checkpoint;
    const checkpoint = vi
      .spyOn(ProcessingBudget.prototype, "checkpoint")
      .mockImplementation(async function (this: ProcessingBudget) {
        checkpoints++;
        if (checkpoints === 3) time = 1001; // Final assembly, after both PNG streams completed.
        return originalCheckpoint.call(this);
      });
    try {
      await expect(
        mediaImagesAdapter(fixture.binding).prepareCrop(original, intent, {
          timeoutMs: 1000,
        }),
      ).rejects.toMatchObject({ code: "processing_timeout" });
      expect(checkpoints).toBe(3);
    } finally {
      checkpoint.mockRestore();
      clock.mockRestore();
    }
  });
  it("requires admitted metadata and unchanged-or-rotated display dimensions, not info() success alone", async () => {
    for (const bad of [
      { ...info, fileSize: info.fileSize + 1 },
      { ...info, width: 16385 },
      { ...info, width: 4097, height: 4096 },
      { ...info, format: "image/svg+xml" },
    ]) {
      const fixture = syntheticImages({ info: bad, outputs: [] });
      await expect(
        mediaImagesAdapter(fixture.binding).inspectOriginal(original),
      ).rejects.toMatchObject({ code: "unsupported_image" });
      expect(fixture.calls().outputCalls).toBe(0);
    }
    const rotated = syntheticImages({
      info,
      outputs: [reply(pngFixture(6, 8))],
    });
    expect(
      (await mediaImagesAdapter(rotated.binding).inspectOriginal(original))
        .display,
    ).toEqual({ width: 6, height: 8 });
    const changed = syntheticImages({
      info,
      outputs: [reply(pngFixture(4, 3))],
    });
    await expect(
      mediaImagesAdapter(changed.binding).inspectOriginal(original),
    ).rejects.toMatchObject({ code: "output_geometry" });
  });
  it("rejects animated input before calling info, while leaving existing upload policy untouched", async () => {
    const animated = pngFixture(8, 6, {
      beforeData: [pngChunk("acTL", new Uint8Array(8))],
    });
    const fixture = syntheticImages({ info, outputs: [] });
    await expect(
      mediaImagesAdapter(fixture.binding).inspectOriginal(animated),
    ).rejects.toMatchObject({ code: "animation_unsupported" });
    expect(fixture.calls().infoCalls).toBe(0);
  });
  it("labels provider-repaired JPEG as provider evidence, never strict JPEG validity", async () => {
    const jpegSignatureOnly = new Uint8Array([255, 216, 255, 217]);
    const fixture = syntheticImages({
      info: { format: "image/jpeg", width: 8, height: 6, fileSize: 4 },
      outputs: [reply(original)],
    });
    const result = await mediaImagesAdapter(fixture.binding).inspectOriginal(
      jpegSignatureOnly,
    );
    expect(result.evidence).toBe("provider-transcode-completed");
    expect(result.original.type).toBe("image/jpeg");
    expect(result).not.toHaveProperty("strictlyValid");
  });
  it("propagates late crop failure, without returning output bytes or provenance", async () => {
    let sent = false;
    const fixture = syntheticImages({
      info,
      outputs: [
        reply(original),
        () =>
          new ReadableStream(
            {
              pull(controller) {
                if (sent)
                  controller.error(new Error("provider private details"));
                else {
                  sent = true;
                  controller.enqueue(pngFixture(6, 6));
                }
              },
            },
            { highWaterMark: 0 },
          ),
      ],
    });
    await expect(
      mediaImagesAdapter(fixture.binding).prepareCrop(original, intent),
    ).rejects.toMatchObject({
      code: "provider_failure",
      message: "provider_failure",
    });
  });
  it("times out metadata and cancels late provider output, observing late rejection", async () => {
    const hanging: PrivateImages = {
      info: () => new Promise(() => {}),
      input() {
        throw new Error("must not transform");
      },
    };
    await expect(
      mediaImagesAdapter(hanging).inspectOriginal(original, { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "processing_timeout" });
    let resolve!: (
      value: Awaited<ReturnType<ReturnType<PrivateImages["input"]>["output"]>>,
    ) => void;
    let cancelled = 0;
    const late: PrivateImages = {
      info: async () => info,
      input() {
        return {
          transform() {
            return this;
          },
          draw() {
            return this;
          },
          output: () =>
            new Promise((done) => {
              resolve = done;
            }),
        };
      },
    };
    const pending = mediaImagesAdapter(late).inspectOriginal(original, {
      timeoutMs: 5,
    });
    await expect(pending).rejects.toMatchObject({ code: "processing_timeout" });
    const body = bytesStream([], () => cancelled++);
    resolve({
      image: () => body,
      contentType: () => "image/png",
      response: () => new Response(body),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelled).toBe(1);
  });
  it("cancels before provider admission and cancels content-type failures", async () => {
    const abort = new AbortController();
    abort.abort();
    const fixture = syntheticImages({ info, outputs: [] });
    await expect(
      mediaImagesAdapter(fixture.binding).inspectOriginal(original, {
        signal: abort.signal,
      }),
    ).rejects.toMatchObject({ code: "processing_cancelled" });
    expect(fixture.calls().infoCalls).toBe(0);
    let cancelled = 0;
    const wrong = syntheticImages({
      info,
      contentType: "image/jpeg",
      outputs: [() => bytesStream([], () => cancelled++)],
    });
    await expect(
      mediaImagesAdapter(wrong.binding).inspectOriginal(original),
    ).rejects.toMatchObject({ code: "unsupported_image" });
    expect(cancelled).toBe(1);
  });
});
