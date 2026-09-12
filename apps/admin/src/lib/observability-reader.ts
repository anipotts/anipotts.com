import {
  createUnconfiguredSnapshot,
  parseObservabilitySnapshot,
  type ObservabilitySnapshot,
} from "./observability-model";

/** A reviewed server capability, never a browser-supplied URL or credential. */
export type ObservabilityReadCapability = (
  signal: AbortSignal,
) => Promise<Response>;
export type ObservabilityReadResult = {
  status: "unconfigured" | "connected" | "disconnected";
  snapshot: ObservabilitySnapshot;
};
const MAX_BYTES = 262144;

/** Fail closed. Transport bodies and exceptions never become UI messages or logs. */
export async function readObservability(
  capability?: ObservabilityReadCapability,
): Promise<ObservabilityReadResult> {
  const unavailable = createUnconfiguredSnapshot();
  if (!capability) return { status: "unconfigured", snapshot: unavailable };
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      (async () => {
        const response = await capability(abort.signal);
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json") ||
          !response.body
        )
          throw new Error("unavailable");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) throw new Error("limit");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        const combined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return parseObservabilitySnapshot(
          JSON.parse(new TextDecoder().decode(combined)),
        );
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error("timeout"));
        }, 1500);
      }),
    ]);
    if (snapshot.source !== "live") throw new Error("unavailable");
    return { status: "connected", snapshot };
  } catch {
    return { status: "disconnected", snapshot: unavailable };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
