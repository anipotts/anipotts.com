import {
  BrowserRecoveryVault,
  RecoveryEncryptionError,
  type RecoveryEncryptionContext,
} from "./browser-recovery-encryption";

const format = "anipotts.browser-recovery-bundle";
const chunkLength = 32768;
const rawLimit = 32 * 1024 * 1024;
const serializedLimit = 64 * 1024 * 1024;
const digest = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
export { digest as recoveryStringHash };
function problem(): never {
  throw new RecoveryEncryptionError("corrupt");
}
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== keys.sort().join("|")
  )
    problem();
}
/** One encrypted manifest authenticates every chunk, order and exact UTF-16
 * length. Splitting UTF-16 is intentional: the codec preserves lone surrogates. */
export async function encryptRecoveryBundle(
  vault: BrowserRecoveryVault,
  raw: string,
  context: RecoveryEncryptionContext,
): Promise<string> {
  if (
    raw.length > rawLimit ||
    new TextEncoder().encode(raw).byteLength > rawLimit
  )
    throw new RecoveryEncryptionError("oversized");
  const id = crypto.randomUUID();
  const chunks: string[] = [];
  const hashes: string[] = [];
  for (
    let offset = 0;
    offset < raw.length || offset === 0;
    offset += chunkLength
  ) {
    const encrypted = await vault.encrypt(
      JSON.stringify({
        id,
        index: chunks.length,
        text: raw.slice(offset, offset + chunkLength),
      }),
      context,
    );
    chunks.push(encrypted);
    hashes.push(await digest(encrypted));
  }
  const manifest = await vault.encrypt(
    JSON.stringify({ id, length: raw.length, hashes }),
    context,
  );
  const result = JSON.stringify({ format, version: 3, manifest, chunks });
  if (result.length > serializedLimit)
    throw new RecoveryEncryptionError("oversized");
  return result;
}
export async function decryptRecoveryBundle(
  vault: BrowserRecoveryVault,
  serialized: string,
  context: RecoveryEncryptionContext,
): Promise<string> {
  if (serialized.length > serializedLimit)
    throw new RecoveryEncryptionError("oversized");
  const value: unknown = JSON.parse(serialized);
  exact(value, ["format", "version", "manifest", "chunks"]);
  if (
    value.format !== format ||
    value.version !== 3 ||
    typeof value.manifest !== "string" ||
    !Array.isArray(value.chunks) ||
    value.chunks.length < 1 ||
    value.chunks.length > rawLimit / chunkLength + 1
  )
    problem();
  const manifest: unknown = JSON.parse(
    await vault.decrypt(value.manifest, context),
  );
  exact(manifest, ["id", "length", "hashes"]);
  if (
    typeof manifest.id !== "string" ||
    !/^[a-f0-9-]{36}$/u.test(manifest.id) ||
    !Number.isSafeInteger(manifest.length) ||
    manifest.length < 0 ||
    manifest.length > rawLimit ||
    !Array.isArray(manifest.hashes) ||
    manifest.hashes.length !== value.chunks.length
  )
    problem();
  let result = "";
  for (let index = 0; index < value.chunks.length; index++) {
    const raw = value.chunks[index];
    if (
      typeof raw !== "string" ||
      (await digest(raw)) !== manifest.hashes[index]
    )
      problem();
    const chunk: unknown = JSON.parse(await vault.decrypt(raw, context));
    exact(chunk, ["id", "index", "text"]);
    if (
      chunk.id !== manifest.id ||
      chunk.index !== index ||
      typeof chunk.text !== "string" ||
      chunk.text.length > chunkLength
    )
      problem();
    result += chunk.text;
    if (result.length > manifest.length) problem();
  }
  if (
    result.length !== manifest.length ||
    new TextEncoder().encode(result).byteLength > rawLimit
  )
    problem();
  return result;
}
