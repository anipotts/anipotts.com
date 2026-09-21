import { useSyncExternalStore } from "react";

/**
 * Browser custody for the short private reader credential.
 *
 * The credential lives in memory only: never localStorage, query strings,
 * logs or caches. Renewal passes the live Access gate each time. Logout,
 * denied renewal and expiry all clear state, which clears any bound UI.
 */
export type PrivateReaderCredential = {
  credential: string;
  scope: string[];
  expiresAt: number;
};

export type PrivateReaderState =
  | { status: "idle" }
  | { status: "ready"; credential: PrivateReaderCredential }
  | { status: "cleared"; reason: PrivateReaderClearReason };

/**
 * `denied`: the admin refused issuance or the reader refused the credential.
 * `unavailable`: issuance is switched off (503) or could not be reached.
 */
export type PrivateReaderClearReason =
  "logout" | "expired" | "denied" | "unavailable";

type Timer = ReturnType<typeof setTimeout>;

export type PrivateReaderSessionOptions = {
  fetch: typeof fetch;
  /** Reads the existing same-origin editorial CSRF token. */
  csrf: () => Promise<string>;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  /** Renew this long before expiry. */
  renewLeadMs?: number;
  endpoint?: string;
};

function parseCredential(value: unknown): PrivateReaderCredential | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.credential !== "string" ||
    !body.credential ||
    typeof body.expiresAt !== "number" ||
    !Number.isSafeInteger(body.expiresAt) ||
    !Array.isArray(body.scope) ||
    !body.scope.every((scope) => typeof scope === "string")
  )
    return null;
  return {
    credential: body.credential,
    scope: [...(body.scope as string[])],
    expiresAt: body.expiresAt,
  };
}

export function createPrivateReaderSession(
  options: PrivateReaderSessionOptions,
) {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const lead = options.renewLeadMs ?? 10_000;
  const endpoint = options.endpoint ?? "/api/private-reader/credential";
  const listeners = new Set<() => void>();
  let state: PrivateReaderState = { status: "idle" };
  let renewTimer: Timer | null = null;
  let expiryTimer: Timer | null = null;
  let generation = 0;
  let inflight: AbortController | null = null;
  let pending: Promise<PrivateReaderState> | null = null;

  function set(next: PrivateReaderState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function cancelTimers() {
    if (renewTimer !== null) clearTimer(renewTimer);
    if (expiryTimer !== null) clearTimer(expiryTimer);
    renewTimer = null;
    expiryTimer = null;
  }

  function clear(reason: PrivateReaderClearReason) {
    generation++;
    inflight?.abort();
    inflight = null;
    pending = null;
    cancelTimers();
    set({ status: "cleared", reason });
  }

  function schedule(credential: PrivateReaderCredential) {
    cancelTimers();
    const remaining = credential.expiresAt * 1000 - now();
    expiryTimer = setTimer(() => clear("expired"), Math.max(0, remaining));
    renewTimer = setTimer(() => void renew(), Math.max(0, remaining - lead));
  }

  /** Concurrent callers share one renewal, so parallel 401s cannot race it. */
  function renew(): Promise<PrivateReaderState> {
    if (pending) return pending;
    const current = attemptRenewal().finally(() => {
      if (pending === current) pending = null;
    });
    pending = current;
    return current;
  }

  async function attemptRenewal(): Promise<PrivateReaderState> {
    const attempt = ++generation;
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    try {
      const token = await options.csrf();
      if (attempt !== generation) return state;
      const response = await options.fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Editorial-CSRF": token,
        },
        body: "{}",
      });
      if (attempt !== generation) return state;
      if (response.status === 503) {
        clear("unavailable");
        return state;
      }
      const credential = response.ok
        ? parseCredential(await response.json())
        : null;
      if (attempt !== generation) return state;
      if (!credential || credential.expiresAt * 1000 <= now()) {
        clear("denied");
        return state;
      }
      inflight = null;
      set({ status: "ready", credential });
      schedule(credential);
      return state;
    } catch {
      if (attempt === generation) clear("unavailable");
      return state;
    }
  }

  return {
    start: renew,
    renew,
    logout: () => clear("logout"),
    /** The reader refused a renewed credential; stop and clear. */
    deny: () => clear("denied"),
    /** Returns the bearer only while it is unexpired. */
    bearer(): string | null {
      if (state.status !== "ready") return null;
      if (state.credential.expiresAt * 1000 <= now()) {
        clear("expired");
        return null;
      }
      return state.credential.credential;
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type PrivateReaderSession = ReturnType<
  typeof createPrivateReaderSession
>;

export function usePrivateReaderState(
  session: PrivateReaderSession,
): PrivateReaderState {
  return useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState,
  );
}
