/**
 * Which hop failed when a private reader read went wrong, so a notice names
 * the right one (ledger A-26). A read crosses three hops: admin issues the
 * short credential, the browser sends the request, and ap-mini's reader
 * answers it.
 *
 * - `unissued`: admin's own credential route failed. Nothing reached ap-mini.
 * - `offline`, `blocked`: the browser says it sent nothing: it is offline,
 *   or it refused local network access to the reader.
 * - `unanswered`: the request failed at once with no reply. The browser does
 *   not say why: a blocked request (an extension's ERR_BLOCKED_BY_CLIENT)
 *   and a refused or unresolved connection fail the same way, in Chromium
 *   and WebKit alike, so this names no cause on ap-mini.
 * - `timeout`: the request went out and nothing came back within the
 *   read's deadline. A block fails at once, so this is a real network
 *   failure, and the only case that says ap-mini is unreachable.
 * - `reader`: ap-mini's reader answered, with a server error.
 */
export type ReaderHop =
  "unissued" | "offline" | "blocked" | "unanswered" | "timeout" | "reader";

/** The notice title for each hop: fixed copy, never reader text. */
export const READER_HOP_TITLES: Record<ReaderHop, string> = {
  unissued: "Credential not issued",
  offline: "Browser offline",
  blocked: "Blocked by this browser",
  unanswered: "No answer from ap-mini",
  timeout: "ap-mini unreachable",
  reader: "Reader unavailable",
};

/** A reader request that got no reply, and which hop the browser can name. */
export class ReaderNoReplyError extends Error {
  readonly hop: Extract<
    ReaderHop,
    "offline" | "blocked" | "unanswered" | "timeout"
  >;
  constructor(hop: ReaderNoReplyError["hop"]) {
    super(`reader_${hop}`);
    this.name = "ReaderNoReplyError";
    this.hop = hop;
  }
}

/** What the browser itself says about a request that failed with no reply:
 * offline, or local network access to the reader denied. Nothing else it
 * reports tells a block from a network failure. */
async function browserHop(): Promise<"offline" | "blocked" | "unanswered"> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.onLine === false) return "offline";
  try {
    const permission = await nav?.permissions?.query({
      name: "local-network-access" as PermissionName,
    });
    if (permission?.state === "denied") return "blocked";
  } catch {
    // Not a permission this browser knows.
  }
  return "unanswered";
}

/**
 * One reader fetch. A request that fails with no reply throws
 * ReaderNoReplyError naming the hop the browser can see. A cancelled
 * request rethrows as it came, since its caller knows whether that was its
 * own deadline.
 */
export async function fetchReader(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch (error) {
    if (init.signal?.aborted || !(error instanceof TypeError)) throw error;
    throw new ReaderNoReplyError(await browserHop());
  }
}
