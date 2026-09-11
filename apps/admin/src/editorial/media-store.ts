import { createHash } from "node:crypto";

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const chunkSize = 64 * 1024;
const identity = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
export type EditorialMedia = {
  id: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  size: number;
};

function mediaType(bytes: Uint8Array): EditorialMedia["type"] | null {
  if (bytes.length < 12) return null;
  if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  )
    return "image/jpeg";
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  )
    return "image/png";
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (text.startsWith("RIFF") && text.slice(8) === "WEBP") return "image/webp";
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
    const type = mediaType(bytes);
    if (!type) return { ok: false, error: "unsupported_image" };
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
