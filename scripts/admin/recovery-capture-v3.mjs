import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { validateRecoveryControl } from "./editorial-recovery.mjs";
import { validateRecoveryCaptureEvidence } from "./editorial-recovery-capture.mjs";
import {
  canonicalRecoveryMetadata,
  snapshotRecoveryMediaPlan,
} from "./recovery-media-container.mjs";
import { createRecoveryFrameCodec } from "./recovery-media-encryption.mjs";

/** Inactive supplied-data format. No provider, custody, operational eligibility,
 * production route or migration authority is conferred by this codec. */
export const RECOVERY_CAPTURE_V3_FORMAT =
  "anipotts.editorial-capture.aes256gcm.v3";
export const RECOVERY_CAPTURE_V3_LIMITS = Object.freeze({
  controlBytes: 4 * 1024 * 1024,
  frameBytes: 64 * 1024,
});
const codec = createRecoveryFrameCodec("capture-v3");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  canonicalRecoveryMetadata(value, RECOVERY_CAPTURE_V3_LIMITS.controlBytes);
const fail = () => {
  throw new Error("capture_v3_control");
};
function shape(value, keys) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.propertyIsEnumerable.call(value, key))
  )
    fail();
}
export function copyRecoveryCaptureKey(key) {
  const length = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    "byteLength",
  ).get;
  if (!(key instanceof Uint8Array) || length.call(key) !== 32)
    throw new Error("capture_v3_key");
  return new Uint8Array(key);
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function documentCopy(input, context) {
  const serialized = canonical(input);
  const value = JSON.parse(serialized);
  shape(value, ["format", "snapshot", "objects", "evidence"]);
  if (value.format !== RECOVERY_CAPTURE_V3_FORMAT) fail();
  validateRecoveryCaptureEvidence(value.evidence);
  const plan = snapshotRecoveryMediaPlan({
    objects: value.objects,
    evidence: null,
  });
  const report = validateRecoveryControl(value.snapshot, plan.objects);
  const evidence = value.evidence;
  if (
    value.snapshot.applicationRevision !== context.applicationRevision ||
    value.snapshot.contentSchemaVersion !== context.contentSchemaVersion ||
    evidence.captureId !== context.captureId ||
    evidence.editorialGeneration !== context.editorialGeneration ||
    evidence.contentGeneration !== context.contentGeneration
  )
    fail();
  const publicObjects = plan.objects.filter(
    (object) => object.plane === "public",
  );
  if (publicObjects.length !== evidence.objects.length) fail();
  for (const object of publicObjects) {
    const metadata = evidence.objects.find((item) => item.key === object.id);
    if (
      !metadata ||
      canonical({ ...object.r2, key: object.id }) !== canonical(metadata)
    )
      fail();
  }
  return {
    serialized,
    document: freeze(value),
    plan: { objects: plan.objects, evidence: null },
    report,
  };
}
/** All caller metadata and the key are copied before caller-controlled awaits. */
export async function sealRecoveryCaptureV3(
  document,
  read,
  key,
  context,
  sink,
  options = {},
) {
  context = JSON.parse(canonical(context));
  const copied = documentCopy(document, context);
  return codec.seal(
    copied.plan,
    read,
    key,
    context,
    sink,
    options,
    copied.serialized,
  );
}
/** First pass authenticates exact EOF, every media hash/order, complete control
 * graph and metadata. Only then may begin() claim a suspended target. Pass two
 * must reproduce the same authenticated transcript before final acknowledgment. */
export async function openRecoveryCaptureV3(
  sourceFactory,
  key,
  context,
  sink,
  options = {},
) {
  context = JSON.parse(canonical(context));
  let copied;
  const result = await codec.open(
    sourceFactory,
    key,
    context,
    {
      begin(serialized, receipt, signal) {
        copied = documentCopy(JSON.parse(serialized), context);
        if (copied.serialized !== serialized) fail();
        return sink.begin(copied.document, Object.freeze(receipt), signal);
      },
      writeFrame: (frame, signal) => sink.writeFrame(frame, signal),
      writeManifest: (_serialized, signal) => sink.complete(signal),
      abort: () => sink.abort(),
    },
    options,
    (serialized) => {
      const value = documentCopy(JSON.parse(serialized), context);
      if (value.serialized !== serialized) fail();
      return value.plan;
    },
  );
  return {
    document: copied.document,
    report: copied.report,
    receipt: result.receipt,
    sha256: hash(canonical(result.receipt)),
  };
}
