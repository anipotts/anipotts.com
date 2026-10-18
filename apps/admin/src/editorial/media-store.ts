import { createHash } from "node:crypto";

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 16 * 1024 * 1024;
export const MAX_MEDIA_DIMENSION = 16_384;
const chunkSize = 64 * 1024;
const identity = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
export type EditorialMedia = {
  id: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  size: number;
};

type ImageHeader = {
  type: EditorialMedia["type"];
  width: number;
  height: number;
};
const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

/** Inspect bounded containers and declared dimensions before storing bytes.
 * This does not decode compressed pixels or create a sanitized derivative.
 * Workers has no configured image decoder; those contract requirements remain
 * separate from this admission check. */
function imageHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  ) {
    let dimensions: { width: number; height: number } | null = null;
    let offset = 2;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0 || marker === 0xd8) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length - 2) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length - 2) return null;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        if (dimensions || length < 8 || length !== 8 + 3 * bytes[offset + 7]!)
          return null;
        dimensions = {
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        };
      }
      if (marker === 0xda) {
        // A frame and nonempty scan are required. The entropy-coded payload
        // still needs a real decoder; EOI and segment bounds do not prove it.
        if (!dimensions || length < 6 || offset + length >= bytes.length - 2)
          return null;
        return { type: "image/jpeg", ...dimensions };
      }
      offset += length;
    }
    return null;
  }
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  ) {
    if (
      bytes.length < 45 ||
      view.getUint32(8) !== 13 ||
      ascii(bytes, 12, 4) !== "IHDR"
    )
      return null;
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    let offset = 33;
    let hasData = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const kind = ascii(bytes, offset + 4, 4);
      if (length > bytes.length - offset - 12 || kind === "IHDR") return null;
      if (kind === "IDAT" && length > 0) hasData = true;
      offset += 12 + length;
      if (kind === "IEND")
        return length === 0 && hasData && offset === bytes.length
          ? { type: "image/png", width, height }
          : null;
    }
    return null;
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    if (view.getUint32(4, true) !== bytes.length - 8) return null;
    const uint24 = (offset: number) =>
      bytes[offset]! + 256 * bytes[offset + 1]! + 65_536 * bytes[offset + 2]!;
    const frameHeader = (kind: string, start: number, length: number) => {
      if (kind === "VP8 ") {
        if (
          length <= 10 ||
          (bytes[start]! & 1) !== 0 ||
          bytes[start + 3] !== 0x9d ||
          bytes[start + 4] !== 0x01 ||
          bytes[start + 5] !== 0x2a
        )
          return null;
        return {
          width: view.getUint16(start + 6, true) & 0x3fff,
          height: view.getUint16(start + 8, true) & 0x3fff,
        };
      }
      if (kind !== "VP8L" || length <= 5 || bytes[start] !== 0x2f) return null;
      const bits = view.getUint32(start + 1, true);
      return bits >>> 29 === 0
        ? {
            width: 1 + (bits & 0x3fff),
            height: 1 + ((bits >>> 14) & 0x3fff),
          }
        : null;
    };
    let dimensions: { width: number; height: number } | null = null;
    let hasData = false;
    let animated = false;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = ascii(bytes, offset, 4);
      const length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (length > bytes.length - start) return null;
      if (kind === "VP8X") {
        if (offset !== 12 || length !== 10) return null;
        animated = Boolean(bytes[start]! & 2);
        dimensions = {
          width: 1 + uint24(start + 4),
          height: 1 + uint24(start + 7),
        };
      } else if (kind === "VP8 " || kind === "VP8L") {
        const frame = frameHeader(kind, start, length);
        if (
          animated ||
          !frame ||
          hasData ||
          (dimensions &&
            (frame.width !== dimensions.width ||
              frame.height !== dimensions.height))
        )
          return null;
        dimensions ??= frame;
        hasData = true;
      } else if (kind === "ANMF") {
        // Animation has its canvas in VP8X. Bound each declared frame too;
        // decoding and cumulative animation resource limits remain separate.
        if (!animated || !dimensions || length <= 16) return null;
        const width = 1 + uint24(start + 6);
        const height = 1 + uint24(start + 9);
        if (
          2 * uint24(start) + width > dimensions.width ||
          2 * uint24(start + 3) + height > dimensions.height
        )
          return null;
        let inner = start + 16;
        const end = start + length;
        let hasFrame = false;
        while (inner + 8 <= end) {
          const kind = ascii(bytes, inner, 4);
          const length = view.getUint32(inner + 4, true);
          const payload = inner + 8;
          if (length > end - payload) return null;
          if (kind === "VP8 " || kind === "VP8L") {
            const frame = frameHeader(kind, payload, length);
            if (
              hasFrame ||
              !frame ||
              frame.width !== width ||
              frame.height !== height
            )
              return null;
            hasFrame = true;
          } else if (kind !== "ALPH") return null;
          inner = payload + length + (length & 1);
        }
        if (!hasFrame || inner !== end) return null;
        hasData = true;
      }
      offset = start + length + (length & 1);
    }
    return dimensions && hasData && offset === bytes.length
      ? { type: "image/webp", ...dimensions }
      : null;
  }
  return null;
}

/** Immutable private uploads; no public route or Git write is created here. */
export class EditorialMediaStore {
  constructor(private storage: DurableObjectStorage) {}

  async save(
    bytes: Uint8Array,
  ): Promise<
    | { ok: true; media: EditorialMedia }
    | { ok: false; error: "image_too_large" | "unsupported_image" }
  > {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_MEDIA_BYTES)
      return { ok: false, error: "image_too_large" };
    const header = imageHeader(bytes);
    if (!header || !header.width || !header.height)
      return { ok: false, error: "unsupported_image" };
    if (
      header.width > MAX_MEDIA_DIMENSION ||
      header.height > MAX_MEDIA_DIMENSION ||
      header.width * header.height > MAX_MEDIA_PIXELS
    )
      return { ok: false, error: "image_too_large" };
    const { type } = header;
    const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
    const id = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
    const metadata: EditorialMedia = { id, type, size: bytes.length };
    const entries: Record<string, EditorialMedia | Uint8Array> = {
      [`media:${id}`]: metadata,
    };
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      entries[`media:${id}:${offset / chunkSize}`] = bytes.slice(
        offset,
        offset + chunkSize,
      );
    }
    // One transaction keeps metadata and all chunks visible together.
    await this.storage.transaction(async (transaction) => {
      for (const [key, value] of Object.entries(entries))
        await transaction.put(key, value);
    });
    return { ok: true, media: metadata };
  }

  async read(
    id: string,
  ): Promise<{ metadata: EditorialMedia; bytes: Uint8Array } | null> {
    if (!identity.test(id)) return null;
    const metadata = await this.storage.get<EditorialMedia>(`media:${id}`);
    if (!metadata) return null;
    if (metadata.size < 1 || metadata.size > MAX_MEDIA_BYTES)
      throw new Error("media_corrupt");
    const bytes = new Uint8Array(metadata.size);
    for (let offset = 0; offset < metadata.size; offset += chunkSize) {
      const chunk = await this.storage.get<Uint8Array>(
        `media:${id}:${offset / chunkSize}`,
      );
      if (
        !chunk ||
        chunk.length !== Math.min(chunkSize, metadata.size - offset)
      )
        throw new Error("media_corrupt");
      bytes.set(chunk, offset);
    }
    if (!id.startsWith(createHash("sha256").update(bytes).digest("hex")))
      throw new Error("media_corrupt");
    return { metadata, bytes };
  }
}
