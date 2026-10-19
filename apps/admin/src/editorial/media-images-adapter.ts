import { createHash } from "node:crypto";
import type {
  ImagesBinding,
  ImageInfoResponse,
  ImageTransform,
} from "@cloudflare/workers-types/index.ts";
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_PIXELS,
} from "./media-store";
import {
  consumePng,
  MediaProcessingError,
  PngInspector,
  ProcessingBudget,
} from "./media-processing-stream";
import {
  mediaCropProvenance,
  planMediaCrop,
  validDimensions,
  type CropIntent,
  type DecodeEvidence,
  type DisplayDimensions,
} from "./media-processing-plan";

export type PrivateImages = Pick<ImagesBinding, "info" | "input">;
type ProcessingOptions = { timeoutMs?: number; signal?: AbortSignal };
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const pngPolicy = (maxBytes: number) => ({
  maxBytes,
  maxPixels: MAX_MEDIA_PIXELS,
  maxDimension: MAX_MEDIA_DIMENSION,
});
const ascii = (bytes: Uint8Array, start: number, size: number) =>
  String.fromCharCode(...bytes.subarray(start, start + size));

function inputType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES)
    throw new MediaProcessingError("image_too_large");
  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    const inspector = new PngInspector(pngPolicy(MAX_MEDIA_BYTES));
    inspector.feed(bytes);
    inspector.finish();
    return "image/png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  )
    return "image/jpeg"; // Signature only; the provider may repair malformed JPEGs.
  if (
    bytes.length >= 20 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) + 8 !== bytes.length)
      throw new MediaProcessingError("unsupported_image");
    let offset = 12,
      image = false;
    while (offset + 8 <= bytes.length) {
      const kind = ascii(bytes, offset, 4),
        length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (length > bytes.length - start)
        throw new MediaProcessingError("unsupported_image");
      if (
        kind === "ANIM" ||
        kind === "ANMF" ||
        (kind === "VP8X" && length >= 1 && bytes[start]! & 2)
      )
        throw new MediaProcessingError("animation_unsupported");
      if (kind === "VP8 " || kind === "VP8L") image = true;
      offset = start + length + (length & 1);
    }
    if (offset === bytes.length && image) return "image/webp";
  }
  throw new MediaProcessingError("unsupported_image");
}

function infoDimensions(
  info: ImageInfoResponse,
  type: string,
  size: number,
): DisplayDimensions {
  if (
    !("width" in info) ||
    info.format !== type ||
    info.fileSize !== size ||
    !validDimensions({ width: info.width, height: info.height })
  )
    throw new MediaProcessingError("unsupported_image");
  return { width: info.width, height: info.height };
}

function inputStream(
  bytes: Uint8Array,
  budget: ProcessingBudget,
): ReadableStream<Uint8Array> {
  let offset = 0;
  let stop: () => void = () => {};
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        stop = () => {
          budget.signal.removeEventListener("abort", stop);
          controller.error(new MediaProcessingError("processing_cancelled"));
        };
        budget.signal.addEventListener("abort", stop, { once: true });
        if (budget.signal.aborted) stop();
      },
      pull(controller) {
        budget.check();
        if (offset === bytes.length) {
          budget.signal.removeEventListener("abort", stop);
          controller.close();
          return;
        }
        const end = Math.min(bytes.length, offset + 64 * 1024);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
      cancel() {
        budget.signal.removeEventListener("abort", stop);
      },
    },
    { highWaterMark: 0 },
  );
}

function pngOutputStream(
  result: Awaited<ReturnType<ReturnType<PrivateImages["input"]>["output"]>>,
) {
  const stream = result.image();
  try {
    if (result.contentType() !== "image/png")
      throw new MediaProcessingError("unsupported_image");
    return stream;
  } catch (error) {
    void stream.cancel().catch(() => {});
    throw error;
  }
}

const discardOutput = (
  result: Awaited<ReturnType<ReturnType<PrivateImages["input"]>["output"]>>,
) => {
  try {
    void result
      .image()
      .cancel()
      .catch(() => {});
  } catch {
    /* Late result has no consumer. */
  }
};

/** Source-only dependency injection. No env lookup, provider setup, route or
 * persistence. With no explicit Images object every operation is disabled. */
export function mediaImagesAdapter(images?: PrivateImages) {
  async function run<T>(
    bytes: Uint8Array,
    options: ProcessingOptions,
    operation: (
      original: Uint8Array,
      type: ReturnType<typeof inputType>,
      budget: ProcessingBudget,
      binding: PrivateImages,
    ) => Promise<T>,
  ): Promise<T> {
    if (!images) throw new MediaProcessingError("processing_disabled");
    const budget = new ProcessingBudget(options.timeoutMs, options.signal);
    try {
      budget.check();
      if (
        !(bytes instanceof Uint8Array) ||
        !bytes.length ||
        bytes.length > MAX_MEDIA_BYTES
      )
        throw new MediaProcessingError("image_too_large");
      // A bounded snapshot prevents caller mutation while asynchronous work runs.
      const original = Uint8Array.from(bytes),
        type = inputType(original);
      return await operation(original, type, budget, images);
    } catch (error) {
      if (error instanceof MediaProcessingError) throw error;
      throw new MediaProcessingError("provider_failure");
    } finally {
      budget.finish();
    }
  }

  async function inspect(
    original: Uint8Array,
    type: ReturnType<typeof inputType>,
    budget: ProcessingBudget,
    binding: PrivateImages,
  ): Promise<DecodeEvidence> {
    const info = await budget.wait(binding.info(inputStream(original, budget)));
    const encoded = infoDimensions(info, type, original.length);
    budget.check();
    const result = await budget.wait(
      binding
        .input(inputStream(original, budget))
        .output({ format: "image/png", anim: false }),
      discardOutput,
    );
    const stream = pngOutputStream(result);
    // Transient discard traffic only: up to RGBA16 plus filter/PNG overhead.
    // This does not increase upload, persisted-media or publication limits.
    const maxBytes =
      encoded.width * encoded.height * 8 +
      Math.max(encoded.width, encoded.height) * 8 +
      1024 * 1024;
    const discardedPng = await consumePng(stream, pngPolicy(maxBytes), budget);
    const display = { width: discardedPng.width, height: discardedPng.height };
    if (!(
      (display.width === encoded.width && display.height === encoded.height) ||
      (display.width === encoded.height && display.height === encoded.width)
    ))
      throw new MediaProcessingError("output_geometry");
    const extension =
      type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
    return {
      evidence: "provider-transcode-completed",
      original: {
        id: `${createHash("sha256").update(original).digest("hex")}.${extension}`,
        type,
        size: original.length,
      },
      encoded,
      display,
      discardedPng,
    };
  }

  return {
    inspectOriginal(bytes: Uint8Array, options: ProcessingOptions = {}) {
      return run(bytes, options, inspect);
    },
    prepareCrop(
      bytes: Uint8Array,
      intent: CropIntent,
      options: ProcessingOptions = {},
    ) {
      return run(bytes, options, async (original, type, budget, binding) => {
        const decode = await inspect(original, type, budget, binding);
        budget.check();
        const plan = planMediaCrop(decode.display, intent);
        const trim: ImageTransform = {
          trim: {
            left: plan.effective.x,
            top: plan.effective.y,
            width: plan.effective.width,
            height: plan.effective.height,
          },
        };
        const resize: ImageTransform = { ...plan.output, fit: "squeeze" };
        const result = await budget.wait(
          binding
            .input(inputStream(original, budget))
            .transform(trim)
            .transform(resize)
            .output({ format: "image/png", anim: false }),
          discardOutput,
        );
        const stream = pngOutputStream(result);
        const output = await consumePng(
          stream,
          {
            ...pngPolicy(MAX_MEDIA_BYTES),
            dimensions: plan.output,
            canonical8Bit: true,
          },
          budget,
          true,
        );
        if (!output.bytes) throw new MediaProcessingError("invalid_png");
        const media = {
          id: `${output.sha256}.png`,
          type: "image/png" as const,
          size: output.size,
        };
        const provenance = mediaCropProvenance(decode.original, plan, media);
        return { bytes: output.bytes, media, decode, provenance };
      });
    },
  };
}
