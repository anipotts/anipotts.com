import { Buffer } from "node:buffer";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  RECOVERY_MEDIA_CONTAINER_FORMAT,
  RECOVERY_MEDIA_CONTAINER_LIMITS as limits,
  writeRecoveryMediaContainer,
  readRecoveryMediaManifest,
  verifyRecoveryMediaContainer,
} from "./recovery-media-container.mjs";

// Supplied-data codec only. No filesystem, provider, custody, production binding,
// eligibility or capture/restore adapter. Legacy v1/v2 envelopes are unchanged.
export const ENCRYPTED_RECOVERY_MEDIA_FORMAT =
  "anipotts.editorial-recovery-media.aes256gcm";
export const ENCRYPTED_RECOVERY_MEDIA_LIMITS = Object.freeze({
  headerBytes: 8192,
  commitBytes: 2048,
  timeoutMs: 20_000,
  records:
    limits.entries +
    Math.ceil(limits.aggregateBytes / limits.frameBytes) +
    Math.ceil(limits.manifestBytes / limits.frameBytes) +
    1,
});
const bounds = ENCRYPTED_RECOVERY_MEDIA_LIMITS;
const nativeLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
).get;
export class EncryptedRecoveryMediaError extends Error {
  constructor(code) {
    super(`encrypted_recovery_media_${code}`);
    this.code = code;
  }
}
const fail = (code) => {
  throw new EncryptedRecoveryMediaError(code);
};
const normalized = (error) =>
  error instanceof EncryptedRecoveryMediaError
    ? error
    : new EncryptedRecoveryMediaError("transfer");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fields(value, names) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== names.length ||
    Reflect.ownKeys(value).length !== names.length ||
    !names.every((name) =>
      Object.prototype.propertyIsEnumerable.call(value, name),
    )
  )
    fail("schema");
}
// Only fixed shallow format/context structures use this encoder. The supplied
// media manifest uses its independently bounded canonical transport validator.
function canonical(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  )
    return JSON.stringify(value);
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  fail("schema");
}
function contextCopy(value) {
  fields(value, [
    "captureId",
    "applicationRevision",
    "contentSchemaVersion",
    "editorialGeneration",
    "contentGeneration",
  ]);
  const context = Object.fromEntries(
    Object.keys(value).map((key) => [key, value[key]]),
  );
  if (
    typeof context.captureId !== "string" ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/iu.test(context.captureId) ||
    typeof context.applicationRevision !== "string" ||
    !/^[a-f\d]{40}$/u.test(context.applicationRevision) ||
    context.contentSchemaVersion !== 1 ||
    ![context.editorialGeneration, context.contentGeneration].every(
      (n) => Number.isSafeInteger(n) && n >= 1,
    )
  )
    fail("context");
  return Object.freeze(context);
}
function copyBytes(value, maximum, exact) {
  if (!(value instanceof Uint8Array)) fail("binary");
  const length = nativeLength.call(value);
  if (length > maximum || (exact !== undefined && length !== exact))
    fail("binary");
  // Buffer.from(typedArray) trusts an overridden .length. The intrinsic copy
  // has trusted own storage; expose a view so Operation wiping also clears the
  // sole normalized allocation, without an untracked intermediate key copy.
  const normalized = new Uint8Array(value);
  return Buffer.from(
    normalized.buffer,
    normalized.byteOffset,
    normalized.byteLength,
  );
}
function hex(value, length) {
  if (
    typeof value !== "string" ||
    value.length !== length * 2 ||
    !/^[a-f\d]+$/u.test(value)
  )
    fail("binary");
  return Buffer.from(value, "hex");
}
class Operation {
  #owned = new Set();
  #timer;
  #external;
  #remove;
  #start = performance.now();
  #timeout;
  #waits = 0;
  #ended = false;
  controller = new AbortController();
  error = null;
  sinkAborted = false;
  constructor(options = {}) {
    this.#timeout = options.timeoutMs ?? bounds.timeoutMs;
    if (
      !Number.isSafeInteger(this.#timeout) ||
      this.#timeout < 1 ||
      this.#timeout > bounds.timeoutMs
    )
      fail("deadline");
    this.#external = options.signal;
    this.#remove = () => this.cancel("aborted");
    this.#external?.addEventListener("abort", this.#remove, { once: true });
    this.#timer = setTimeout(() => this.cancel("deadline"), this.#timeout);
    if (this.#external?.aborted) this.cancel("aborted");
  }
  own(bytes) {
    try {
      this.check();
    } catch (error) {
      bytes.fill(0);
      throw error;
    }
    this.#owned.add(bytes);
    return bytes;
  }
  release(bytes) {
    bytes.fill(0);
    this.#owned.delete(bytes);
  }
  cancel(code) {
    if (this.#ended) return;
    this.error ??= new EncryptedRecoveryMediaError(code);
    for (const bytes of this.#owned) bytes.fill(0);
    this.#owned.clear();
    this.controller.abort();
  }
  check() {
    if (performance.now() - this.#start >= this.#timeout)
      this.cancel("deadline");
    if (this.error) throw this.error;
    if (this.#ended) fail("closed");
  }
  call(callback) {
    this.check();
    return this.wait(callback());
  }
  async wait(value) {
    const observed = Promise.resolve(value);
    void observed.catch(() => {});
    this.check();
    const signal = this.controller.signal;
    const result = await new Promise((resolve, reject) => {
      const abort = () =>
        reject(this.error ?? new EncryptedRecoveryMediaError("aborted"));
      signal.addEventListener("abort", abort, { once: true });
      observed.then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
      if (signal.aborted) abort();
    });
    this.check();
    // Ready readers must not indefinitely starve timers or external revocation.
    if (++this.#waits % 32 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.check();
    }
    return result;
  }
  dispose() {
    clearTimeout(this.#timer);
    this.#external?.removeEventListener("abort", this.#remove);
    for (const bytes of this.#owned) bytes.fill(0);
    this.#owned.clear();
    this.#ended = true;
  }
}
function contract(sink, methods) {
  if (!sink || !methods.every((name) => typeof sink[name] === "function"))
    fail("sink");
}
function abort(sink, operation) {
  if (operation.sinkAborted) return;
  operation.sinkAborted = true;
  operation.cancel("transfer");
  try {
    void Promise.resolve(sink.abort()).catch(() => {});
  } catch {
    /* Staging stays incomplete. */
  }
}
function base(context) {
  return {
    format: ENCRYPTED_RECOVERY_MEDIA_FORMAT,
    version: 1,
    algorithm: "AES-256-GCM",
    mediaFormat: RECOVERY_MEDIA_CONTAINER_FORMAT,
    context,
  };
}
function sealBlock(key, iv, plaintext, aad) {
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  return {
    ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]),
    tag: cipher.getAuthTag(),
  };
}
function openBlock(key, iv, ciphertext, tag, aad) {
  let provisional;
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad));
    cipher.setAuthTag(tag);
    provisional = cipher.update(ciphertext);
    return Buffer.concat([provisional, cipher.final()]);
  } catch {
    fail("authentication");
  } finally {
    provisional?.fill(0);
  }
}
function nonce(sequence) {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > bounds.records
  )
    fail("sequence");
  const iv = Buffer.alloc(12);
  iv.writeUInt32BE(sequence, 8);
  return iv;
}
function prefix(digest, bytes) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.byteLength);
  digest.update(size).update(bytes);
}
function transcript(header) {
  const digest = createHash("sha256");
  prefix(digest, Buffer.from(header));
  return digest;
}
function metadata(record) {
  return {
    role: record.role,
    sequence: record.sequence,
    objectIndex: record.objectIndex,
    index: record.index,
    length: record.length,
  };
}
function recordTranscript(digest, record) {
  prefix(digest, Buffer.from(canonical(metadata(record))));
  prefix(digest, record.ciphertext);
  prefix(digest, record.tag);
}
function aad(headerHash, record) {
  return canonical({ header: headerHash, ...metadata(record) });
}
function recordCopy(input, expected) {
  fields(input, [
    "kind",
    "role",
    "sequence",
    "objectIndex",
    "index",
    "length",
    "ciphertext",
    "tag",
  ]);
  const value = {
    kind: input.kind,
    role: input.role,
    sequence: input.sequence,
    objectIndex: input.objectIndex,
    index: input.index,
    length: input.length,
  };
  if (
    value.kind !== "record" ||
    value.sequence !== expected ||
    !Number.isSafeInteger(value.length) ||
    value.length < 1 ||
    value.length > limits.frameBytes ||
    !["media", "manifest", "commit"].includes(value.role) ||
    !Number.isSafeInteger(value.index) ||
    value.index < 0 ||
    (value.role === "media"
      ? !Number.isSafeInteger(value.objectIndex) ||
        value.objectIndex < 0 ||
        value.objectIndex >= limits.entries ||
        value.index >= Math.ceil(limits.objectBytes / limits.frameBytes)
      : value.objectIndex !== -1 ||
        value.index >= Math.ceil(limits.manifestBytes / limits.frameBytes)) ||
    (value.role === "commit" &&
      (value.length > bounds.commitBytes || value.index !== 0))
  )
    fail("record");
  nonce(value.sequence);
  return {
    ...value,
    ciphertext: copyBytes(input.ciphertext, limits.frameBytes, value.length),
    tag: copyBytes(input.tag, 16, 16),
  };
}
function iterator(source) {
  const value =
    source?.[Symbol.asyncIterator]?.() ?? source?.[Symbol.iterator]?.();
  if (!value || typeof value.next !== "function") fail("source");
  return value;
}
function closeIterator(source) {
  try {
    void Promise.resolve(source.return?.()).catch(() => {});
  } catch {
    /* No finalization after failed cleanup. */
  }
}
async function* guarded(read, object, index, operation) {
  operation.check();
  const source = iterator(read(object, index));
  try {
    for (;;) {
      const next = await operation.call(() => source.next());
      if (next.done) return;
      yield next.value;
    }
  } finally {
    closeIterator(source);
  }
}

export async function sealEncryptedRecoveryMedia(
  plan,
  read,
  key,
  context,
  sink,
  options = {},
) {
  const identity = contextCopy(context);
  contract(sink, ["write", "complete", "abort"]);
  const operation = new Operation(options);
  let receipt;
  try {
    operation.check();
    const master = operation.own(copyBytes(key, 32, 32));
    const dek = operation.own(randomBytes(32));
    const iv = randomBytes(12);
    const basis = base(identity);
    const wrapped = sealBlock(master, iv, dek, canonical(basis));
    operation.release(master);
    const header = canonical({
      ...basis,
      wrap: {
        iv: iv.toString("hex"),
        ciphertext: wrapped.ciphertext.toString("hex"),
        tag: wrapped.tag.toString("hex"),
      },
    });
    if (Buffer.byteLength(header) > bounds.headerBytes) fail("header");
    const headerHash = sha(header);
    const digest = transcript(header);
    let sequence = 0,
      started = false;
    const start = async () => {
      if (started) return;
      operation.check();
      await operation.call(() =>
        sink.write(
          { kind: "header", serialized: header },
          operation.controller.signal,
        ),
      );
      started = true;
    };
    const emit = async (role, objectIndex, index, plaintext) => {
      operation.check();
      await start();
      operation.check();
      const meta = {
        kind: "record",
        role,
        sequence: ++sequence,
        objectIndex,
        index,
        length: plaintext.byteLength,
      };
      const sealed = sealBlock(
        dek,
        nonce(sequence),
        plaintext,
        aad(headerHash, meta),
      );
      const record = { ...meta, ...sealed };
      if (role !== "commit") recordTranscript(digest, record);
      await operation.call(() =>
        sink.write(record, operation.controller.signal),
      );
    };
    await operation.wait(
      writeRecoveryMediaContainer(
        plan,
        (object, index) => guarded(read, object, index, operation),
        {
          async writeFrame(frame) {
            await emit("media", frame.objectIndex, frame.index, frame.bytes);
          },
          async writeManifest(serialized) {
            const manifest = readRecoveryMediaManifest(serialized);
            const bytes = operation.own(Buffer.from(serialized));
            try {
              for (
                let offset = 0, index = 0;
                offset < bytes.byteLength;
                offset += limits.frameBytes, index++
              )
                await emit(
                  "manifest",
                  -1,
                  index,
                  bytes.subarray(offset, offset + limits.frameBytes),
                );
            } finally {
              operation.release(bytes);
            }
            receipt = {
              mediaBytes: manifest.totalBytes,
              mediaFrames: manifest.totalFrames,
              manifestBytes: Buffer.byteLength(serialized),
              manifestHash: sha(serialized),
              records: sequence,
              transcript: digest.digest("hex"),
            };
            await emit("commit", -1, 0, Buffer.from(canonical(receipt)));
          },
          abort() {
            abort(sink, operation);
          },
        },
      ),
    );
    operation.check();
    await operation.call(() =>
      sink.complete(Object.freeze(receipt), operation.controller.signal),
    );
    return Object.freeze(receipt);
  } catch (error) {
    abort(sink, operation);
    throw normalized(error);
  } finally {
    operation.dispose();
  }
}

function headerCopy(event, expected) {
  fields(event, ["kind", "serialized"]);
  const text = event.serialized;
  if (
    event.kind !== "header" ||
    typeof text !== "string" ||
    text.length > bounds.headerBytes ||
    Buffer.byteLength(text) > bounds.headerBytes
  )
    fail("header");
  let header;
  try {
    header = JSON.parse(text);
  } catch {
    fail("header");
  }
  fields(header, [
    "format",
    "version",
    "algorithm",
    "mediaFormat",
    "context",
    "wrap",
  ]);
  fields(header.wrap, ["iv", "ciphertext", "tag"]);
  const identity = contextCopy(header.context);
  const iv = hex(header.wrap.iv, 12),
    ciphertext = hex(header.wrap.ciphertext, 32),
    tag = hex(header.wrap.tag, 16);
  if (
    canonical({ ...base(identity), wrap: header.wrap }) !== text ||
    canonical(identity) !== canonical(expected) ||
    header.format !== ENCRYPTED_RECOVERY_MEDIA_FORMAT ||
    header.version !== 1 ||
    header.algorithm !== "AES-256-GCM" ||
    header.mediaFormat !== RECOVERY_MEDIA_CONTAINER_FORMAT
  )
    fail("context");
  return { text, header, iv, ciphertext, tag };
}
function commitCopy(bytes) {
  if (bytes.byteLength > bounds.commitBytes) fail("commit");
  const text = bytes.toString("utf8");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("commit");
  }
  fields(value, [
    "mediaBytes",
    "mediaFrames",
    "manifestBytes",
    "manifestHash",
    "records",
    "transcript",
  ]);
  if (
    ![
      value.mediaBytes,
      value.mediaFrames,
      value.manifestBytes,
      value.records,
    ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    ![value.manifestHash, value.transcript].every(
      (hash) => typeof hash === "string" && /^[a-f\d]{64}$/u.test(hash),
    ) ||
    canonical(value) !== text
  )
    fail("commit");
  return value;
}
async function* pass(factory, key, expectedContext, operation, prior) {
  operation.check();
  const source = iterator(factory());
  let dek;
  let chunks = [],
    totalManifest = 0,
    mediaBytes = 0,
    mediaFrames = 0,
    manifestFrames = 0,
    previousManifestLength = limits.frameBytes,
    sequence = 0,
    phase = "media",
    complete = false;
  try {
    const initial = await operation.call(() => source.next());
    if (initial.done) fail("truncated");
    const header = headerCopy(initial.value, expectedContext);
    if (prior && header.text !== prior.header) fail("changed_source");
    dek = operation.own(
      openBlock(
        key,
        header.iv,
        header.ciphertext,
        header.tag,
        canonical(base(expectedContext)),
      ),
    );
    if (dek.byteLength !== 32) fail("key");
    const digest = transcript(header.text);
    const manifestHash = createHash("sha256");
    for (;;) {
      const next = await operation.call(() => source.next());
      if (next.done) fail("truncated");
      const record = recordCopy(next.value, ++sequence);
      const plaintext = operation.own(
        openBlock(
          dek,
          nonce(sequence),
          record.ciphertext,
          record.tag,
          aad(sha(header.text), record),
        ),
      );
      try {
        if (record.role === "commit") {
          if (!manifestFrames || phase !== "manifest") fail("order");
          const receipt = commitCopy(plaintext);
          const observed = {
            mediaBytes,
            mediaFrames,
            manifestBytes: totalManifest,
            manifestHash: manifestHash.digest("hex"),
            records: sequence - 1,
            transcript: digest.digest("hex"),
          };
          if (canonical(receipt) !== canonical(observed)) fail("commit");
          const end = await operation.call(() => source.next());
          if (!end.done) fail("trailing");
          let serialized;
          if (prior) {
            if (canonical(receipt) !== canonical(prior.receipt))
              fail("changed_source");
            serialized = prior.manifest;
          } else {
            const buffer = operation.own(Buffer.concat(chunks, totalManifest));
            try {
              serialized = new TextDecoder("utf-8", { fatal: true }).decode(
                buffer,
              );
            } catch {
              fail("manifest");
            } finally {
              operation.release(buffer);
            }
          }
          const manifest = readRecoveryMediaManifest(serialized);
          if (
            manifest.totalBytes !== mediaBytes ||
            manifest.totalFrames !== mediaFrames
          )
            fail("commit");
          complete = true;
          yield { receipt, header: header.text, manifest: serialized };
          return;
        }
        recordTranscript(digest, record);
        if (record.role === "media") {
          if (phase !== "media") fail("order");
          mediaBytes += plaintext.byteLength;
          mediaFrames++;
          if (mediaBytes > limits.aggregateBytes) fail("media_limit");
          if (prior)
            yield {
              frame: {
                objectIndex: record.objectIndex,
                index: record.index,
                bytes: plaintext,
              },
            };
        } else {
          phase = "manifest";
          if (
            record.index !== manifestFrames++ ||
            previousManifestLength !== limits.frameBytes
          )
            fail("order");
          previousManifestLength = plaintext.byteLength;
          totalManifest += plaintext.byteLength;
          if (totalManifest > limits.manifestBytes) fail("manifest_limit");
          manifestHash.update(plaintext);
          if (!prior) chunks.push(operation.own(Buffer.from(plaintext)));
        }
      } finally {
        operation.release(plaintext);
      }
    }
  } catch (error) {
    operation.error ??= normalized(error);
    throw error;
  } finally {
    if (dek) operation.release(dek);
    for (const bytes of chunks) operation.release(bytes);
    chunks = [];
    closeIterator(source);
    if (!complete) operation.check();
  }
}
export async function openEncryptedRecoveryMedia(
  sourceFactory,
  key,
  expectedContext,
  sink,
  options = {},
) {
  const identity = contextCopy(expectedContext);
  contract(sink, ["writeFrame", "writeManifest", "abort"]);
  const operation = new Operation(options);
  try {
    operation.check();
    const master = operation.own(copyBytes(key, 32, 32));
    if (typeof sourceFactory !== "function") fail("source");
    let verified;
    for await (const value of pass(sourceFactory, master, identity, operation))
      verified = value;
    if (!verified) fail("truncated");
    const frames = async function* () {
      for await (const value of pass(
        sourceFactory,
        master,
        identity,
        operation,
        verified,
      ))
        if (value.frame) yield value.frame;
    };
    const result = await operation.wait(
      verifyRecoveryMediaContainer(verified.manifest, frames(), {
        async writeFrame(frame) {
          operation.check();
          await operation.call(() =>
            sink.writeFrame(frame, operation.controller.signal),
          );
        },
        async writeManifest(serialized) {
          operation.check();
          await operation.call(() =>
            sink.writeManifest(serialized, operation.controller.signal),
          );
        },
        abort() {
          abort(sink, operation);
        },
      }),
    );
    return result;
  } catch (error) {
    abort(sink, operation);
    throw normalized(error);
  } finally {
    operation.dispose();
  }
}
