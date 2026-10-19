import { createHash } from "node:crypto";
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_PIXELS,
  type EditorialMedia,
} from "./media-store";
import { cropOutputSize, imageCrop } from "../lib/image-crop";
import {
  MediaProcessingError,
  type PngObservation,
} from "./media-processing-stream";

export type DisplayDimensions = { width: number; height: number };
export type CropIntent = { ratio: number; zoom: number; x: number; y: number };
export type CropPlan = {
  version: "anipotts.editorial-media-plan.v1";
  source: DisplayDimensions;
  requested: CropIntent;
  selected: { x: number; y: number; width: number; height: number };
  effective: { x: number; y: number; width: number; height: number };
  output: DisplayDimensions;
  quantization: "floor-origin-ceil-end-v1";
};
export type DecodeEvidence = {
  evidence: "provider-transcode-completed";
  original: EditorialMedia;
  encoded: DisplayDimensions;
  display: DisplayDimensions;
  discardedPng: PngObservation;
};
export type CropProvenance = {
  version: "anipotts.editorial-media-provenance.v1";
  provider: "cloudflare-images";
  encoderVersion: null;
  evidence: "provider-transcode-completed";
  parent: EditorialMedia;
  plan: CropPlan;
  output: EditorialMedia;
  intentId: string;
  id: string;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const exact = (
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
export function validDimensions(value: unknown): value is DisplayDimensions {
  if (!exact(value, ["width", "height"])) return false;
  const { width, height } = value;
  return (
    finite(width) &&
    finite(height) &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_MEDIA_DIMENSION &&
    height <= MAX_MEDIA_DIMENSION &&
    width * height <= MAX_MEDIA_PIXELS
  );
}

/** The existing browser output policy, with a separately recorded integer trim
 * rectangle. This is not a claim of fractional Canvas sampling equivalence. */
export function planMediaCrop(
  source: DisplayDimensions,
  intent: CropIntent,
): CropPlan {
  if (
    !validDimensions(source) ||
    !exact(intent, ["ratio", "zoom", "x", "y"]) ||
    !Object.values(intent).every(finite) ||
    intent.ratio <= 0 ||
    intent.zoom < 1
  )
    throw new MediaProcessingError("invalid_crop");
  const requested = {
    ratio: intent.ratio,
    zoom: intent.zoom,
    x: Math.min(100, Math.max(0, intent.x)),
    y: Math.min(100, Math.max(0, intent.y)),
  };
  const selected = imageCrop(
    source.width,
    source.height,
    requested.ratio,
    requested.zoom,
    requested.x,
    requested.y,
  );
  if (
    !Object.values(selected).every(finite) ||
    selected.width <= 0 ||
    selected.height <= 0
  )
    throw new MediaProcessingError("invalid_crop");
  const x = Math.max(0, Math.floor(selected.x)),
    y = Math.max(0, Math.floor(selected.y));
  const right = Math.min(source.width, Math.ceil(selected.x + selected.width));
  const bottom = Math.min(
    source.height,
    Math.ceil(selected.y + selected.height),
  );
  const effective = { x, y, width: right - x, height: bottom - y };
  if (effective.width < 1 || effective.height < 1)
    throw new MediaProcessingError("invalid_crop");
  const output = cropOutputSize(effective.width, effective.height);
  if (
    !validDimensions(output) ||
    output.width > effective.width ||
    output.height > effective.height
  )
    throw new MediaProcessingError("invalid_crop");
  return {
    version: "anipotts.editorial-media-plan.v1",
    source: { ...source },
    requested,
    selected,
    effective,
    output,
    quantization: "floor-origin-ceil-end-v1",
  };
}

export function parseMediaCropPlan(value: unknown): CropPlan {
  if (
    !exact(value, [
      "version",
      "source",
      "requested",
      "selected",
      "effective",
      "output",
      "quantization",
    ]) ||
    value.version !== "anipotts.editorial-media-plan.v1" ||
    value.quantization !== "floor-origin-ceil-end-v1" ||
    !validDimensions(value.source) ||
    !exact(value.requested, ["ratio", "zoom", "x", "y"])
  )
    throw new MediaProcessingError("invalid_crop");
  const requested = value.requested;
  if (
    !finite(requested.ratio) ||
    !finite(requested.zoom) ||
    !finite(requested.x) ||
    !finite(requested.y)
  )
    throw new MediaProcessingError("invalid_crop");
  const expected = planMediaCrop(value.source, {
    ratio: requested.ratio,
    zoom: requested.zoom,
    x: requested.x,
    y: requested.y,
  });
  // Compare known field values, never object property insertion order.
  for (const name of [
    "source",
    "requested",
    "selected",
    "effective",
    "output",
  ] as const) {
    const fields = expected[name];
    if (!exact(value[name], Object.keys(fields)))
      throw new MediaProcessingError("invalid_crop");
    const supplied = value[name];
    for (const [key, field] of Object.entries(fields))
      if (supplied[key] !== field)
        throw new MediaProcessingError("invalid_crop");
  }
  return expected;
}

function parseMedia(value: unknown): EditorialMedia {
  if (
    !exact(value, ["id", "type", "size"]) ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(value.id) ||
    !finite(value.size) ||
    !Number.isSafeInteger(value.size) ||
    value.size < 1 ||
    value.size > MAX_MEDIA_BYTES
  )
    throw new MediaProcessingError("invalid_provenance");
  const type = value.id.endsWith(".jpg")
    ? "image/jpeg"
    : value.id.endsWith(".png")
      ? "image/png"
      : "image/webp";
  if (value.type !== type) throw new MediaProcessingError("invalid_provenance");
  return { id: value.id, type, size: value.size };
}

/** In-memory only. Does not create relation keys or promise encoder determinism. */
export function mediaCropProvenance(
  parent: EditorialMedia,
  plan: CropPlan,
  output: EditorialMedia,
): CropProvenance {
  const fields = {
    version: "anipotts.editorial-media-provenance.v1" as const,
    provider: "cloudflare-images" as const,
    encoderVersion: null,
    evidence: "provider-transcode-completed" as const,
    parent: parseMedia(parent),
    plan: parseMediaCropPlan(plan),
    output: parseMedia(output),
  };
  if (fields.output.type !== "image/png")
    throw new MediaProcessingError("invalid_provenance");
  const intentId = hash(
    JSON.stringify({ parent: fields.parent, plan: fields.plan }),
  );
  return {
    ...fields,
    intentId,
    id: hash(JSON.stringify({ ...fields, intentId })),
  };
}

export function parseMediaCropProvenance(value: unknown): CropProvenance {
  if (
    !exact(value, [
      "version",
      "provider",
      "encoderVersion",
      "evidence",
      "parent",
      "plan",
      "output",
      "intentId",
      "id",
    ]) ||
    value.version !== "anipotts.editorial-media-provenance.v1" ||
    value.provider !== "cloudflare-images" ||
    value.encoderVersion !== null ||
    value.evidence !== "provider-transcode-completed"
  )
    throw new MediaProcessingError("invalid_provenance");
  const expected = mediaCropProvenance(
    parseMedia(value.parent),
    parseMediaCropPlan(value.plan),
    parseMedia(value.output),
  );
  if (value.intentId !== expected.intentId || value.id !== expected.id)
    throw new MediaProcessingError("invalid_provenance");
  return expected;
}
