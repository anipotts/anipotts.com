import { createHash } from "node:crypto";

export type ProcessingFailure =
  | "processing_disabled"
  | "processing_cancelled"
  | "processing_timeout"
  | "provider_failure"
  | "unsupported_image"
  | "image_too_large"
  | "invalid_png"
  | "animation_unsupported"
  | "output_too_large"
  | "output_depth"
  | "output_geometry"
  | "invalid_crop"
  | "invalid_provenance";

export class MediaProcessingError extends Error {
  constructor(readonly code: ProcessingFailure) {
    super(code);
    this.name = "MediaProcessingError";
  }
}

/** One deadline covers metadata, provider setup and every output read. A timed
 * out provider call may keep running; its late output is cancelled, not used. */
export class ProcessingBudget {
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout>;
  private readonly deadline: number;
  private parent?: AbortSignal;
  private abortParent = () => this.controller.abort("processing_cancelled");
  readonly signal = this.controller.signal;

  constructor(timeoutMs = 15_000, signal?: AbortSignal) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new MediaProcessingError("processing_timeout");
    this.deadline = performance.now() + timeoutMs;
    this.parent = signal;
    signal?.addEventListener("abort", this.abortParent, { once: true });
    if (signal?.aborted) this.abortParent();
    this.timer = setTimeout(
      () => this.controller.abort("processing_timeout"),
      timeoutMs,
    );
  }

  check() {
    if (!this.signal.aborted && performance.now() >= this.deadline)
      this.controller.abort("processing_timeout");
    if (this.signal.aborted)
      throw new MediaProcessingError(
        this.signal.reason === "processing_timeout"
          ? "processing_timeout"
          : "processing_cancelled",
      );
  }

  wait<T>(promise: Promise<T>, discard?: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const abort = () => {
        if (settled) return;
        settled = true;
        this.signal.removeEventListener("abort", abort);
        try {
          this.check();
        } catch (error) {
          reject(error);
        }
      };
      this.signal.addEventListener("abort", abort, { once: true });
      if (this.signal.aborted) abort();
      promise.then(
        (value) => {
          // An already-ready promise can win before the watchdog gets a turn.
          try {
            this.check();
          } catch (error) {
            if (!settled) {
              settled = true;
              this.signal.removeEventListener("abort", abort);
              reject(error);
            }
          }
          if (settled) {
            try {
              discard?.(value);
            } catch {
              /* Cleanup cannot revive a timed-out result. */
            }
            return;
          }
          settled = true;
          this.signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          this.signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
      // Observe the promise even if this immediately expires the budget.
      try {
        this.check();
      } catch {
        abort();
      }
    });
  }

  /** Yield an actual event turn, not another ready microtask. Deployed Workers
   * freeze performance.now() within CPU-only work, unlike local workerd/Node.
   * This is cooperative checking, not preemption or charged-CPU qualification. */
  async checkpoint() {
    this.check();
    let complete!: () => void;
    const turn = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const timer = setTimeout(complete, 0);
    try {
      await this.wait(turn);
      this.check();
    } finally {
      clearTimeout(timer);
    }
  }

  finish() {
    clearTimeout(this.timer);
    this.parent?.removeEventListener("abort", this.abortParent);
    // Close any input the provider did not consume, also on successful return.
    this.controller.abort("processing_cancelled");
  }
}

const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crcByte = (crc: number, value: number) =>
  (crcTable[(crc ^ value) & 255]! ^ (crc >>> 8)) >>> 0;
const uint32 = (bytes: Uint8Array, offset = 0) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
  );

export type PngPolicy = {
  maxBytes: number;
  maxPixels: number;
  maxDimension: number;
  dimensions?: { width: number; height: number };
  canonical8Bit?: boolean;
};
export type PngObservation = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  size: number;
  sha256: string;
};

/** Container/CRC inspection, NOT a PNG pixel decoder or zlib validator. Only
 * signature, headers and a 13-byte IHDR are retained, regardless of IDAT size. */
export class PngInspector {
  private phase: "signature" | "header" | "data" | "crc" | "end" = "signature";
  private scratch = new Uint8Array(13);
  private used = 0;
  private remaining = 0;
  private kind = "";
  private length = 0;
  private crc = 0xffffffff;
  private header?: Omit<PngObservation, "size" | "sha256">;
  private idat = false;
  private idatEnded = false;
  private idatBytes = 0;
  private palette = false;
  private transparency = false;
  private hash = createHash("sha256");
  private total = 0;
  private finished = false;

  constructor(private policy: PngPolicy) {
    if (
      ![policy.maxBytes, policy.maxPixels, policy.maxDimension].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw new MediaProcessingError("invalid_png");
  }

  private fail(code: ProcessingFailure = "invalid_png"): never {
    throw new MediaProcessingError(code);
  }

  private beginChunk() {
    this.length = uint32(this.scratch);
    this.kind = String.fromCharCode(...this.scratch.subarray(4, 8));
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/u.test(this.kind)) this.fail();
    if (this.length > this.policy.maxBytes - 12) this.fail("output_too_large");
    if (!this.header && this.kind !== "IHDR") this.fail();
    if (["acTL", "fcTL", "fdAT"].includes(this.kind))
      this.fail("animation_unsupported");
    if (this.kind === "IHDR" && (this.header || this.length !== 13))
      this.fail();
    if (this.idat && this.kind !== "IDAT") this.idatEnded = true;
    if (this.kind === "IDAT") {
      if (this.idatEnded || (this.header?.colorType === 3 && !this.palette))
        this.fail();
      this.idat = true;
      this.idatBytes += this.length;
    } else if (this.kind === "PLTE") {
      if (
        this.palette ||
        this.idat ||
        !this.length ||
        this.length > 768 ||
        this.length % 3
      )
        this.fail();
      if ([0, 4].includes(this.header?.colorType ?? -1)) this.fail();
      this.palette = true;
    } else if (this.kind === "tRNS") {
      const color = this.header?.colorType;
      if (
        this.transparency ||
        this.idat ||
        color === 4 ||
        color === 6 ||
        (color === 0 && this.length !== 2) ||
        (color === 2 && this.length !== 6) ||
        (color === 3 && (!this.palette || !this.length || this.length > 256))
      )
        this.fail();
      this.transparency = true;
    } else if (this.kind === "IEND") {
      if (this.length !== 0 || !this.idatBytes) this.fail();
    } else if (this.kind !== "IHDR") {
      // Reject unknown critical chunks; canonical output also excludes metadata.
      if (
        this.kind[0] === this.kind[0]!.toUpperCase() ||
        this.policy.canonical8Bit
      )
        this.fail();
    }
    this.crc = 0xffffffff;
    for (const byte of this.scratch.subarray(4, 8))
      this.crc = crcByte(this.crc, byte);
    this.remaining = this.length;
    this.used = 0;
    this.phase = this.remaining ? "data" : "crc";
  }

  private endChunk() {
    if (uint32(this.scratch) !== (this.crc ^ 0xffffffff) >>> 0) this.fail();
    if (this.kind === "IHDR") {
      // IHDR payload was copied separately before the CRC overwrote scratch.
      if (!this.header) this.fail();
    }
    this.phase = this.kind === "IEND" ? "end" : "header";
    this.used = 0;
  }

  private readHeader() {
    const width = uint32(this.scratch),
      height = uint32(this.scratch, 4);
    const bitDepth = this.scratch[8]!,
      colorType = this.scratch[9]!;
    const depths: Record<number, number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    };
    if (
      !depths[colorType]?.includes(bitDepth) ||
      this.scratch[10] !== 0 ||
      this.scratch[11] !== 0 ||
      ![0, 1].includes(this.scratch[12]!)
    )
      this.fail();
    if (
      !width ||
      !height ||
      width > this.policy.maxDimension ||
      height > this.policy.maxDimension ||
      width * height > this.policy.maxPixels
    )
      this.fail("output_geometry");
    const expected = this.policy.dimensions;
    if (expected && (width !== expected.width || height !== expected.height))
      this.fail("output_geometry");
    if (
      this.policy.canonical8Bit &&
      (bitDepth !== 8 || ![2, 6].includes(colorType))
    )
      this.fail("output_depth");
    this.header = { width, height, bitDepth, colorType };
  }

  feed(bytes: Uint8Array) {
    if (this.finished || !(bytes instanceof Uint8Array)) this.fail();
    this.total += bytes.length;
    if (this.total > this.policy.maxBytes) this.fail("output_too_large");
    this.hash.update(bytes);
    let offset = 0;
    while (offset < bytes.length) {
      if (this.phase === "end") this.fail();
      if (this.phase === "signature") {
        if (bytes[offset++] !== signature[this.used++]) this.fail();
        if (this.used === 8) {
          this.phase = "header";
          this.used = 0;
        }
      } else if (this.phase === "header" || this.phase === "crc") {
        const needed = this.phase === "header" ? 8 : 4;
        this.scratch[this.used++] = bytes[offset++]!;
        if (this.used === needed) {
          if (this.phase === "header") this.beginChunk();
          else this.endChunk();
        }
      } else {
        const size = Math.min(this.remaining, bytes.length - offset);
        const part = bytes.subarray(offset, offset + size);
        for (const byte of part) this.crc = crcByte(this.crc, byte);
        if (this.kind === "IHDR") {
          this.scratch.set(part, this.used);
          this.used += size;
        }
        offset += size;
        this.remaining -= size;
        if (!this.remaining) {
          if (this.kind === "IHDR") this.readHeader();
          this.used = 0;
          this.phase = "crc";
        }
      }
    }
  }

  finish(): PngObservation {
    if (this.finished || this.phase !== "end" || !this.header) this.fail();
    this.finished = true;
    return {
      ...this.header,
      size: this.total,
      sha256: this.hash.digest("hex"),
    };
  }
}

/** Bounded encoded collection is optional; discard mode never retains IDAT.
 * Success requires EOF after IEND, including a successful final stream read. */
export async function consumePng(
  stream: ReadableStream<Uint8Array>,
  policy: PngPolicy,
  budget: ProcessingBudget,
  collect = false,
): Promise<PngObservation & { bytes?: Uint8Array }> {
  const inspector = new PngInspector(policy);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let success = false;
  let emptyChunks = 0;
  let bytesSinceTurn = 0;
  let collectedBytes = 0;
  try {
    while (true) {
      budget.check();
      const result = await budget.wait(reader.read());
      if (result.done) break;
      const chunk = result.value;
      if (chunk instanceof Uint8Array && !chunk.length) {
        if (++emptyChunks > 16) throw new MediaProcessingError("invalid_png");
        continue;
      }
      emptyChunks = 0;
      // Bound one provider-delivered buffer too, not only aggregate bytes.
      if (!(chunk instanceof Uint8Array) || chunk.byteLength > 1024 * 1024)
        throw new MediaProcessingError("output_too_large");
      for (let offset = 0; offset < chunk.length; offset += 64 * 1024) {
        const part = chunk.subarray(offset, offset + 64 * 1024);
        budget.check();
        inspector.feed(part);
        budget.check();
        if (collect) {
          // Retention depends on encoded bytes, never provider fragmentation.
          // A million one-byte fragments still occupy <= ceil(size/64 KiB) blocks.
          let offset = 0;
          while (offset < part.length) {
            const index = Math.floor(collectedBytes / (64 * 1024));
            const used = collectedBytes % (64 * 1024);
            let block = chunks[index];
            if (!block) {
              block = new Uint8Array(
                Math.min(64 * 1024, policy.maxBytes - collectedBytes),
              );
              chunks.push(block);
            }
            const size = Math.min(block.length - used, part.length - offset);
            block.set(part.subarray(offset, offset + size), used);
            offset += size;
            collectedBytes += size;
          }
        }
        budget.check();
        bytesSinceTurn += part.length;
        if (bytesSinceTurn >= 1024 * 1024) {
          await budget.checkpoint();
          bytesSinceTurn = 0;
        }
      }
    }
    budget.check();
    const observation = inspector.finish();
    budget.check();
    if (collect) {
      const bytes = new Uint8Array(observation.size);
      let offset = 0;
      for (const chunk of chunks) {
        const used = Math.min(chunk.length, bytes.length - offset);
        bytes.set(chunk.subarray(0, used), offset);
        offset += used;
        budget.check();
      }
      await budget.checkpoint();
      success = true;
      return { ...observation, bytes };
    }
    await budget.checkpoint();
    success = true;
    return observation;
  } finally {
    if (!success) void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      /* A timed-out read can still be pending. */
    }
  }
}
