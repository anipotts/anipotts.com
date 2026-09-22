import {
  createPrivateReaderSession,
  type PrivateReaderSession,
} from "./private-reader-client";

/**
 * The page's one private Data session, kept in module memory so every view in
 * this document (the overview's recent records, Records, a record, Sources)
 * shares it across in-app navigation. Nothing is stored: a real document load
 * starts with no session, and logout, expiry, denial and page hide clear it.
 *
 * Idle rule: after 15 minutes without interaction, or 15 minutes hidden, the
 * session closes; the next interaction opens it again. Credential issuance is
 * unchanged: every open and renewal passes the live Access gate. The ops
 * session (components/hooks/useOpsStatus.ts) is its own session under the
 * same rule, through `trackPrivateSession`.
 */
export const PRIVATE_SESSION_IDLE_MS = 15 * 60 * 1000;

/** Reads the existing same-origin editorial CSRF token for issuance. The
 * Data and ops sessions both issue with it. */
export async function readEditorialCsrf(): Promise<string> {
  const response = await fetch("/api/editorial/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("CSRF unavailable");
  const body = (await response.json()) as { csrf?: unknown };
  if (typeof body.csrf !== "string") throw new Error("CSRF unavailable");
  return body.csrf;
}

export type SessionPolicy = {
  /** The owner ended the session; it stays closed until they open it. */
  endedByOwner: boolean;
  /** The idle rule closed it; the next interaction opens it. */
  idle: boolean;
};

type Tracked = {
  session: PrivateReaderSession;
  policy: SessionPolicy;
  stop: () => void;
};

const tracked = new WeakMap<PrivateReaderSession, Tracked>();
let shared: PrivateReaderSession | null = null;

type Clock = {
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

/**
 * Applies the idle rule and page hide to a session, once. Returns its policy
 * flags. Tests pass their own session and clock.
 */
export function trackPrivateSession(
  session: PrivateReaderSession,
  clock: Clock = {},
): SessionPolicy {
  const existing = tracked.get(session);
  if (existing) return existing.policy;
  const now = clock.now ?? Date.now;
  const setTimer =
    clock.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    clock.clearTimer ??
    ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const policy: SessionPolicy = { endedByOwner: false, idle: false };
  let timer: unknown = null;
  const idleClose = () => {
    timer = null;
    if (session.getState().status !== "ready") return;
    policy.idle = true;
    session.logout();
  };
  const arm = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(idleClose, PRIVATE_SESSION_IDLE_MS);
  };
  let hiddenAt: number | null = null;
  const interact = () => {
    arm();
    if (policy.idle && !policy.endedByOwner) {
      policy.idle = false;
      void session.start();
    }
  };
  const visibility = () => {
    if (document.hidden) {
      hiddenAt = now();
      return;
    }
    if (hiddenAt !== null && now() - hiddenAt >= PRIVATE_SESSION_IDLE_MS)
      idleClose();
    hiddenAt = null;
    interact();
  };
  // bfcache would otherwise keep private records in a restored page.
  const hide = () => session.logout();
  const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  for (const name of events)
    window.addEventListener(name, interact, { passive: true });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", hide);
  arm();
  const stop = () => {
    for (const name of events) window.removeEventListener(name, interact);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", hide);
    if (timer !== null) clearTimer(timer);
  };
  tracked.set(session, { session, policy, stop });
  return policy;
}

/** The document's shared session, created on first use. */
export function sharedPrivateSession(): PrivateReaderSession {
  if (!shared) {
    shared = createPrivateReaderSession({
      fetch: (...args) => globalThis.fetch(...args),
      csrf: readEditorialCsrf,
    });
    trackPrivateSession(shared);
  }
  return shared;
}

/** Policy flags for a tracked session. */
export function sessionPolicy(session: PrivateReaderSession): SessionPolicy {
  return tracked.get(session)?.policy ?? trackPrivateSession(session);
}
