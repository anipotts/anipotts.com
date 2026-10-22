import { crc32, deflateSync } from "node:zlib";
import type { PrivateImages } from "../../src/editorial/media-images-adapter";

/** Synthetic encoded fixtures. No Images decoder is emulated or qualified. */
export function pngChunk(kind: string, payload: Uint8Array) {
  const bytes = new Uint8Array(12 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, payload.length);
  for (let index = 0; index < 4; index++)
    bytes[4 + index] = kind.charCodeAt(index);
  bytes.set(payload, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
export function joinBytes(parts: Uint8Array[]) {
  const bytes = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export function pngParts(
  width = 1,
  height = 1,
  options: {
    bitDepth?: number;
    colorType?: number;
    data?: Uint8Array;
    beforeData?: Uint8Array[];
  } = {},
) {
  const depth = options.bitDepth ?? 8,
    color = options.colorType ?? 6;
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = depth;
  header[9] = color;
  const channels = color === 6 ? 4 : 3;
  const size = ((width * channels * depth) / 8 + 1) * height;
  if (!options.data && size > 64 * 1024)
    throw new Error("Use explicit container-only data for large fixtures");
  const data = options.data ?? deflateSync(new Uint8Array(size));
  return [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    ...(options.beforeData ?? []),
    pngChunk("IDAT", data),
    pngChunk("IEND", new Uint8Array()),
  ];
}
export const pngFixture = (
  width = 1,
  height = 1,
  options: Parameters<typeof pngParts>[2] = {},
) => joinBytes(pngParts(width, height, options));
export function bytesStream(parts: Uint8Array[], cancelled?: () => void) {
  let index = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const next = parts[index++];
        if (next) controller.enqueue(next);
        else controller.close();
      },
      cancel() {
        cancelled?.();
      },
    },
    { highWaterMark: 0 },
  );
}
export function splitBytes(bytes: Uint8Array, size: number) {
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += size)
    parts.push(bytes.subarray(offset, offset + size));
  return parts;
}

export function syntheticImages(options: {
  info?: ImageInfoResponse;
  outputs: Array<() => ReadableStream<Uint8Array>>;
  contentType?: string;
}) {
  const transforms: ImageTransform[][] = [],
    outputOptions: ImageOutputOptions[] = [];
  let infoCalls = 0,
    outputCalls = 0;
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    try {
      while (!(await reader.read()).done) {
        /* Consume input without decoding. */
      }
    } finally {
      reader.releaseLock();
    }
  };
  const binding: PrivateImages = {
    async info(stream) {
      infoCalls++;
      await drain(stream);
      return (
        options.info ?? {
          format: "image/png",
          fileSize: pngFixture().length,
          width: 1,
          height: 1,
        }
      );
    },
    input(stream) {
      const steps: ImageTransform[] = [];
      transforms.push(steps);
      const transformer: ImageTransformer = {
        transform(step) {
          steps.push(step);
          return transformer;
        },
        draw() {
          throw new Error("Synthetic fixture does not implement overlays");
        },
        async output(output) {
          await drain(stream);
          outputOptions.push(output);
          const response = options.outputs[outputCalls++];
          if (!response) throw new Error("Missing synthetic provider output");
          const body = response();
          return {
            image: () => body,
            contentType: () => options.contentType ?? "image/png",
            response: () => new Response(body),
          };
        },
      };
      return transformer;
    },
  };
  return {
    binding,
    transforms,
    outputOptions,
    calls: () => ({ infoCalls, outputCalls }),
  };
}

/** Metadata-only synthetic TIFF/JPEG wrappers; no JPEG decoder is simulated. */
export function orientationTiff(orientation: number, little = true) {
  const bytes = new Uint8Array(26);
  bytes.set(little ? [73, 73] : [77, 77]);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, 1, little);
  view.setUint16(10, 0x0112, little);
  view.setUint16(12, 3, little);
  view.setUint32(14, 1, little);
  view.setUint16(18, orientation, little);
  return bytes;
}
export function orientationJpeg(orientation: number, little = true) {
  const tiff = orientationTiff(orientation, little);
  const segment = joinBytes([
    new Uint8Array([255, 225, 0, 8 + tiff.length]),
    new Uint8Array([69, 120, 105, 102, 0, 0]),
    tiff,
  ]);
  return joinBytes([
    new Uint8Array([255, 216]),
    segment,
    new Uint8Array([255, 217]),
  ]);
}
