import { createHash } from "node:crypto";

/** Git's blob object id for a source: the legacy base identity of a record. */
export function gitBlobSha1(source: string): string {
  const bytes = Buffer.from(source);
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** SHA-256 of the UTF-8 text, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
}

export function randomHex(byteLength: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Compares every UTF-8 byte, so timing depends on length only. */
export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1)
    mismatch |= leftBytes[index]! ^ rightBytes[index]!;
  return mismatch === 0;
}
