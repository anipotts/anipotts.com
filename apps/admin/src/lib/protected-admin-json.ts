import { documentSession } from "./admin-document-session";
import { recoveryLogoutGenerationKey } from "./browser-recovery";

export const protectedSessionLockEvent = "admin:session-lock";
export type AdminRequestFailure =
  "expired" | "denied" | "refused" | "unavailable" | "locked";
export class AdminRequestError extends Error {
  constructor(public readonly kind: AdminRequestFailure) {
    super(`admin request ${kind}`);
  }
}
export type AdminSessionLockReason = AdminRequestFailure | "logout";
let lockReason: AdminSessionLockReason = "locked";
let locked = false;
let generation = 0;
const inflight = new Set<AbortController>();
let installed = false;
let initialGeneration: string | null = null;
/** A locked document requires a real navigation before private views mount. */
export function protectedSessionIsLocked() {
  installLifecycle();
  reconcileDocument();
  return locked;
}
function persistedGeneration() {
  try {
    return window.localStorage.getItem(recoveryLogoutGenerationKey);
  } catch {
    return undefined;
  }
}
export function lockProtectedSession(
  reason: AdminSessionLockReason = "locked",
) {
  locked = true;
  documentSession()?.lock(reason === "logout" ? "logout" : "locked");
  lockReason = reason;
  generation++;
  for (const request of inflight) request.abort();
  inflight.clear();
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(protectedSessionLockEvent, { detail: reason }),
    );
}
export function watchProtectedSession(
  onLock: (reason: AdminSessionLockReason) => void,
): () => void {
  installLifecycle();
  reconcileDocument();
  const listener = (event: Event) =>
    onLock((event as CustomEvent<AdminSessionLockReason>).detail ?? "locked");
  window.addEventListener(protectedSessionLockEvent, listener);
  if (locked) onLock(lockReason);
  return () => window.removeEventListener(protectedSessionLockEvent, listener);
}
function installLifecycle() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const bootstrap = documentSession();
  const current = persistedGeneration();
  initialGeneration = bootstrap ? bootstrap.generation : (current ?? null);
  reconcileDocument();
  window.addEventListener(recoveryLogoutGenerationKey, () =>
    lockProtectedSession("logout"),
  );
  window.addEventListener("storage", (event) => {
    if (event.key === recoveryLogoutGenerationKey || event.key === null)
      lockProtectedSession("logout");
  });
  window.addEventListener("pagehide", () => lockProtectedSession());
  window.addEventListener("pageshow", (event) => {
    const current = persistedGeneration();
    if (current === undefined) lockProtectedSession();
    else if (initialGeneration !== current) lockProtectedSession("logout");
    else if (event.persisted) lockProtectedSession();
  });
}
/** Compare the immutable document baseline even when a storage event is
 * delayed, and before consuming any private response from an earlier epoch. */
function reconcileDocument() {
  if (locked || typeof window === "undefined") return;
  const bootstrap = documentSession();
  const current = persistedGeneration();
  if (bootstrap?.locked) lockProtectedSession(bootstrap.reason);
  else if (current === undefined || bootstrap?.storageAvailable === false)
    lockProtectedSession();
  else if (initialGeneration !== current) lockProtectedSession("logout");
}
/** Same-origin JSON only. Binary previews and tailnet requests retain their own transports. */
export async function protectedAdminJson(
  input: string,
  init: RequestInit = {},
  fetcher: typeof fetch = globalThis.fetch,
  options: { allowLocked?: boolean; maxBytes?: number } = {},
): Promise<Response> {
  installLifecycle();
  reconcileDocument();
  if (
    !input.startsWith("/api/") ||
    input.startsWith("//") ||
    /[\\\r\n]/u.test(input)
  )
    throw new AdminRequestError("unavailable");
  if (locked && !options.allowLocked) throw new AdminRequestError("locked");
  const attempt = generation;
  const request = new AbortController();
  inflight.add(request);
  const signal = AbortSignal.any([
    request.signal,
    init.signal ?? AbortSignal.timeout(15000),
  ]);
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  try {
    const response = await fetcher(input, {
      ...init,
      headers,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    reconcileDocument();
    if (locked && !options.allowLocked) {
      void response.body?.cancel().catch(() => undefined);
      throw new AdminRequestError("locked");
    }
    if (response.status === 401) {
      void response.body?.cancel().catch(() => undefined);
      lockProtectedSession("expired");
      throw new AdminRequestError("expired");
    }
    const json = /^application\/(?:[\w.+-]*\+)?json(?:\s*;|$)/iu.test(
      response.headers.get("content-type") ?? "",
    );
    if (response.status === 403 && !json) {
      void response.body?.cancel().catch(() => undefined);
      lockProtectedSession("denied");
      throw new AdminRequestError("denied");
    }
    if (response.redirected || !json) {
      void response.body?.cancel().catch(() => undefined);
      throw new AdminRequestError("unavailable");
    }
    const limit = options.maxBytes ?? 2 * 1024 * 1024;
    const reader = response.body?.getReader();
    if (!reader) throw new AdminRequestError("unavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new AdminRequestError("unavailable");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    reconcileDocument();
    if (attempt !== generation && !options.allowLocked)
      throw new AdminRequestError("locked");
    signal.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body: unknown = JSON.parse(text);
    if (response.status === 403) {
      const code =
        body && typeof body === "object"
          ? ((body as Record<string, unknown>).error ??
            (body as Record<string, unknown>).code)
          : null;
      // Only known application CSRF refusals are distinct from owner denial.
      if (
        code !== "csrf" &&
        code !== "csrf_invalid" &&
        code !== "invalid_csrf" &&
        code !== "csrf_required" &&
        code !== "origin_required" &&
        code !== "invalid_origin" &&
        code !== "json_required"
      ) {
        lockProtectedSession("denied");
        throw new AdminRequestError("denied");
      }
    }
    const result = new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    const read = result.json.bind(result);
    result.json = async () => {
      const value = await read();
      reconcileDocument();
      if (attempt !== generation && !options.allowLocked)
        throw new AdminRequestError("locked");
      return value;
    };
    return result;
  } catch (error) {
    if (error instanceof AdminRequestError) throw error;
    throw new AdminRequestError(
      locked && !options.allowLocked ? "locked" : "unavailable",
    );
  } finally {
    inflight.delete(request);
  }
}
