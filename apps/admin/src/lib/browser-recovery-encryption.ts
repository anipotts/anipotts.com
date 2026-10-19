/** Pure recovery codec. Storage, UI and document admission belong to the
 * separately tested session and channel adapters; this module owns no I/O. */
const envelopeFormat = "anipotts.browser-recovery";
const fileFormat = "anipotts.browser-recovery-key";
const algorithm = "AES-256-GCM";
export const RECOVERY_PLAINTEXT_BYTE_LIMIT = 4 * 512 * 1024 + 65536;
export const RECOVERY_CIPHERTEXT_BYTE_LIMIT =
  RECOVERY_PLAINTEXT_BYTE_LIMIT + 16;
export const RECOVERY_ENVELOPE_BYTE_LIMIT =
  4 * Math.ceil(RECOVERY_CIPHERTEXT_BYTE_LIMIT / 3) + 4096;
const keyFileByteLimit = 1024;
// Bound document memory. Re-importing the same key cannot reset its nonce set.
const documentNonceLimit = 65536;
export type RecoveryEncryptionProblem =
  | "unsupported"
  | "corrupt"
  | "oversized"
  | "unavailable"
  | "key-required"
  | "key-lost"
  | "key-id-mismatch"
  | "context-mismatch"
  | "authentication-failed"
  | "nonce-reuse"
  | "key-usage-limit"
  | "stale";
export class RecoveryEncryptionError extends Error {
  constructor(readonly problem: RecoveryEncryptionProblem) {
    super(`Browser recovery: ${problem}`);
    this.name = "RecoveryEncryptionError";
  }
}
function fail(problem: RecoveryEncryptionProblem): never {
  throw new RecoveryEncryptionError(problem);
}
export type RecoveryEncryptionContext = {
  origin: string;
  ownerScope: string;
  recordKind: "page" | "writing" | "project" | "new-writing" | "new-project";
  recordId: string;
  logoutGeneration: string | null;
};
type Header = RecoveryEncryptionContext & {
  format: typeof envelopeFormat;
  version: 3;
  algorithm: typeof algorithm;
  keyId: string;
};
type Envelope = { header: Header; iv: string; ciphertext: string };
const contextFields = [
  "origin",
  "ownerScope",
  "recordKind",
  "recordId",
  "logoutGeneration",
] as const;
const encoder = new TextEncoder();
function bounded(value: unknown, limit: number): asserts value is string {
  if (typeof value !== "string") fail("corrupt");
  if (value.length > limit || encoder.encode(value).byteLength > limit)
    fail("oversized");
}
function fields(value: unknown, names: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== [...names].sort().join("|")
  )
    fail("unsupported");
}
function json(value: unknown, limit: number): Record<string, unknown> {
  bounded(value, limit);
  try {
    const parsed: unknown = JSON.parse(value);
    // The codec emits canonical compact JSON. This also refuses duplicate keys,
    // alternate number spellings and hidden fields, rather than normalizing.
    if (JSON.stringify(parsed) !== value) fail("corrupt");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RecoveryEncryptionError) throw error;
    return fail("corrupt");
  }
}
function provider(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    fail("unavailable");
  return globalThis.crypto;
}
function base64(bytes: Uint8Array<ArrayBuffer>): string {
  // Avoid spreading multi-megabyte ciphertext into a function's arguments.
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function binary(value: unknown, maximum: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length > 4 * Math.ceil(maximum / 3) ||
    !/^[A-Za-z0-9_-]*$/u.test(value)
  )
    fail("corrupt");
  let result: Uint8Array<ArrayBuffer>;
  try {
    result = Uint8Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      (char) => char.charCodeAt(0),
    );
  } catch {
    return fail("corrupt");
  }
  if (result.byteLength > maximum || base64(result) !== value) fail("corrupt");
  return result;
}
function identifier(value: unknown, limit: number) {
  bounded(value, limit);
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) fail("corrupt");
}
function context(value: RecoveryEncryptionContext): RecoveryEncryptionContext {
  fields(value, contextFields);
  identifier(value.origin, 512);
  let url: URL;
  try {
    url = new URL(value.origin);
  } catch {
    return fail("corrupt");
  }
  if (
    url.origin !== value.origin ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    fail("corrupt");
  identifier(value.ownerScope, 320);
  identifier(value.recordId, 512);
  if (
    !["page", "writing", "project", "new-writing", "new-project"].includes(
      value.recordKind,
    )
  )
    fail("unsupported");
  if (value.logoutGeneration !== null) identifier(value.logoutGeneration, 128);
  return Object.fromEntries(
    contextFields.map((name) => [name, value[name]]),
  ) as RecoveryEncryptionContext;
}
function header(value: RecoveryEncryptionContext, keyId: string): Header {
  return {
    format: envelopeFormat,
    version: 3,
    algorithm,
    keyId,
    ...context(value),
  };
}
function readEnvelope(serialized: string): Envelope {
  const value = json(serialized, RECOVERY_ENVELOPE_BYTE_LIMIT);
  fields(value, ["header", "iv", "ciphertext"]);
  fields(value.header, [
    "format",
    "version",
    "algorithm",
    "keyId",
    ...contextFields,
  ]);
  const received = value.header as Header;
  if (
    received.format !== envelopeFormat ||
    received.version !== 3 ||
    received.algorithm !== algorithm
  )
    fail("unsupported");
  if (
    typeof received.keyId !== "string" ||
    !/^[a-f0-9]{64}$/u.test(received.keyId)
  )
    fail("corrupt");
  const normalized = header(
    Object.fromEntries(
      contextFields.map((name) => [name, received[name]]),
    ) as RecoveryEncryptionContext,
    received.keyId,
  );
  if (JSON.stringify(normalized) !== JSON.stringify(received)) fail("corrupt");
  const iv = binary(value.iv, 12);
  const ciphertext = binary(value.ciphertext, RECOVERY_CIPHERTEXT_BYTE_LIMIT);
  if (iv.byteLength !== 12 || ciphertext.byteLength < 16) fail("corrupt");
  return {
    header: normalized,
    iv: value.iv as string,
    ciphertext: value.ciphertext as string,
  };
}
/** Bounded public metadata only. Opaque unsupported/legacy values remain the
 * caller's responsibility and must never be rewritten because inspection fails. */
export function inspectBrowserRecoveryEnvelope(
  serialized: string,
): Readonly<Header> {
  return Object.freeze({ ...readEnvelope(serialized).header });
}
async function keyId(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await provider().subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
/** Creates key-file text only; never writes a file.
 * Setup must require re-import/challenge, not treat a download click as custody. */
export async function createBrowserRecoveryKeyFile(): Promise<string> {
  const bytes = provider().getRandomValues(new Uint8Array(32));
  try {
    return JSON.stringify({
      format: fileFormat,
      version: 1,
      algorithm,
      keyId: await keyId(bytes),
      key: base64(bytes),
    });
  } catch (error) {
    if (error instanceof RecoveryEncryptionError) throw error;
    return fail("unavailable");
  } finally {
    bytes.fill(0);
  }
}

/** One vault per document, shared by future form adapters through module memory.
 * No implicit unlock, key sharing, plaintext fallback, storage writes or deletes. */
export class BrowserRecoveryVault {
  #key: CryptoKey | null = null;
  #keyId: string | null = null;
  #epoch = 0;
  #reason: "key-required" | "key-lost" = "key-required";
  #nonces = new Map<string, Set<string>>();
  #nonceCount = 0;
  get state():
    | { status: "locked"; reason: "key-required" | "key-lost" }
    | { status: "unlocked"; keyId: string } {
    return this.#key && this.#keyId
      ? { status: "unlocked", keyId: this.#keyId }
      : { status: "locked", reason: this.#reason };
  }
  lock(reason: "key-required" | "key-lost" = "key-required") {
    this.#epoch++;
    this.#key = null;
    this.#keyId = null;
    this.#reason = reason;
  }
  #current(epoch: number) {
    if (this.#epoch !== epoch) fail("stale");
  }
  #active() {
    if (!this.#key || !this.#keyId) return fail(this.#reason);
    return { key: this.#key, id: this.#keyId, epoch: this.#epoch };
  }
  async unlock(serialized: string): Promise<{ keyId: string }> {
    this.lock();
    const epoch = this.#epoch;
    const file = json(serialized, keyFileByteLimit);
    fields(file, ["format", "version", "algorithm", "keyId", "key"]);
    if (
      file.format !== fileFormat ||
      file.version !== 1 ||
      file.algorithm !== algorithm
    )
      fail("unsupported");
    const bytes = binary(file.key, 32);
    try {
      if (bytes.byteLength !== 32) fail("corrupt");
      const id = await keyId(bytes);
      this.#current(epoch);
      if (id !== file.keyId) fail("key-id-mismatch");
      const key = await provider().subtle.importKey(
        "raw",
        bytes,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
      this.#current(epoch);
      this.#key = key;
      this.#keyId = id;
      return { keyId: id };
    } catch (error) {
      this.#current(epoch);
      if (error instanceof RecoveryEncryptionError) throw error;
      return fail("unavailable");
    } finally {
      bytes.fill(0);
    }
  }
  async encrypt(
    raw: string,
    identity: RecoveryEncryptionContext,
  ): Promise<string> {
    const active = this.#active();
    bounded(raw, RECOVERY_PLAINTEXT_BYTE_LIMIT);
    // JSON string encoding preserves even opaque strings with lone surrogates.
    const payload = JSON.stringify(raw);
    bounded(payload, RECOVERY_PLAINTEXT_BYTE_LIMIT);
    const authenticated = header(identity, active.id);
    const iv = provider().getRandomValues(new Uint8Array(12));
    const encodedIv = base64(iv);
    const seen = this.#nonces.get(active.id) ?? new Set<string>();
    if (seen.has(encodedIv)) fail("nonce-reuse");
    if (this.#nonceCount >= documentNonceLimit) fail("key-usage-limit");
    // Reserve before awaiting encryption; parallel callers cannot reuse a nonce.
    seen.add(encodedIv);
    this.#nonces.set(active.id, seen);
    this.#nonceCount++;
    const input = encoder.encode(payload);
    let ciphertext: ArrayBuffer;
    try {
      ciphertext = await provider().subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          tagLength: 128,
          additionalData: encoder.encode(JSON.stringify(authenticated)),
        },
        active.key,
        input,
      );
    } catch {
      this.#current(active.epoch);
      return fail("unavailable");
    } finally {
      input.fill(0);
    }
    this.#current(active.epoch);
    return JSON.stringify({
      header: authenticated,
      iv: encodedIv,
      ciphertext: base64(new Uint8Array(ciphertext)),
    });
  }
  async decrypt(
    serialized: string,
    identity: RecoveryEncryptionContext,
  ): Promise<string> {
    const active = this.#active();
    const received = readEnvelope(serialized);
    if (received.header.keyId !== active.id) fail("key-id-mismatch");
    const expected = header(identity, active.id);
    if (JSON.stringify(received.header) !== JSON.stringify(expected))
      fail("context-mismatch");
    let plaintext: ArrayBuffer;
    try {
      plaintext = await provider().subtle.decrypt(
        {
          name: "AES-GCM",
          iv: binary(received.iv, 12),
          tagLength: 128,
          additionalData: encoder.encode(JSON.stringify(received.header)),
        },
        active.key,
        binary(received.ciphertext, RECOVERY_CIPHERTEXT_BYTE_LIMIT),
      );
    } catch {
      this.#current(active.epoch);
      return fail("authentication-failed");
    }
    const bytes = new Uint8Array(plaintext);
    try {
      this.#current(active.epoch);
      if (bytes.byteLength > RECOVERY_PLAINTEXT_BYTE_LIMIT) fail("oversized");
      let raw: unknown;
      try {
        raw = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        return fail("corrupt");
      }
      bounded(raw, RECOVERY_PLAINTEXT_BYTE_LIMIT);
      return raw;
    } finally {
      bytes.fill(0);
    }
  }
}
