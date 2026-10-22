import { createHash } from "node:crypto";
import { MAX_MEDIA_BYTES, type EditorialMedia } from "../editorial/media-store";
import {
  editorialMediaId,
  MAX_PUBLICATION_IMAGES,
  MAX_PUBLICATION_MEDIA_BYTES,
  referencedMediaIds,
} from "./editorial-media";

export type OwnedPreviewMediaReader = (
  id: string,
) => Promise<{ metadata: EditorialMedia; bytes: Uint8Array } | null>;
export type OwnedPreviewMediaInput = {
  /** Exact source returned by the revision-pinned owner snapshot reader. */
  source: string;
  renderedIds: readonly string[];
  readMedia: OwnedPreviewMediaReader;
  signal?: AbortSignal;
};
export type OwnedPreviewMediaFailureReason =
  | "invalid_reference"
  | "too_many_images"
  | "media_unavailable"
  | "invalid_media"
  | "media_budget_exceeded"
  | "aborted";
export class OwnedPreviewMediaUnavailable extends Error {
  constructor(readonly reason: OwnedPreviewMediaFailureReason) {
    super(reason);
    this.name = "OwnedPreviewMediaUnavailable";
  }
}
export type OwnedPreviewMediaPreparation =
  | { ok: false; reason: OwnedPreviewMediaFailureReason }
  | {
      ok: true;
      ids: readonly string[];
      totalBytes: number;
      /** Consume once with backpressure. Never aggregate this into a string.
       * Late failure must become unavailable, without a ready handshake. */
      payloads: AsyncIterable<Uint8Array>;
    };

// Divisible by three: only the final chunk has base64 padding.
export const OWNED_PREVIEW_BASE64_CHUNK_BYTES = 48 * 1024;
const encoder = new TextEncoder();
const mime = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new OwnedPreviewMediaUnavailable("aborted");
}

/** The DO RPC returns a complete bounded Uint8Array, not an input stream.
 * Cancellation stops waiting/output/next reads; it cannot cancel that RPC. */
async function readVerified(
  id: string,
  readMedia: OwnedPreviewMediaReader,
  signal?: AbortSignal,
) {
  assertActive(signal);
  let abort: (() => void) | undefined;
  try {
    const operation = readMedia(id);
    const file = await (signal
      ? Promise.race([
          operation,
          new Promise<never>((_resolve, reject) => {
            abort = () => reject(new OwnedPreviewMediaUnavailable("aborted"));
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          }),
        ])
      : operation);
    assertActive(signal);
    if (!file) throw new OwnedPreviewMediaUnavailable("media_unavailable");
    const { metadata, bytes } = file;
    const expectedType = mime[id.split(".")[1] as keyof typeof mime];
    if (
      !metadata ||
      !(bytes instanceof Uint8Array) ||
      metadata.id !== id ||
      metadata.type !== expectedType ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 1 ||
      metadata.size > MAX_MEDIA_BYTES ||
      metadata.size !== bytes.byteLength ||
      createHash("sha256").update(bytes).digest("hex") !== id.split(".")[0]
    )
      throw new OwnedPreviewMediaUnavailable("invalid_media");
    return file;
  } catch (error) {
    if (error instanceof OwnedPreviewMediaUnavailable) throw error;
    throw new OwnedPreviewMediaUnavailable("media_unavailable");
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

/** Preflight and emission each read sequentially, retaining metadata only
 * between images. Upload admission is unchanged; inline previews reuse the
 * existing publication count/aggregate budget and fail explicitly above it. */
export async function prepareOwnedPreviewMedia({
  source,
  renderedIds,
  readMedia,
  signal,
}: OwnedPreviewMediaInput): Promise<OwnedPreviewMediaPreparation> {
  try {
    assertActive(signal);
    const ids = [...new Set(renderedIds)].sort();
    if (ids.length > MAX_PUBLICATION_IMAGES)
      throw new OwnedPreviewMediaUnavailable("too_many_images");
    const referenced = new Set(referencedMediaIds(source));
    if (ids.some((id) => !editorialMediaId.test(id) || !referenced.has(id)))
      throw new OwnedPreviewMediaUnavailable("invalid_reference");
    const expected: EditorialMedia[] = [];
    let totalBytes = 0;
    for (const id of ids) {
      const file = await readVerified(id, readMedia, signal);
      totalBytes += file.bytes.byteLength;
      if (totalBytes > MAX_PUBLICATION_MEDIA_BYTES)
        throw new OwnedPreviewMediaUnavailable("media_budget_exceeded");
      expected.push({ ...file.metadata });
    }
    // An async generator is single-use and pull-driven. No read or base64
    // allocation for the second pass occurs before the consumer asks for data.
    async function* payloads(): AsyncGenerator<Uint8Array> {
      for (const metadata of expected) {
        assertActive(signal);
        const file = await readVerified(metadata.id, readMedia, signal);
        if (
          file.metadata.size !== metadata.size ||
          file.metadata.type !== metadata.type
        )
          throw new OwnedPreviewMediaUnavailable("invalid_media");
        yield encoder.encode(
          `<script type="application/octet-stream" data-preview-owned-media="${metadata.id}" data-media-type="${metadata.type}">`,
        );
        for (
          let offset = 0;
          offset < file.bytes.byteLength;
          offset += OWNED_PREVIEW_BASE64_CHUNK_BYTES
        ) {
          assertActive(signal);
          const length = Math.min(
            OWNED_PREVIEW_BASE64_CHUNK_BYTES,
            file.bytes.byteLength - offset,
          );
          // ArrayBuffer overload makes a view, not another whole-image copy.
          const base64 = Buffer.from(
            file.bytes.buffer,
            file.bytes.byteOffset + offset,
            length,
          ).toString("base64");
          yield encoder.encode(base64);
        }
        assertActive(signal);
        yield encoder.encode("</script>");
      }
    }
    return { ok: true, ids, totalBytes, payloads: payloads() };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof OwnedPreviewMediaUnavailable
          ? error.reason
          : "media_unavailable",
    };
  }
}
