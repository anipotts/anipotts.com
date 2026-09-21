import { discardBody } from "../lib/response-body";

/** A trusted transport outcome, never a provider error body or private URL. */
export class PersonalContextHttpError extends Error {
  constructor(readonly status: number) {
    super("Private reader request failed");
    this.name = "PersonalContextHttpError";
  }
}

/** Used by an approved HTTP transport; this does not establish or grant access. */
export async function readPersonalContextResponse(
  response: Response,
): Promise<unknown> {
  if (!response.ok) {
    discardBody(response);
    throw new PersonalContextHttpError(response.status);
  }
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json") ||
    !response.body
  ) {
    discardBody(response);
    throw new Error("Unsupported reader response");
  }
  const limit = 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new Error("Reader response exceeds limit");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
