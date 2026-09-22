/**
 * Streams a body to at most `limit` bytes, whatever Content-Length claims.
 * Past the limit it cancels the stream and returns false. Read errors throw.
 */
export async function drainBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  onChunk: (chunk: Uint8Array) => void,
): Promise<boolean> {
  const reader = stream.getReader();
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return true;
      size += next.value.byteLength;
      if (size > limit) return false;
      onChunk(next.value);
    }
  } finally {
    // A no-op after a complete read; stops the transfer after an overflow.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** The whole body as bytes, or null once it passes `limit`. */
export async function readBoundedBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  if (!(await drainBounded(stream, limit, (chunk) => chunks.push(chunk))))
    return null;
  const bytes = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
