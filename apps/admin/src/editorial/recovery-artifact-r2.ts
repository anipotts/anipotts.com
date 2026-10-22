import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  RECOVERY_CAPTURE_V3_LIMITS,
  type RecoveryCaptureV3Event,
  type RecoveryCaptureV3Receipt,
  type RecoveryCaptureV3Sink,
  type RecoveryCaptureV3Source,
} from "../../../../scripts/admin/recovery-capture-v3.mjs";
import { ENCRYPTED_RECOVERY_MEDIA_LIMITS } from "../../../../scripts/admin/recovery-media-encryption.mjs";
import {
  canonicalRecoveryMetadata,
  RECOVERY_MEDIA_CONTAINER_LIMITS,
} from "../../../../scripts/admin/recovery-media-container.mjs";

// Inactive ciphertext storage only. No key, binding, route, cleanup or enrollment.
// Pass a bucket acquired in THIS calling context, never an I/O handle from a peer DO.
export const RECOVERY_ARTIFACT_R2_FORMAT = "anipotts.editorial-capture.r2.v1";
const frame = RECOVERY_MEDIA_CONTAINER_LIMITS.frameBytes;
const maxRecords =
  ENCRYPTED_RECOVERY_MEDIA_LIMITS.records +
  Math.ceil(RECOVERY_CAPTURE_V3_LIMITS.controlBytes / frame);
export const RECOVERY_ARTIFACT_R2_LIMITS = Object.freeze({
  events: maxRecords + 1, // header plus records, including the final commit
  shardEntries: 128,
  shards: Math.ceil((maxRecords + 1) / 128),
  shardBytes: 128 * 1024,
  indexBytes: 64 * 1024,
  eventBytes: frame + 512 + 4 + 16,
});
const limits = RECOVERY_ARTIFACT_R2_LIMITS;
export type RecoveryArtifactObject = Readonly<{
  size: number;
  etag: string;
  version: string;
}>;
/** Structural subset of the installed R2 binding API, also usable by bounded
 * synthetic tests. No REST, account credentials or provider configuration. */
export type RecoveryArtifactBucket = {
  put(
    key: string,
    value: Uint8Array,
    options: { onlyIf: { etagDoesNotMatch: string } },
  ): Promise<RecoveryArtifactObject | null>;
  get(
    key: string,
    options: { onlyIf: { etagMatches: string } },
  ): Promise<
    | (RecoveryArtifactObject & {
        body?: ReadableStream<Uint8Array>;
      })
    | null
  >;
};
type Reference = RecoveryArtifactObject & Readonly<{ sha256: string }>;
export type RecoveryArtifactDescriptor = Readonly<{
  format: typeof RECOVERY_ARTIFACT_R2_FORMAT;
  artifactId: string;
  index: Reference;
}>;
export type RecoveryArtifactWriter = RecoveryCaptureV3Sink & {
  source: RecoveryCaptureV3Source;
  descriptor(): RecoveryArtifactDescriptor;
};
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const nativeLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
)!.get!;
function fail(code: string): never {
  throw new Error(`recovery_artifact_${code}`);
}
function shape(
  value: unknown,
  fields: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== fields.length ||
    !fields.every((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key),
    )
  )
    fail("schema");
}
function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail("bounds");
  return value;
}
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    Buffer.byteLength(value) > max ||
    Buffer.from(value).toString("utf8") !== value
  )
    fail("schema");
  return value;
}
function idCopy(value: unknown): string {
  const id = text(value, 80);
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) fail("identity");
  return id;
}
const prefix = (id: string) => `editorial-recovery-artifacts/v1/${id}/`;
const eventKey = (id: string, index: number) => `${prefix(id)}events/${index}`;
const shardKey = (id: string, index: number) => `${prefix(id)}shards/${index}`;
const indexKey = (id: string) => `${prefix(id)}index`;
function reference(value: unknown, maximum: number): Reference {
  shape(value, ["size", "etag", "version", "sha256"]);
  const digest = text(value.sha256, 64);
  if (!/^[a-f0-9]{64}$/u.test(digest)) fail("schema");
  return Object.freeze({
    size: integer(value.size, 1, maximum),
    etag: text(value.etag, 256),
    version: text(value.version, 256),
    sha256: digest,
  });
}
function descriptorCopy(
  value: RecoveryArtifactDescriptor,
): RecoveryArtifactDescriptor {
  shape(value, ["format", "artifactId", "index"]);
  if (value.format !== RECOVERY_ARTIFACT_R2_FORMAT) fail("format");
  return Object.freeze({
    format: RECOVERY_ARTIFACT_R2_FORMAT,
    artifactId: idCopy(value.artifactId),
    index: reference(value.index, limits.indexBytes),
  });
}
function jsonBytes(value: unknown, maximum: number): Uint8Array {
  return Buffer.from(canonicalRecoveryMetadata(value, maximum));
}
function parse(bytes: Uint8Array, maximum: number): unknown {
  const serialized = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  const value: unknown = JSON.parse(serialized);
  if (canonicalRecoveryMetadata(value, maximum) !== serialized)
    fail("canonical");
  return value;
}
function array(value: unknown, maximum: number): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1 ||
    !Array.from({ length: value.length }, (_, i) =>
      Object.hasOwn(value, i),
    ).every(Boolean)
  )
    fail("schema");
  return value;
}
function bytesCopy(value: Uint8Array, maximum: number): Uint8Array {
  if (!(value instanceof Uint8Array) || nativeLength.call(value) > maximum)
    fail("bounds");
  return new Uint8Array(value);
}
function encodeEvent(
  event: RecoveryCaptureV3Event,
  position: number,
): Uint8Array {
  let metadata: unknown,
    payload: Uint8Array,
    tag: Uint8Array = new Uint8Array(0);
  if (event.kind === "header") {
    shape(event, ["kind", "serialized"]);
    if (position !== 0) fail("order");
    payload = Buffer.from(
      text(event.serialized, ENCRYPTED_RECOVERY_MEDIA_LIMITS.headerBytes),
    );
    metadata = { kind: "header", length: payload.byteLength };
  } else {
    shape(event, [
      "kind",
      "role",
      "sequence",
      "objectIndex",
      "index",
      "length",
      "ciphertext",
      "tag",
    ]);
    if (
      event.kind !== "record" ||
      position === 0 ||
      event.sequence !== position ||
      !["control", "media", "manifest", "commit"].includes(event.role)
    )
      fail("order");
    integer(event.objectIndex, -1, RECOVERY_MEDIA_CONTAINER_LIMITS.entries - 1);
    integer(event.index, 0, maxRecords);
    const length = integer(
      event.length,
      1,
      event.role === "commit"
        ? ENCRYPTED_RECOVERY_MEDIA_LIMITS.commitBytes
        : frame,
    );
    payload = bytesCopy(event.ciphertext, frame);
    tag = bytesCopy(event.tag, 16);
    if (payload.byteLength !== length || tag.byteLength !== 16) fail("bounds");
    metadata = {
      kind: "record",
      role: event.role,
      sequence: position,
      objectIndex: event.objectIndex,
      index: event.index,
      length,
    };
  }
  const encoded = jsonBytes(metadata, 512);
  const output = new Uint8Array(
    4 + encoded.byteLength + payload.byteLength + tag.byteLength,
  );
  new DataView(output.buffer).setUint32(0, encoded.byteLength);
  output.set(encoded, 4);
  output.set(payload, 4 + encoded.byteLength);
  output.set(tag, 4 + encoded.byteLength + payload.byteLength);
  return output;
}
function decodeEvent(
  bytes: Uint8Array,
  position: number,
): RecoveryCaptureV3Event {
  if (bytes.byteLength < 5) fail("event");
  const length = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0);
  integer(length, 1, 512);
  if (4 + length > bytes.byteLength) fail("event");
  const value = parse(bytes.subarray(4, 4 + length), 512);
  let event: RecoveryCaptureV3Event;
  // Validate metadata before interpreting the fixed binary tail.
  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "header"
  ) {
    shape(value, ["kind", "length"]);
    const size = integer(
      Reflect.get(value, "length"),
      1,
      ENCRYPTED_RECOVERY_MEDIA_LIMITS.headerBytes,
    );
    if (bytes.byteLength !== 4 + length + size) fail("event");
    event = {
      kind: "header",
      serialized: new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes.subarray(4 + length)),
    };
  } else {
    shape(value, [
      "kind",
      "role",
      "sequence",
      "objectIndex",
      "index",
      "length",
    ]);
    if (
      value.kind !== "record" ||
      typeof value.role !== "string" ||
      !["control", "media", "manifest", "commit"].includes(value.role)
    )
      fail("event");
    const size = integer(value.length, 1, frame);
    if (bytes.byteLength !== 4 + length + size + 16) fail("event");
    event = {
      kind: "record",
      role: value.role as "control" | "media" | "manifest" | "commit",
      sequence: integer(value.sequence, 1, maxRecords),
      objectIndex: integer(
        value.objectIndex,
        -1,
        RECOVERY_MEDIA_CONTAINER_LIMITS.entries - 1,
      ),
      index: integer(value.index, 0, maxRecords),
      length: size,
      ciphertext: bytes.subarray(4 + length, 4 + length + size),
      tag: bytes.subarray(4 + length + size),
    };
  }
  encodeEvent(event, position); // shared strict role, sequence and length validation
  return event;
}
function receiptCopy(value: unknown): RecoveryCaptureV3Receipt {
  shape(value, [
    "mediaBytes",
    "mediaFrames",
    "manifestBytes",
    "manifestHash",
    "records",
    "transcript",
    "controlBytes",
    "controlHash",
  ]);
  for (const key of ["manifestHash", "transcript", "controlHash"] as const)
    if (!/^[a-f0-9]{64}$/u.test(text(value[key], 64))) fail("receipt");
  return Object.freeze({
    mediaBytes: integer(
      value.mediaBytes,
      0,
      RECOVERY_MEDIA_CONTAINER_LIMITS.aggregateBytes,
    ),
    mediaFrames: integer(value.mediaFrames, 0, maxRecords),
    manifestBytes: integer(
      value.manifestBytes,
      1,
      RECOVERY_MEDIA_CONTAINER_LIMITS.manifestBytes,
    ),
    manifestHash: text(value.manifestHash, 64),
    records: integer(value.records, 1, maxRecords - 1),
    transcript: text(value.transcript, 64),
    controlBytes: integer(
      value.controlBytes,
      1,
      RECOVERY_CAPTURE_V3_LIMITS.controlBytes,
    ),
    controlHash: text(value.controlHash, 64),
  });
}
function checkSignals(signals: readonly AbortSignal[]) {
  if (signals.some((signal) => signal.aborted)) fail("aborted");
}
/** Stop awaiting promptly without claiming native I/O was retracted. Observe
 * both fulfillment/rejection of late I/O, disposing any late read body. Cleanup
 * is deliberately synchronous/fire-and-forget, never another awaited gate. */
function abortable<T>(
  pending: Promise<T>,
  signals: readonly AbortSignal[],
  onAbort: () => void = () => {},
  onLate: (value: T) => void = () => {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      for (const signal of signals)
        signal.removeEventListener("abort", aborted);
    };
    const aborted = () => {
      if (settled) return;
      settled = true;
      cleanup();
      onAbort();
      reject(new Error("recovery_artifact_aborted"));
    };
    for (const signal of signals)
      signal.addEventListener("abort", aborted, { once: true });
    pending.then(
      (value) => {
        if (settled) {
          onLate(value);
          return;
        }
        if (signals.some((signal) => signal.aborted)) {
          aborted();
          onLate(value);
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
    if (signals.some((signal) => signal.aborted)) aborted();
  });
}
function cancelBody(body?: ReadableStream<Uint8Array>) {
  try {
    void body?.cancel().catch(() => {});
  } catch {
    /* already owned/closed */
  }
}
async function put(
  bucket: RecoveryArtifactBucket,
  key: string,
  bytes: Uint8Array,
  check: () => void,
  signals: readonly AbortSignal[],
): Promise<Reference> {
  check();
  const digest = hash(bytes);
  const stored = await abortable(
    bucket.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
    }),
    signals,
  );
  check();
  if (!stored) fail("collision");
  if (stored.size !== bytes.byteLength) fail("storage");
  return reference(
    {
      size: stored.size,
      version: stored.version,
      etag: stored.etag,
      sha256: digest,
    },
    bytes.byteLength,
  );
}
async function read(
  bucket: RecoveryArtifactBucket,
  key: string,
  ref: Reference,
  check: () => void,
  signals: readonly AbortSignal[],
): Promise<Uint8Array> {
  check();
  const value = await abortable(
    bucket.get(key, { onlyIf: { etagMatches: ref.etag } }),
    signals,
    undefined,
    (late) => cancelBody(late?.body),
  );
  if (!value?.body) {
    check();
    fail("changed");
  }
  const reader = value.body.getReader();
  let done = false,
    cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // cancel() settles the owned read requests even when the underlying source's
    // cancellation acknowledgment never settles. Do not await that acknowledgment.
    try {
      void reader.cancel().catch(() => {});
    } catch {
      /* already closed */
    }
    try {
      reader.releaseLock();
    } catch {
      /* release again from finally */
    }
  };
  try {
    check();
    if (
      value.size !== ref.size ||
      value.version !== ref.version ||
      value.etag !== ref.etag
    )
      fail("changed");
    const output = new Uint8Array(ref.size);
    let offset = 0;
    for (;;) {
      const part = await abortable(reader.read(), signals, cancel);
      check();
      if (part.done) {
        done = true;
        break;
      }
      const size = nativeLength.call(part.value);
      if (size > output.byteLength - offset) fail("length");
      output.set(part.value, offset);
      offset += size;
    }
    if (offset !== output.byteLength || hash(output) !== ref.sha256)
      fail("integrity");
    return output;
  } finally {
    if (!done) cancel();
    try {
      reader.releaseLock();
    } catch {
      /* pending native cleanup already observed */
    }
  }
}
/** Descriptor metadata is not proof of authenticated content. Every consumer
 * must still use openRecoveryCaptureV3; it verifies context, transcript and EOF. */
export function openR2RecoveryArtifact(
  bucket: RecoveryArtifactBucket,
  input: RecoveryArtifactDescriptor,
  signal?: AbortSignal,
): RecoveryCaptureV3Source {
  const descriptor = descriptorCopy(input);
  return async function* (operationSignal) {
    const signals: AbortSignal[] = [];
    if (signal) signals.push(signal);
    if (operationSignal && operationSignal !== signal)
      signals.push(operationSignal);
    const check = () => checkSignals(signals);
    const root = parse(
      await read(
        bucket,
        indexKey(descriptor.artifactId),
        descriptor.index,
        check,
        signals,
      ),
      limits.indexBytes,
    );
    shape(root, ["format", "artifactId", "events", "shards", "receipt"]);
    if (
      root.format !== RECOVERY_ARTIFACT_R2_FORMAT ||
      root.artifactId !== descriptor.artifactId
    )
      fail("format");
    const events = integer(root.events, 2, limits.events);
    const shards = array(root.shards, limits.shards).map((item) =>
      reference(item, limits.shardBytes),
    );
    if (shards.length !== Math.ceil(events / limits.shardEntries))
      fail("index");
    const receipt = receiptCopy(root.receipt);
    if (receipt.records + 2 !== events) fail("receipt");
    let position = 0;
    for (let shardIndex = 0; shardIndex < shards.length; shardIndex++) {
      const entries = array(
        parse(
          await read(
            bucket,
            shardKey(descriptor.artifactId, shardIndex),
            shards[shardIndex]!,
            check,
            signals,
          ),
          limits.shardBytes,
        ),
        limits.shardEntries,
      );
      if (entries.length !== Math.min(limits.shardEntries, events - position))
        fail("index");
      for (const entry of entries) {
        const ref = reference(entry, limits.eventBytes);
        const event = decodeEvent(
          await read(
            bucket,
            eventKey(descriptor.artifactId, position),
            ref,
            check,
            signals,
          ),
          position,
        );
        if (
          (event.kind === "record" && event.role === "commit") !==
          (position === events - 1)
        )
          fail("order");
        position++;
        check();
        yield event;
      }
    }
    if (position !== events) fail("index");
  };
}
/** A writer is single-use and refuses overlapping operations. Each write owns
 * copied ciphertext before its first await. Abort preserves partial storage.
 * A late R2 acknowledgment can leave an ambiguous object, never a returned
 * successful descriptor. Caller must use a fresh artifact ID after failure. */
export function createR2RecoveryArtifact(
  bucket: RecoveryArtifactBucket,
  artifactId: string,
): RecoveryArtifactWriter {
  const id = idCopy(artifactId);
  let state: "new" | "writing" | "complete" | "failed" = "new",
    busy = false;
  let count = 0,
    committed = false;
  let entries: Reference[] = [],
    shards: Reference[] = [];
  let completed: RecoveryArtifactDescriptor | undefined;
  const descriptor = () => completed ?? fail("incomplete");
  const clear = () => {
    entries = [];
    shards = [];
  };
  async function guarded(
    signal: AbortSignal,
    work: (check: () => void) => Promise<void>,
  ) {
    if (busy || state === "failed" || state === "complete") {
      state = "failed";
      completed = undefined;
      clear();
      fail("state");
    }
    busy = true;
    const check = () => {
      checkSignals([signal]);
      if (state === "failed") fail("state");
    };
    try {
      check();
      await work(check);
      check();
    } catch (error) {
      state = "failed";
      completed = undefined;
      clear();
      throw error;
    } finally {
      busy = false;
    }
  }
  async function flush(check: () => void, signal: AbortSignal) {
    if (!entries.length) return;
    if (shards.length >= limits.shards) fail("bounds");
    const ref = await put(
      bucket,
      shardKey(id, shards.length),
      jsonBytes(entries, limits.shardBytes),
      check,
      [signal],
    );
    shards.push(ref);
    entries = [];
  }
  return {
    async write(event, signal) {
      // No lazy references to caller-owned event arrays cross the first await.
      const encoded = encodeEvent(event, count);
      const terminal = event.kind === "record" && event.role === "commit";
      await guarded(signal, async (check) => {
        if (committed || count >= limits.events) fail("bounds");
        if (state === "new") {
          await put(
            bucket,
            `${prefix(id)}claim`,
            jsonBytes(
              { format: RECOVERY_ARTIFACT_R2_FORMAT, artifactId: id },
              512,
            ),
            check,
            [signal],
          );
          state = "writing";
        }
        const ref = await put(bucket, eventKey(id, count), encoded, check, [
          signal,
        ]);
        entries.push(ref);
        count++;
        committed = terminal;
        if (entries.length === limits.shardEntries) await flush(check, signal);
      });
    },
    async complete(input, signal) {
      const receipt = receiptCopy(input);
      await guarded(signal, async (check) => {
        if (!committed || receipt.records + 2 !== count) fail("receipt");
        await flush(check, signal);
        const bytes = jsonBytes(
          {
            format: RECOVERY_ARTIFACT_R2_FORMAT,
            artifactId: id,
            events: count,
            shards,
            receipt,
          },
          limits.indexBytes,
        );
        const ref = await put(bucket, indexKey(id), bytes, check, [signal]);
        completed = Object.freeze({
          format: RECOVERY_ARTIFACT_R2_FORMAT,
          artifactId: id,
          index: ref,
        });
        state = "complete";
        clear();
      });
    },
    abort() {
      state = "failed";
      completed = undefined;
      clear();
    },
    descriptor,
    source: async function* (signal) {
      yield* openR2RecoveryArtifact(bucket, descriptor())(signal);
    },
  };
}
