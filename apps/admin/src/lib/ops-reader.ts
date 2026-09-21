import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createPrivateReaderSession,
  type PrivateReaderSession,
} from "./private-reader-client";
import {
  PRIVATE_READER_ORIGIN,
  PrivateReaderError,
  privateReaderInit,
} from "./private-reader-fetch";
import { discardBody } from "./response-body";
import {
  OPS_V1_BOUNDS,
  OpsSnapshotError,
  parseOpsSnapshotBytes,
  type OpsSnapshot,
} from "./ops-v1";

/**
 * Browser read path for System's ops_v1 snapshot, modelled on the Data reader.
 *
 * The credential comes from a separate issuance route that carries only
 * `ops:read`; a credential with any other scope is refused before it is sent.
 * The snapshot and its ETag live in memory only (`cache: "no-store"`, no Web
 * Storage) and are dropped on logout, denial or credential expiry. Polling
 * runs every 30 seconds and only while the tab is visible.
 *
 * Nothing here runs unless PRIVATE_READER_ENABLED and
 * PRIVATE_READER_OPS_ENABLED are both exactly "true" on the server. The ops
 * flag is set in no deploy yet, and tests use fixtures only.
 */
export const OPS_SNAPSHOT_PATH = "/v1/ops/snapshot";
/** Mirrors PRIVATE_READER_OPS_PATH without pulling signing code into the client. */
export const OPS_CREDENTIAL_ENDPOINT = "/api/private-reader/ops-credential";
export const OPS_SCOPE = "ops:read";
export const OPS_POLL_MS = 30_000;
export const OPS_READ_TIMEOUT_MS = 10_000;

/** A strong or weak entity tag, bounded, printable ASCII only. */
const ETAG = /^(?:W\/)?"[\x21\x23-\x7e]{0,200}"$/;
const validEtag = (value: string | null) =>
  value !== null && ETAG.test(value) ? value : null;

type BearerSource = Pick<
  PrivateReaderSession,
  "bearer" | "renew" | "deny" | "getState"
>;

export type OpsSnapshotRead =
  | { kind: "snapshot"; snapshot: OpsSnapshot; etag: string | null }
  | { kind: "not-modified" };

/** True only for a credential whose scope is exactly `ops:read`. */
function opsScoped(session: BearerSource): boolean {
  const state = session.getState();
  return (
    state.status === "ready" &&
    state.credential.scope.length === 1 &&
    state.credential.scope[0] === OPS_SCOPE
  );
}

async function readBounded(response: Response): Promise<Uint8Array> {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (
    !type.includes("application/json") ||
    !response.body ||
    declared > OPS_V1_BOUNDS.maxBytes
  ) {
    discardBody(response);
    throw new OpsSnapshotError();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > OPS_V1_BOUNDS.maxBytes) throw new OpsSnapshotError();
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * One conditional snapshot GET. A 401 renews the credential once and retries;
 * a second 401 clears the session. A 304 is only accepted for a request that
 * sent an ETag.
 */
export async function readOpsSnapshot(
  session: BearerSource,
  etag: string | null,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<OpsSnapshotRead> {
  const url = new URL(OPS_SNAPSHOT_PATH, PRIVATE_READER_ORIGIN).href;
  const fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const conditional = validEtag(etag);
  let renewed = false;
  for (;;) {
    if (session.getState().status === "ready" && !opsScoped(session)) {
      session.deny();
      throw new PrivateReaderError(403, "forbidden");
    }
    const bearer = session.bearer();
    if (!bearer) throw new PrivateReaderError(401, "expired");
    const init = privateReaderInit(bearer, options.signal);
    init.headers = {
      ...(init.headers as Record<string, string>),
      ...(conditional ? { "If-None-Match": conditional } : {}),
    };
    const response = await fetcher(url, init);
    if (session.getState().status !== "ready") {
      discardBody(response);
      throw new PrivateReaderError(401, "expired");
    }
    if (response.status === 401) {
      discardBody(response);
      if (renewed) {
        session.deny();
        throw new PrivateReaderError(401);
      }
      renewed = true;
      const next = await session.renew();
      if (next.status !== "ready") throw new PrivateReaderError(401);
      continue;
    }
    if (response.status === 304) {
      discardBody(response);
      if (!conditional) throw new PrivateReaderError(502, "unavailable");
      return { kind: "not-modified" };
    }
    if (!response.ok) {
      discardBody(response);
      throw new PrivateReaderError(response.status);
    }
    const snapshot = parseOpsSnapshotBytes(await readBounded(response));
    if (session.getState().status !== "ready")
      throw new PrivateReaderError(401, "expired");
    return {
      kind: "snapshot",
      snapshot,
      etag: validEtag(response.headers.get("etag")),
    };
  }
}

/**
 * `off`: the server flags are not both "true". `unreachable`: issuance or the
 * reader could not be reached or answered with an unexpected error.
 * `unavailable`: the reader answered 503, it has no valid snapshot.
 * `rejected`: the reader sent a snapshot that breaks the contract. `denied`:
 * the owner gate refused issuance, or the reader answered 403 (no ops:read).
 * `ended`: the private session was closed.
 */
export type OpsConnection =
  | "off"
  | "idle"
  | "connecting"
  | "connected"
  | "unreachable"
  | "unavailable"
  | "rejected"
  | "denied"
  | "ended";

export type OpsStatusState = {
  connection: OpsConnection;
  snapshot: OpsSnapshot | null;
  /** When the reader last confirmed the snapshot, by 200 or 304. */
  checkedAt: number | null;
};

type Timer = ReturnType<typeof setTimeout>;

export type OpsStatusOptions = {
  session: PrivateReaderSession;
  fetch?: typeof fetch;
  isHidden?: () => boolean;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  pollMs?: number;
  timeoutMs?: number;
};

export function createOpsStatusController(options: OpsStatusOptions) {
  const { session } = options;
  const now = options.now ?? Date.now;
  const isHidden = options.isHidden ?? (() => document.hidden);
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const pollMs = options.pollMs ?? OPS_POLL_MS;
  const timeoutMs = options.timeoutMs ?? OPS_READ_TIMEOUT_MS;
  const listeners = new Set<() => void>();
  let state: OpsStatusState = {
    connection: "idle",
    snapshot: null,
    checkedAt: null,
  };
  let etag: string | null = null;
  let timer: Timer | null = null;
  let inflight: AbortController | null = null;
  let running = false;
  let lastAttempt = -Infinity;

  function set(next: Partial<OpsStatusState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  /** Private data never outlives the credential that read it. */
  function drop(connection: OpsConnection) {
    etag = null;
    set({ connection, snapshot: null, checkedAt: null });
  }

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    inflight?.abort();
    inflight = null;
  }

  function schedule(delay: number) {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!running || isHidden()) return;
    timer = setTimer(() => void tick(), Math.max(0, delay));
  }

  async function tick() {
    timer = null;
    if (!running || isHidden() || inflight) return;
    const controller = new AbortController();
    inflight = controller;
    lastAttempt = now();
    const deadline = setTimer(() => controller.abort(), timeoutMs);
    const current = () => inflight === controller && running;
    try {
      if (session.getState().status !== "ready") {
        if (!state.snapshot) set({ connection: "connecting" });
        const started = await session.start();
        if (!current()) return;
        if (started.status !== "ready") {
          if (started.status === "cleared" && started.reason === "denied")
            return stop("denied");
          set({ connection: "unreachable" });
          return;
        }
      }
      const read = await readOpsSnapshot(session, etag, {
        fetch: options.fetch,
        signal: controller.signal,
      });
      if (!current()) return;
      if (read.kind === "snapshot") {
        etag = read.etag;
        set({
          connection: "connected",
          snapshot: read.snapshot,
          checkedAt: now(),
        });
      } else set({ connection: "connected", checkedAt: now() });
    } catch (error) {
      if (!current()) return;
      if (error instanceof OpsSnapshotError) drop("rejected");
      else if (
        error instanceof PrivateReaderError &&
        (error.failure === "forbidden" ||
          (error.failure === "unauthorized" &&
            session.getState().status !== "ready"))
      )
        return stop("denied");
      else if (
        error instanceof PrivateReaderError &&
        error.failure === "expired"
      )
        drop("connecting");
      // The reader answered but holds no valid snapshot (missing, over
      // 64 KB or not ops_v1). The last snapshot stays, aging honestly.
      else if (error instanceof PrivateReaderError && error.status === 503)
        set({ connection: "unavailable" });
      // Transport failure: keep the last snapshot, marked as not current.
      else set({ connection: "unreachable" });
    } finally {
      clearTimer(deadline);
      if (inflight === controller) {
        inflight = null;
        schedule(pollMs);
      }
    }
  }

  function stop(connection: OpsConnection) {
    running = false;
    cancel();
    drop(connection);
  }

  // Logout, denial and expiry clear the snapshot along with the credential.
  const unsubscribe = session.subscribe(() => {
    const next = session.getState();
    if (next.status !== "cleared") return;
    if (next.reason === "logout") stop("ended");
    else if (next.reason === "denied") stop("denied");
    else if (next.reason === "expired") drop("connecting");
  });

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Starts polling. Also the owner's "Try again". */
    start() {
      running = true;
      if (!inflight) schedule(0);
    },
    /** Pauses on hide; on show, reads now if the last read is due. */
    visibilityChanged() {
      if (isHidden()) {
        if (timer !== null) clearTimer(timer);
        timer = null;
        inflight?.abort();
        inflight = null;
        return;
      }
      if (!running || inflight) return;
      schedule(lastAttempt + pollMs - now());
    },
    /** Ends the private session and forgets everything it read. */
    end() {
      session.logout();
      stop("ended");
    },
    dispose() {
      unsubscribe();
      running = false;
      cancel();
    },
  };
}

export type OpsStatusController = ReturnType<typeof createOpsStatusController>;

/** Reads the existing same-origin editorial CSRF token for issuance. */
async function readEditorialCsrf(): Promise<string> {
  const response = await fetch("/api/editorial/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("CSRF unavailable");
  const body = (await response.json()) as { csrf?: unknown };
  if (typeof body.csrf !== "string") throw new Error("CSRF unavailable");
  return body.csrf;
}

const OFF: OpsStatusState = Object.freeze({
  connection: "off",
  snapshot: null,
  checkedAt: null,
}) as OpsStatusState;
const offStore = {
  getState: () => OFF,
  subscribe: () => () => undefined,
};

/**
 * Status view binding. With the reader off, nothing is created and no request
 * is made. Otherwise polling starts on mount, follows tab visibility, and the
 * private session ends on page hide (bfcache) and unmount.
 */
export function useOpsStatus({
  enabled,
  controller: injected,
}: {
  enabled: boolean;
  controller?: OpsStatusController;
}): { state: OpsStatusState; controller: OpsStatusController | null } {
  const [controller] = useState<OpsStatusController | null>(() =>
    !enabled
      ? null
      : (injected ??
        createOpsStatusController({
          session: createPrivateReaderSession({
            fetch: (...args) => globalThis.fetch(...args),
            csrf: readEditorialCsrf,
            endpoint: OPS_CREDENTIAL_ENDPOINT,
          }),
        })),
  );
  useEffect(() => {
    if (!controller) return;
    const visibility = () => controller.visibilityChanged();
    const end = () => controller.end();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", end);
    controller.start();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", end);
      // End, not dispose: a remount (Strict Mode) starts the same controller.
      controller.end();
    };
  }, [controller]);
  const store = controller ?? offStore;
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  return { state, controller };
}
