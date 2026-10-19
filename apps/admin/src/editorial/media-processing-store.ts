import { createHash } from "node:crypto";
import {
  EDITORIAL_MEDIA_CHUNK_BYTES,
  inspectEditorialMediaAdmission,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_PIXELS,
  type EditorialMedia,
} from "./media-store";
import {
  parseMediaCropProvenance,
  validDimensions,
  type CropProvenance,
  type DecodeEvidence,
} from "./media-processing-plan";
import { PngInspector } from "./media-processing-stream";

export type PreparedMediaCrop = {
  bytes: Uint8Array;
  media: EditorialMedia & { type: "image/png" };
  decode: DecodeEvidence;
  provenance: CropProvenance;
};
/** Minimal structural surface of the actual DurableObjectStorage transaction.
 * No provider calls, transaction callbacks, hooks or RPC are exposed to clients. */
export type MediaCommitTransaction = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T = unknown>(options: {
    prefix: string;
    limit: number;
    noCache?: boolean;
  }): Promise<Map<string, T>>;
};
export type MediaCommitStorage = {
  transaction<T>(
    callback: (transaction: MediaCommitTransaction) => Promise<T>,
  ): Promise<T>;
};
export type MediaCommitReceipt = {
  version: "anipotts.editorial-media-commit.v1";
  requestId: string;
  fingerprint: string;
  parentId: string;
  derivativeId: string;
  provenanceId: string;
};
export type MediaCommitFailure =
  | "invalid_request"
  | "invalid_candidate"
  | "request_conflict"
  | "stored_media_corrupt"
  | "stored_provenance_corrupt"
  | "stored_receipt_corrupt"
  | "stored_commit_incomplete";
export class MediaCommitError extends Error {
  constructor(readonly code: MediaCommitFailure) {
    super(code);
    this.name = "MediaCommitError";
  }
}
const fail = (code: MediaCommitFailure): never => {
  throw new MediaCommitError(code);
};
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const hex = /^[a-f0-9]{64}$/u;
const mediaId = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/u;
const requestIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const shape = (
  value: unknown,
  keys: string[],
): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)),
  );
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const metadataEqual = (value: unknown, expected: EditorialMedia): boolean =>
  shape(value, ["id", "type", "size"]) &&
  value.id === expected.id &&
  value.type === expected.type &&
  value.size === expected.size;

export function mediaProcessingRequestKey(requestId: string) {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId))
    return fail("invalid_request");
  return `media-processing-request:v1:${requestId}`;
}
export function mediaProcessingProvenanceKey(provenance: CropProvenance) {
  const parsed = parseMediaCropProvenance(provenance);
  return `media-processing-provenance:v1:${parsed.output.id}:${parsed.id}`;
}

export function parseMediaCommitReceipt(value: unknown): MediaCommitReceipt {
  if (
    !shape(value, [
      "version",
      "requestId",
      "fingerprint",
      "parentId",
      "derivativeId",
      "provenanceId",
    ]) ||
    value.version !== "anipotts.editorial-media-commit.v1" ||
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId) ||
    typeof value.fingerprint !== "string" ||
    !hex.test(value.fingerprint) ||
    typeof value.parentId !== "string" ||
    !mediaId.test(value.parentId) ||
    typeof value.derivativeId !== "string" ||
    !/^[a-f0-9]{64}\.png$/u.test(value.derivativeId) ||
    typeof value.provenanceId !== "string" ||
    !hex.test(value.provenanceId)
  )
    return fail("stored_receipt_corrupt");
  return {
    version: value.version,
    requestId: value.requestId,
    fingerprint: value.fingerprint,
    parentId: value.parentId,
    derivativeId: value.derivativeId,
    provenanceId: value.provenanceId,
  };
}

// Capture the native brand-checking getter once. Own length/byteLength fields
// and custom iterators on caller-owned typed arrays are not admission evidence.
const typedArrayByteLength: (this: Uint8Array) => unknown =
  Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    "byteLength",
  )?.get ??
  function () {
    throw new Error("typed_array_byte_length_unavailable");
  };
function boundedByteSnapshot(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) return fail("invalid_candidate");
  let size: unknown;
  try {
    size = typedArrayByteLength.call(value);
  } catch {
    return fail("invalid_candidate");
  }
  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_MEDIA_BYTES
  )
    return fail("invalid_candidate");
  // Native TypedArray-to-TypedArray construction copies internal indexed bytes;
  // unlike Uint8Array.from(), this does not consume a caller's iterator/length.
  return new Uint8Array(value);
}

function snapshotCandidate(input: {
  requestId: string;
  originalBytes: Uint8Array;
  candidate: unknown;
}) {
  if (!shape(input, ["requestId", "originalBytes", "candidate"]))
    return fail("invalid_request");
  const requestKey = mediaProcessingRequestKey(input.requestId);
  const originalInput = input.originalBytes;
  const candidate = input.candidate;
  if (!shape(candidate, ["bytes", "media", "decode", "provenance"]))
    return fail("invalid_candidate");
  // Copy all caller-owned bytes and parse into fresh canonical records before the
  // first storage await. Neither an existing receipt nor a provider label bypasses admission.
  const originalBytes = boundedByteSnapshot(originalInput);
  const outputBytes = boundedByteSnapshot(candidate.bytes);
  const original = inspectEditorialMediaAdmission(originalBytes);
  const output = inspectEditorialMediaAdmission(outputBytes);
  if (!original.ok || !output.ok || output.media.type !== "image/png")
    return fail("invalid_candidate");
  let provenance: CropProvenance;
  try {
    provenance = parseMediaCropProvenance(candidate.provenance);
  } catch {
    return fail("invalid_candidate");
  }
  if (
    !metadataEqual(candidate.media, output.media) ||
    !metadataEqual(provenance.parent, original.media) ||
    !metadataEqual(provenance.output, output.media)
  )
    return fail("invalid_candidate");
  const decode = candidate.decode;
  if (
    !shape(decode, [
      "evidence",
      "original",
      "encoded",
      "display",
      "discardedPng",
    ]) ||
    decode.evidence !== "provider-transcode-completed" ||
    !metadataEqual(decode.original, original.media) ||
    !validDimensions(decode.encoded) ||
    !validDimensions(decode.display) ||
    decode.display.width !== provenance.plan.source.width ||
    decode.display.height !== provenance.plan.source.height
  )
    return fail("invalid_candidate");
  const orientationCompatible = (
    left: { width: number; height: number },
    right: { width: number; height: number },
  ) =>
    (left.width === right.width && left.height === right.height) ||
    (left.width === right.height && left.height === right.width);
  if (
    !orientationCompatible(original.dimensions, decode.encoded) ||
    !orientationCompatible(decode.encoded, decode.display)
  )
    return fail("invalid_candidate");
  const observed = decode.discardedPng;
  if (
    !shape(observed, [
      "width",
      "height",
      "bitDepth",
      "colorType",
      "size",
      "sha256",
    ]) ||
    observed.width !== decode.display.width ||
    observed.height !== decode.display.height ||
    typeof observed.bitDepth !== "number" ||
    typeof observed.colorType !== "number" ||
    !(
      {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      } as Record<number, number[]>
    )[observed.colorType]?.includes(observed.bitDepth) ||
    typeof observed.size !== "number" ||
    !Number.isSafeInteger(observed.size) ||
    observed.size < 1 ||
    observed.size >
      decode.encoded.width * decode.encoded.height * 8 +
        Math.max(decode.encoded.width, decode.encoded.height) * 8 +
        1024 * 1024 ||
    typeof observed.sha256 !== "string" ||
    !hex.test(observed.sha256)
  )
    return fail("invalid_candidate");
  try {
    const inspector = new PngInspector({
      maxBytes: MAX_MEDIA_BYTES,
      maxPixels: MAX_MEDIA_PIXELS,
      maxDimension: MAX_MEDIA_DIMENSION,
      dimensions: provenance.plan.output,
      canonical8Bit: true,
    });
    inspector.feed(outputBytes);
    const checked = inspector.finish();
    if (`${checked.sha256}.png` !== output.media.id)
      return fail("invalid_candidate");
  } catch {
    return fail("invalid_candidate");
  }
  if (original.media.id === output.media.id) {
    if (
      !metadataEqual(original.media, output.media) ||
      originalBytes.length !== outputBytes.length
    )
      return fail("invalid_candidate");
    for (let index = 0; index < originalBytes.length; index++)
      if (originalBytes[index] !== outputBytes[index])
        return fail("invalid_candidate");
  }
  const receipt: MediaCommitReceipt = {
    version: "anipotts.editorial-media-commit.v1",
    requestId: input.requestId,
    fingerprint: hash(
      JSON.stringify({
        version: "anipotts.editorial-media-commit.v1",
        provenance,
      }),
    ),
    parentId: original.media.id,
    derivativeId: output.media.id,
    provenanceId: provenance.id,
  };
  return {
    requestKey,
    receipt,
    provenance,
    edgeKey: mediaProcessingProvenanceKey(provenance),
    images:
      original.media.id === output.media.id
        ? [{ media: original.media, bytes: originalBytes }]
        : [
            { media: original.media, bytes: originalBytes },
            { media: output.media, bytes: outputBytes },
          ],
  };
}

async function existingImage(
  transaction: MediaCommitTransaction,
  media: EditorialMedia,
  expectedBytes: Uint8Array,
) {
  const key = `media:${media.id}`;
  const metadata = await transaction.get(key);
  const count = Math.ceil(media.size / EDITORIAL_MEDIA_CHUNK_BYTES);
  const chunks = await transaction.list({
    prefix: `${key}:`,
    limit: count + 1,
    noCache: true,
  });
  if (metadata === undefined) {
    if (chunks.size) return fail("stored_media_corrupt");
    return false;
  }
  if (!metadataEqual(metadata, media) || chunks.size !== count)
    return fail("stored_media_corrupt");
  for (let index = 0; index < count; index++) {
    const chunk = chunks.get(`${key}:${index}`);
    const offset = index * EDITORIAL_MEDIA_CHUNK_BYTES;
    if (
      !(chunk instanceof Uint8Array) ||
      chunk.length !==
        Math.min(EDITORIAL_MEDIA_CHUNK_BYTES, media.size - offset)
    )
      return fail("stored_media_corrupt");
    // Reject conflicting values even without relying solely on hash collision resistance.
    for (let byte = 0; byte < chunk.length; byte++)
      if (chunk[byte] !== expectedBytes[offset + byte])
        return fail("stored_media_corrupt");
  }
  return true;
}

/** Atomic private persistence primitive, intentionally not wired to any
 * production RPC/route. The provider label is caller evidence, not authentication
 * or a substitute for qualifying the disabled adapter. No D1/R2/publication work. */
export async function commitPreparedCrop(
  storage: MediaCommitStorage,
  input: {
    requestId: string;
    originalBytes: Uint8Array;
    candidate: unknown;
  },
): Promise<MediaCommitReceipt> {
  const prepared = snapshotCandidate(input);
  return storage.transaction(async (transaction) => {
    const priorValue = await transaction.get(prepared.requestKey);
    const prior =
      priorValue === undefined
        ? undefined
        : parseMediaCommitReceipt(priorValue);
    if (
      prior &&
      (prior.requestId !== prepared.receipt.requestId ||
        prior.fingerprint !== prepared.receipt.fingerprint)
    )
      return fail("request_conflict");
    if (prior && !same(prior, prepared.receipt))
      return fail("stored_receipt_corrupt");
    const edgeValue = await transaction.get(prepared.edgeKey);
    if (edgeValue !== undefined) {
      let edge: CropProvenance;
      try {
        edge = parseMediaCropProvenance(edgeValue);
      } catch {
        return fail("stored_provenance_corrupt");
      }
      if (!same(edge, prepared.provenance))
        return fail("stored_provenance_corrupt");
    }
    const present: boolean[] = [];
    for (const image of prepared.images)
      present.push(await existingImage(transaction, image.media, image.bytes));
    if (
      (prior || edgeValue !== undefined) &&
      (present.some((exists) => !exists) || edgeValue === undefined)
    )
      return fail("stored_commit_incomplete");
    if (prior) return prior;
    for (let index = 0; index < prepared.images.length; index++) {
      if (present[index]) continue;
      const image = prepared.images[index]!;
      for (
        let offset = 0;
        offset < image.bytes.length;
        offset += EDITORIAL_MEDIA_CHUNK_BYTES
      )
        await transaction.put(
          `media:${image.media.id}:${offset / EDITORIAL_MEDIA_CHUNK_BYTES}`,
          image.bytes.slice(offset, offset + EDITORIAL_MEDIA_CHUNK_BYTES),
        );
      await transaction.put(`media:${image.media.id}`, image.media);
    }
    if (edgeValue === undefined)
      await transaction.put(prepared.edgeKey, prepared.provenance);
    await transaction.put(prepared.requestKey, prepared.receipt);
    return prepared.receipt;
  });
}
