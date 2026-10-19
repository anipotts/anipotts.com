import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

// Supplied-data plaintext transport only. No binding, filesystem, network,
// eligibility, capture fencing, encryption or key-custody capability lives here.
export const RECOVERY_MEDIA_CONTAINER_FORMAT =
  "anipotts.editorial-recovery-media.plaintext";
export const RECOVERY_MEDIA_CONTAINER_LIMITS = Object.freeze({
  frameBytes: 64 * 1024,
  objectBytes: 10 * 1024 * 1024,
  aggregateBytes: 64 * 1024 * 1024,
  entries: 5000,
  metadataBytes: 4 * 1024 * 1024,
  evidenceBytes: 256 * 1024,
  manifestBytes: 4 * 1024 * 1024 + 256 * 1024 + 4096,
});
const limits = RECOVERY_MEDIA_CONTAINER_LIMITS;
const types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const hex = /^[a-f0-9]{64}$/u;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
).get;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw new Error(`recovery_media_container_${code}`);
};
function shape(value, fields) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== fields.length ||
    !fields.every((field) =>
      Object.prototype.propertyIsEnumerable.call(value, field),
    )
  )
    fail("schema");
}
/** Bounded JSON encoding, including escaped-string bytes. Stop before retaining
 * a token that exceeds the budget; depth and array counts are bounded too. */
export function canonicalRecoveryMetadata(value, maximum) {
  let bytes = 0;
  const blocks = [];
  let block = "";
  const token = (value) => {
    bytes += Buffer.byteLength(value);
    if (bytes > maximum) fail("metadata_limit");
    // Aggregate small JSON tokens; metadata with many short fields must not
    // create one retained array entry per punctuation mark or string fragment.
    for (let offset = 0; offset < value.length;) {
      const length = Math.min(
        limits.frameBytes - block.length,
        value.length - offset,
      );
      block += value.slice(offset, offset + length);
      offset += length;
      if (block.length === limits.frameBytes) {
        blocks.push(block);
        block = "";
      }
    }
  };
  const encode = (value, depth) => {
    if (depth > 16) fail("metadata_depth");
    if (value === null || typeof value === "boolean") token(String(value));
    else if (typeof value === "string") {
      if (value.length > maximum) fail("metadata_limit");
      token(JSON.stringify(value));
    } else if (typeof value === "number" && Number.isSafeInteger(value))
      token(String(value));
    else if (Array.isArray(value)) {
      if (value.length > limits.entries) fail("entry_limit");
      const length = value.length;
      const own = Reflect.ownKeys(value);
      if (
        own.length !== length + 1 ||
        !Array.from({ length }, (_, index) => String(index)).every((key) =>
          Object.prototype.propertyIsEnumerable.call(value, key),
        )
      )
        fail("metadata_array");
      token("[");
      for (let index = 0; index < length; index++) {
        if (index) token(",");
        encode(value[index], depth + 1);
      }
      token("]");
    } else if (value && Object.getPrototypeOf(value) === Object.prototype) {
      const keys = Object.keys(value).sort();
      if (Reflect.ownKeys(value).length !== keys.length) fail("metadata_json");
      if (keys.length > limits.entries) fail("entry_limit");
      token("{");
      keys.forEach((key, index) => {
        if (index) token(",");
        if (key.length > maximum) fail("metadata_limit");
        token(JSON.stringify(key));
        token(":");
        encode(value[key], depth + 1);
      });
      token("}");
    } else fail("metadata_json");
  };
  encode(value, 0);
  if (block) blocks.push(block);
  return blocks.join("");
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function dictionary(value, allowed) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    fail("metadata_schema");
  for (const [key, item] of Object.entries(value))
    if (
      key.length > 1024 ||
      (allowed && !allowed.includes(key)) ||
      typeof item !== "string" ||
      item.length > 4096
    )
      fail("metadata_schema");
}
function inventory(objects, evidence) {
  if (!Array.isArray(objects) || objects.length > limits.entries)
    fail("entry_limit");
  canonicalRecoveryMetadata(objects, limits.metadataBytes);
  canonicalRecoveryMetadata(evidence, limits.evidenceBytes);
  const seen = new Set();
  let totalBytes = 0,
    totalFrames = 0;
  for (const object of objects) {
    const fields = ["plane", "id", "type", "size"];
    if (object?.plane === "public") fields.push("r2");
    shape(object, fields);
    if (
      !["private", "public"].includes(object.plane) ||
      typeof object.id !== "string" ||
      !/^[a-f0-9]{64}\.(jpg|png|webp)$/u.test(object.id) ||
      types[object.id.split(".")[1]] !== object.type ||
      !Number.isSafeInteger(object.size) ||
      object.size < 1 ||
      object.size > limits.objectBytes
    )
      fail("object_schema");
    const identity = `${object.plane}:${object.id}`;
    if (seen.has(identity)) fail("duplicate");
    seen.add(identity);
    totalBytes += object.size;
    if (totalBytes > limits.aggregateBytes) fail("aggregate_limit");
    totalFrames += Math.ceil(object.size / limits.frameBytes);
    if (object.plane === "public") {
      shape(object.r2, [
        "etag",
        "version",
        "uploaded",
        "httpMetadata",
        "customMetadata",
      ]);
      for (const key of ["etag", "version", "uploaded"])
        if (
          typeof object.r2[key] !== "string" ||
          !object.r2[key].length ||
          object.r2[key].length >= 2048
        )
          fail("metadata_schema");
      if (
        !Number.isFinite(Date.parse(object.r2.uploaded)) ||
        new Date(object.r2.uploaded).toISOString() !== object.r2.uploaded
      )
        fail("metadata_schema");
      dictionary(object.r2.httpMetadata, [
        "contentType",
        "contentLanguage",
        "contentDisposition",
        "contentEncoding",
        "cacheControl",
        "cacheExpiry",
      ]);
      dictionary(object.r2.customMetadata);
      if (object.r2.httpMetadata.contentType !== object.type)
        fail("metadata_schema");
      const expiry = object.r2.httpMetadata.cacheExpiry;
      if (
        expiry !== undefined &&
        (!Number.isFinite(Date.parse(expiry)) ||
          new Date(expiry).toISOString() !== expiry)
      )
        fail("metadata_schema");
    }
  }
  return { totalBytes, totalFrames };
}
export function snapshotRecoveryMediaPlan(plan) {
  shape(plan, ["objects", "evidence"]);
  // Snapshot all metadata before the first caller-controlled await. The
  // supplied object graph is never retained as deferred mutable authority.
  const copy = JSON.parse(
    canonicalRecoveryMetadata(plan, limits.manifestBytes),
  );
  const totals = inventory(copy.objects, copy.evidence);
  return freeze({ ...copy, ...totals });
}
function manifest(plan) {
  const core = {
    format: RECOVERY_MEDIA_CONTAINER_FORMAT,
    version: 1,
    objects: plan.objects,
    evidence: plan.evidence,
    totalBytes: plan.totalBytes,
    totalFrames: plan.totalFrames,
  };
  return canonicalRecoveryMetadata(
    {
      ...core,
      sha256: hash(canonicalRecoveryMetadata(core, limits.manifestBytes)),
    },
    limits.manifestBytes,
  );
}
export function readRecoveryMediaManifest(serialized) {
  if (
    typeof serialized !== "string" ||
    serialized.length > limits.manifestBytes ||
    Buffer.byteLength(serialized) > limits.manifestBytes
  )
    fail("manifest_limit");
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    fail("manifest_json");
  }
  shape(value, [
    "format",
    "version",
    "objects",
    "evidence",
    "totalBytes",
    "totalFrames",
    "sha256",
  ]);
  if (
    value.format !== RECOVERY_MEDIA_CONTAINER_FORMAT ||
    value.version !== 1 ||
    typeof value.sha256 !== "string" ||
    !hex.test(value.sha256)
  )
    fail("manifest_schema");
  const totals = inventory(value.objects, value.evidence);
  if (
    value.totalBytes !== totals.totalBytes ||
    value.totalFrames !== totals.totalFrames ||
    manifest(value) !== serialized
  )
    fail("manifest_integrity");
  return freeze(value);
}
function sinkContract(sink) {
  if (
    !sink ||
    !["writeFrame", "writeManifest", "abort"].every(
      (method) => typeof sink[method] === "function",
    )
  )
    fail("sink");
}
function bytes(input, index, expected) {
  shape(input, ["index", "bytes"]);
  const frameIndex = input.index;
  const raw = input.bytes;
  if (
    frameIndex !== index ||
    !(raw instanceof Uint8Array) ||
    typedArrayByteLength.call(raw) !== expected ||
    expected < 1 ||
    expected > limits.frameBytes
  )
    fail("frame");
  // At most one transport-owned binary frame is outstanding. Caller readers
  // supply canonical chunks, never a whole object or an oversized fragment.
  return new Uint8Array(raw);
}
async function aborted(sink) {
  try {
    await sink.abort();
  } catch {
    // Cleanup failure cannot turn a failed transfer into a complete manifest.
  }
}
/** read(object, objectIndex) supplies ordered {index, bytes} chunks: exactly
 * 64 KiB except the last. Sinks must stage frames, await/copy them before
 * resolving, and publish a complete container only on writeManifest(). A sink
 * acknowledgment is not proof of durable storage or authenticated custody. */
export async function writeRecoveryMediaContainer(plan, read, sink) {
  sinkContract(sink);
  const snapshot = snapshotRecoveryMediaPlan(plan);
  if (typeof read !== "function") fail("reader");
  try {
    for (
      let objectIndex = 0;
      objectIndex < snapshot.objects.length;
      objectIndex++
    ) {
      const object = snapshot.objects[objectIndex];
      const digest = createHash("sha256");
      let offset = 0,
        index = 0;
      for await (const input of read(object, objectIndex)) {
        const frame = bytes(
          input,
          index,
          Math.min(limits.frameBytes, object.size - offset),
        );
        digest.update(frame);
        offset += frame.byteLength;
        await sink.writeFrame({ objectIndex, index, bytes: frame });
        index++;
      }
      if (offset !== object.size) fail("truncated");
      if (digest.digest("hex") !== object.id.split(".")[0]) fail("object_hash");
    }
    const serialized = manifest(snapshot);
    await sink.writeManifest(serialized);
    return serialized;
  } catch (error) {
    await aborted(sink);
    throw error;
  }
}
/** Verify an already supplied final manifest and ordered binary frames. A
 * failure may leave staged bytes; callers must never expose those as restored
 * state. No complete manifest reaches the sink until exact EOF is verified. */
export async function verifyRecoveryMediaContainer(serialized, frames, sink) {
  sinkContract(sink);
  const verified = readRecoveryMediaManifest(serialized);
  try {
    let objectIndex = 0,
      index = 0,
      offset = 0;
    let digest = createHash("sha256");
    for await (const input of frames) {
      shape(input, ["objectIndex", "index", "bytes"]);
      const object = verified.objects[objectIndex];
      if (!object || input.objectIndex !== objectIndex) fail("frame_order");
      const frame = bytes(
        { index: input.index, bytes: input.bytes },
        index,
        Math.min(limits.frameBytes, object.size - offset),
      );
      digest.update(frame);
      offset += frame.byteLength;
      await sink.writeFrame({ objectIndex, index, bytes: frame });
      index++;
      if (offset === object.size) {
        if (digest.digest("hex") !== object.id.split(".")[0])
          fail("object_hash");
        objectIndex++;
        index = offset = 0;
        digest = createHash("sha256");
      }
    }
    if (objectIndex !== verified.objects.length) fail("truncated");
    await sink.writeManifest(serialized);
    return verified;
  } catch (error) {
    await aborted(sink);
    throw error;
  }
}
