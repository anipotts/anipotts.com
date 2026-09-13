import {
  lifeReadPath,
  readPersonalContext,
  type LifeRead,
  type LifeResult,
} from "./personal-context";

const denied = (): LifeResult => ({
  state: "denied",
  message: "Life access has expired or is unavailable.",
});
const invalid = (): LifeResult => ({
  state: "invalid",
  message: "This request is outside the supported read bounds.",
});
const allowed = new Set(["status", "sources", "search", "get"]);
const byteLimit = 1024 * 1024;

/** No default endpoint, credentials or fetch. Construction does not connect.
 * The separately approved caller owns clearing already displayed data on lock.
 */
export function createLifeOwnerReader(options: {
  endpoint: string;
  ticket: string;
  expiresAt: number;
  fetch: typeof fetch;
  onLock: () => void;
}) {
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/life/v1/read"
  )
    throw new Error("Unsupported Life endpoint");
  if (
    !options.ticket ||
    /[\r\n]/.test(options.ticket) ||
    !Number.isFinite(options.expiresAt) ||
    options.expiresAt <= Date.now() ||
    options.expiresAt - Date.now() > 60_000
  )
    throw new Error("Unsupported Life session");
  // Copy the grant fields so mutations to the caller's object cannot renew it.
  const expiresAt = options.expiresAt;
  const send = options.fetch;
  const notifyLock = options.onLock;
  let ticket = options.ticket;
  let locked = false;
  const pending = new Set<AbortController>();
  let expiryTimer: ReturnType<typeof setTimeout>;
  function lock() {
    if (locked) return;
    locked = true;
    ticket = "";
    clearTimeout(expiryTimer);
    for (const controller of pending) controller.abort();
    pending.clear();
    notifyLock();
  }
  expiryTimer = setTimeout(lock, expiresAt - Date.now());
  async function read(request: LifeRead): Promise<LifeResult> {
    if (locked || Date.now() >= expiresAt) {
      lock();
      return denied();
    }
    if (!allowed.has(request.method)) return denied();
    let path: string;
    try {
      path = lifeReadPath(request);
    } catch {
      return invalid();
    }
    // This URL is parsed in memory only. Search text never enters a network URL.
    const parsed = new URL(path, "https://request.invalid");
    const args: Record<string, string | number> = {};
    for (const [key, value] of parsed.searchParams) {
      args[key] = ["limit", "offset", "body_offset", "body_limit"].includes(key)
        ? Number(value)
        : value;
    }
    if (request.method === "get")
      args.id = parsed.pathname.slice("/api/records/".length);
    const payload = JSON.stringify({ method: request.method, args });
    const controller = new AbortController();
    pending.add(controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        readPersonalContext(request, {
          scope: "owner",
          read: async (_path, signal) => {
            const abort = () => controller.abort();
            signal.addEventListener("abort", abort, { once: true });
            try {
              const response = await send(endpoint.href, {
                method: "POST",
                body: payload,
                signal: controller.signal,
                headers: {
                  Authorization: `Bearer ${ticket}`,
                  "Content-Type": "application/json",
                },
                redirect: "error",
                credentials: "omit",
                cache: "no-store",
                referrerPolicy: "no-referrer",
              });
              if (response.status === 401 || response.status === 403) {
                lock();
                throw new Error("Denied");
              }
              if (
                !response.ok ||
                response.redirected ||
                response.headers
                  .get("content-type")
                  ?.split(";")[0]
                  .trim()
                  .toLowerCase() !== "application/json" ||
                !response.body
              )
                throw new Error("Unsupported response");
              const reader = response.body.getReader();
              const cancel = () => {
                void reader.cancel().catch(() => undefined);
              };
              controller.signal.addEventListener("abort", cancel, {
                once: true,
              });
              let complete = false;
              try {
                const decoder = new TextDecoder("utf-8", { fatal: true });
                let bytes = 0;
                let text = "";
                while (true) {
                  if (controller.signal.aborted) throw new Error("Cancelled");
                  const chunk = await reader.read();
                  if (controller.signal.aborted) throw new Error("Cancelled");
                  if (chunk.done) break;
                  bytes += chunk.value.byteLength;
                  if (bytes > byteLimit)
                    throw new Error("Unsupported response");
                  text += decoder.decode(chunk.value, { stream: true });
                }
                text += decoder.decode();
                const data: unknown = JSON.parse(text);
                complete = true;
                return data;
              } finally {
                if (!complete) cancel();
                controller.signal.removeEventListener("abort", cancel);
                reader.releaseLock();
              }
            } finally {
              signal.removeEventListener("abort", abort);
            }
          },
        }),
        new Promise<LifeResult>((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () =>
              resolve(
                locked
                  ? denied()
                  : {
                      state: "unavailable",
                      message: "Life read could not be completed.",
                    },
              ),
            { once: true },
          );
          timeout = setTimeout(() => controller.abort(), 5000);
        }),
      ]);
      if (locked || Date.now() >= expiresAt) {
        lock();
        return denied();
      }
      return result;
    } finally {
      clearTimeout(timeout);
      controller.abort();
      pending.delete(controller);
    }
  }
  return { read, lock };
}
