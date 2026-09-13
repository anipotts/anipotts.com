import {
  CONNECT_FIELDS,
  projectConnectStatus,
  type ConnectObservation,
} from "./connect-observation";

/** Server-owned authenticated read. No caller-provided URL or credentials. */
export type ConnectReadCapability = (signal: AbortSignal) => Promise<Response>;
export type ConnectReadResult = {
  status: "unconfigured" | "available" | "unavailable";
  observation: ConnectObservation | null;
};

function parseObservation(value: unknown): ConnectObservation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join() !==
      "activity,fields,observedAt,origin,version" ||
    row.version !== 1 ||
    row.origin !== "mini-operator-runtime" ||
    row.activity !== "unknown" ||
    typeof row.observedAt !== "string"
  )
    throw Error("invalid");
  if (
    !row.fields ||
    typeof row.fields !== "object" ||
    Array.isArray(row.fields)
  )
    throw Error("invalid");
  const fields = row.fields as Record<string, unknown>;
  if (
    Object.keys(fields).sort().join() !==
    Object.keys(CONNECT_FIELDS).sort().join()
  )
    throw Error("invalid");
  const projected = projectConnectStatus(
    { auth_runtime: fields },
    row.observedAt,
  );
  for (const key of Object.keys(
    CONNECT_FIELDS,
  ) as (keyof typeof CONNECT_FIELDS)[]) {
    if (fields[key] !== projected.fields[key]) throw Error("invalid");
  }
  return projected;
}

export async function readConnect(
  capability?: ConnectReadCapability,
): Promise<ConnectReadResult> {
  if (!capability) return { status: "unconfigured", observation: null };
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const observation = await Promise.race([
      (async () => {
        const response = await capability(abort.signal);
        if (abort.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          throw Error("timeout");
        }
        if (
          !response.ok ||
          response.redirected ||
          !response.headers.get("content-type")?.includes("application/json") ||
          !response.body
        )
          throw Error("unavailable");
        const reader = response.body.getReader();
        const cancel = () => {
          void reader.cancel().catch(() => undefined);
        };
        abort.signal.addEventListener("abort", cancel, { once: true });
        let bytes = 0;
        let body = "";
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const part = await reader.read();
            if (abort.signal.aborted) throw Error("timeout");
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 8192) throw Error("limit");
            body += decoder.decode(part.value, { stream: true });
          }
          body += decoder.decode();
        } finally {
          abort.signal.removeEventListener("abort", cancel);
          cancel();
          reader.releaseLock();
        }
        return parseObservation(JSON.parse(body));
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(Error("timeout"));
        }, 1500);
      }),
    ]);
    return { status: "available", observation };
  } catch {
    return { status: "unavailable", observation: null };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
