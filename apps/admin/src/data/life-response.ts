/** No network access: decode an already supplied response within fixed bounds. */
export const LIFE_RESPONSE_BYTE_LIMIT = 1024 * 1024;

export async function decodeLifeResponse(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const fail = () => new Error("Unsupported Life response");
  const body = response.body;
  if (!body) throw fail();
  const reader = body.getReader();
  let aborted = signal.aborted;
  const cancel = () => {
    // A provider's cancellation promise must not delay rejection.
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = () => {
    aborted = true;
    cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const length = response.headers.get("content-length");
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      aborted ||
      !response.ok ||
      response.redirected ||
      mediaType !== "application/json" ||
      (length !== null &&
        (!/^\d+$/.test(length) || Number(length) > LIFE_RESPONSE_BYTE_LIMIT))
    )
      throw fail();

    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (aborted) throw fail();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > LIFE_RESPONSE_BYTE_LIMIT) throw fail();
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    // Never forward JSON syntax errors, which may include private body text.
    return JSON.parse(text) as unknown;
  } catch {
    cancel();
    throw fail();
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
