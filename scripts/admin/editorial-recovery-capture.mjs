import { createHash } from "node:crypto";
import {
  exportOfflineRecovery,
  validateOfflineRecovery,
} from "./editorial-recovery.mjs";
export const CAPTURE_FORMAT = "anipotts.editorial-capture.v2";
export const CAPTURE_BYTE_LIMIT = 8 * 1024 * 1024;
export const CAPTURE_EVIDENCE_BYTE_LIMIT = 256 * 1024;
const hash = (value) => createHash("sha256").update(value).digest("hex");
function keys(value, names) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== [...names].sort().join("|")
  )
    throw new Error("capture_schema");
}
export function validateRecoveryCaptureEvidence(value) {
  if (
    Buffer.byteLength(JSON.stringify(value) ?? "") > CAPTURE_EVIDENCE_BYTE_LIMIT
  )
    throw new Error("capture_evidence_limit");
  keys(value, [
    "captureId",
    "editorialGeneration",
    "contentGeneration",
    "schemas",
    "control",
    "objects",
  ]);
  if (
    !/^[a-f0-9-]{36}$/.test(value.captureId) ||
    ![value.editorialGeneration, value.contentGeneration].every(
      (n) => Number.isSafeInteger(n) && n >= 1,
    )
  )
    throw new Error("capture_fence_identity");
  keys(value.schemas, ["editorial", "content"]);
  keys(value.control, [
    "editorial",
    "content",
    "editorialWriters",
    "contentWriters",
    "migrationLedger",
    "captures",
  ]);
  if (
    !Array.isArray(value.control.editorialWriters) ||
    value.control.editorialWriters.length ||
    !Array.isArray(value.control.contentWriters) ||
    value.control.contentWriters.length
  )
    throw new Error("capture_writers_unresolved");
  if (!Array.isArray(value.objects) || value.objects.length > 20000)
    throw new Error("capture_objects");
  for (const store of ["editorial", "content"]) {
    if (
      !Array.isArray(value.schemas[store]) ||
      !Array.isArray(value.control[store])
    )
      throw new Error("capture_schema");
    const row = value.control[store][0];
    keys(row, ["singleton", "generation", "phase", "capture_id"]);
    if (row.singleton !== 1) throw new Error("capture_fence_identity");
    if (
      value.control[store].length !== 1 ||
      row.capture_id !== value.captureId ||
      row.phase !== "draining" ||
      row.generation !==
        value[
          store === "editorial" ? "editorialGeneration" : "contentGeneration"
        ]
    )
      throw new Error("capture_fence_identity");
  }
  if (!Array.isArray(value.control.migrationLedger))
    throw new Error("capture_schema");
  if (
    !Array.isArray(value.control.captures) ||
    value.control.captures.length > 5000
  )
    throw new Error("capture_schema");
  const captureIds = new Set();
  for (const row of value.control.captures) {
    keys(row, [
      "capture_id",
      "editorial_generation",
      "content_generation",
      "sha256",
      "state",
    ]);
    if (
      !/^[a-f0-9-]{36}$/u.test(row.capture_id) ||
      captureIds.has(row.capture_id) ||
      ![row.editorial_generation, row.content_generation].every(
        (n) => Number.isSafeInteger(n) && n >= 1,
      ) ||
      !/^[a-f0-9]{64}$/u.test(row.sha256) ||
      !["qualified", "releasing", "released", "blocked"].includes(row.state)
    )
      throw new Error("capture_completion_record");
    captureIds.add(row.capture_id);
  }
  const seen = new Set();
  for (const object of value.objects) {
    keys(object, [
      "key",
      "etag",
      "version",
      "uploaded",
      "httpMetadata",
      "customMetadata",
    ]);
    if (
      !/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(object.key) ||
      seen.has(object.key) ||
      ![object.etag, object.version, object.uploaded].every(
        (x) => typeof x === "string" && x.length < 2048,
      )
    )
      throw new Error("capture_object_metadata");
    seen.add(object.key);
    for (const dictionary of [object.httpMetadata, object.customMetadata]) {
      if (
        !dictionary ||
        typeof dictionary !== "object" ||
        Array.isArray(dictionary) ||
        Object.entries(dictionary).some(
          ([key, value]) =>
            key.length > 1024 ||
            typeof value !== "string" ||
            value.length > 4096,
        )
      )
        throw new Error("capture_object_metadata");
    }
    if (
      Object.keys(object.httpMetadata).some(
        (key) =>
          ![
            "contentType",
            "contentLanguage",
            "contentDisposition",
            "contentEncoding",
            "cacheControl",
            "cacheExpiry",
          ].includes(key),
      )
    )
      throw new Error("capture_object_metadata");
    if (
      object.httpMetadata.cacheExpiry !== undefined &&
      !Number.isFinite(Date.parse(object.httpMetadata.cacheExpiry))
    )
      throw new Error("capture_object_metadata");
  }
}
/** Native R2 exposes known optional fields as enumerable undefined values.
 * Omit absence, never stringify it into authored metadata. All supplied values
 * keep strict types, and new/unknown metadata fields still fail closed. */
export function serializeRecoveryR2HttpMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    throw new Error("capture_object_metadata");
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      ![
        "contentType",
        "contentLanguage",
        "contentDisposition",
        "contentEncoding",
        "cacheControl",
        "cacheExpiry",
      ].includes(key)
    )
      throw new Error("capture_object_metadata");
    if (value === undefined) continue;
    if (key === "cacheExpiry") {
      let time;
      try {
        time = Date.prototype.getTime.call(value);
      } catch {
        throw new Error("capture_object_metadata");
      }
      if (!Number.isFinite(time)) throw new Error("capture_object_metadata");
      result[key] = new Date(time).toISOString();
    } else {
      if (typeof value !== "string") throw new Error("capture_object_metadata");
      result[key] = value;
    }
  }
  return result;
}

export function sealRecoveryCapture(snapshot, proof) {
  validateRecoveryCaptureEvidence(proof);
  const payload = exportOfflineRecovery(snapshot);
  objectCoverage(snapshot, proof);
  const core = JSON.stringify({
    format: CAPTURE_FORMAT,
    payload,
    evidence: proof,
  });
  const result = JSON.stringify({
    format: CAPTURE_FORMAT,
    payload,
    evidence: proof,
    sha256: hash(core),
  });
  if (Buffer.byteLength(result) > CAPTURE_BYTE_LIMIT)
    throw new Error("capture_byte_limit");
  return result;
}
export function openRecoveryCapture(serialized) {
  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized) > CAPTURE_BYTE_LIMIT
  )
    throw new Error("capture_byte_limit");
  const value = JSON.parse(serialized);
  keys(value, ["format", "payload", "evidence", "sha256"]);
  if (value.format !== CAPTURE_FORMAT || typeof value.payload !== "string")
    throw new Error("capture_schema");
  validateRecoveryCaptureEvidence(value.evidence);
  const core = JSON.stringify({
    format: value.format,
    payload: value.payload,
    evidence: value.evidence,
  });
  if (value.sha256 !== hash(core)) throw new Error("capture_checksum");
  const verified = validateOfflineRecovery(value.payload);
  objectCoverage(verified.snapshot, value.evidence);
  return { ...verified, evidence: value.evidence, sha256: value.sha256 };
}

function objectCoverage(snapshot, proof) {
  if (snapshot.publicMedia.length !== proof.objects.length)
    throw new Error("capture_object_metadata");
  for (const media of snapshot.publicMedia)
    if (
      proof.objects.find((object) => object.key === media.key)?.httpMetadata
        .contentType !== media.type
    )
      throw new Error("capture_object_metadata");
}
