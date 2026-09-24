import type { PrivateReaderSession } from "./private-reader-client";
import {
  PRIVATE_READER_ORIGIN,
  PrivateReaderError,
  privateReaderInit,
} from "./private-reader-fetch";
import { readBoundedBytes } from "./bounded-body";
import { discardBody } from "./response-body";
import {
  IssuanceTimeoutError,
  ReaderNoReplyError,
  fetchReader,
  type ReaderHop,
} from "./reader-reach";
import {
  OPS_V1_BOUNDS,
  OpsSnapshotError,
  parseOpsSnapshotBytes,
  type OpsSnapshot,
} from "./ops-v1";
import {
  EMPTY_EVENT_LOG,
  OPS_EVENTS_BOUNDS,
  OPS_EVENTS_PAGES_PER_READ,
  appendOpsEvents,
  opsEventsDrifted,
  opsEventsMoveSnapshot,
  opsEventsPath,
  parseOpsEventsBytes,
  type OpsEventLog,
  type OpsEventsPage,
} from "./ops-events";

/**
 * Browser read path for System's ops_v1 snapshot, modelled on the Data reader.
 *
 * The credential comes from a separate issuance route that carries only
 * `ops:read`; a credential with any other scope is refused before it is sent.
 * The snapshot and its ETag live in memory only (`cache: "no-store"`, no Web
 * Storage) and are dropped on logout, denial or credential expiry. Polling
 * runs every 30 seconds and only while the tab is visible, and a state change
 * or a finished run in the events feed reads the snapshot at once (a 304
 * when nothing moved) rather than waiting for the next poll. The session
 * follows the shared idle rule (lib/private-session-store.ts); a session the
 * rule opens again resumes polling. The React binding is
 * components/hooks/useOpsStatus.ts.
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
/** The events fallback interval: after an error, after repeated short
 * holds, and with the long-poll off. An empty page is a few bytes. */
export const OPS_EVENTS_POLL_MS = 5_000;
/**
 * Seconds the reader holds each events request (a long-poll): it answers as
 * soon as an event past the cursor exists, and the next request goes out at
 * once. Not yet verified end to end through Tailscale Serve; if Serve cuts
 * holds early, set 10. Null turns the long-poll off (plain 5 s polling).
 */
export const OPS_EVENTS_WAIT_S: number | null = 25;
/** An empty answer faster than this was not held (the reader's wait slots
 * were full, or a proxy cut it): wait this long before asking again. */
export const OPS_EVENTS_SHORT_HOLD_MS = 1_000;
/** This many short holds in a row fall back to OPS_EVENTS_POLL_MS. */
export const OPS_EVENTS_SHORT_HOLDS_FALLBACK = 3;

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

async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (
    !type.includes("application/json") ||
    !response.body ||
    declared > maxBytes
  ) {
    discardBody(response);
    throw new OpsSnapshotError();
  }
  const bytes = await readBoundedBytes(response.body, maxBytes);
  if (!bytes) throw new OpsSnapshotError();
  return bytes;
}

type ReadOptions = {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Runs a 401's renewal: the controller holds its reader deadline while
   * admin issues the new credential, so a slow issuance is never read as
   * ap-mini's (A-26). */
  renewing?: (
    renew: () => ReturnType<BearerSource["renew"]>,
  ) => ReturnType<BearerSource["renew"]>;
};

/**
 * One ops:read GET. A 401 renews the credential once and retries; a second
 * 401 clears the session. Returns the successful or 304 response; any other
 * status throws.
 */
async function opsGet(
  session: BearerSource,
  path: string,
  headers: Record<string, string>,
  options: ReadOptions,
): Promise<Response> {
  const url = new URL(path, PRIVATE_READER_ORIGIN).href;
  const fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
  let renewed = false;
  for (;;) {
    if (session.getState().status === "ready" && !opsScoped(session)) {
      session.deny();
      throw new PrivateReaderError(403, "forbidden");
    }
    const bearer = session.bearer();
    if (!bearer) throw new PrivateReaderError(401, "expired");
    const init = privateReaderInit(bearer, options.signal);
    init.headers = { ...(init.headers as Record<string, string>), ...headers };
    const response = await fetchReader(fetcher, url, init);
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
      const renew = () => session.renew();
      const next = await (options.renewing ? options.renewing(renew) : renew());
      if (next.status !== "ready") throw new PrivateReaderError(401);
      continue;
    }
    if (response.status === 304 || response.ok) return response;
    discardBody(response);
    throw new PrivateReaderError(response.status);
  }
}

/**
 * One conditional snapshot GET. A 304 is only accepted for a request that
 * sent an ETag.
 */
export async function readOpsSnapshot(
  session: BearerSource,
  etag: string | null,
  options: ReadOptions = {},
): Promise<OpsSnapshotRead> {
  const conditional = validEtag(etag);
  const response = await opsGet(
    session,
    OPS_SNAPSHOT_PATH,
    conditional ? { "If-None-Match": conditional } : {},
    options,
  );
  if (response.status === 304) {
    discardBody(response);
    if (!conditional) throw new PrivateReaderError(502, "unavailable");
    return { kind: "not-modified" };
  }
  const snapshot = parseOpsSnapshotBytes(
    await readBounded(response, OPS_V1_BOUNDS.maxBytes),
  );
  if (session.getState().status !== "ready")
    throw new PrivateReaderError(401, "expired");
  return {
    kind: "snapshot",
    snapshot,
    etag: validEtag(response.headers.get("etag")),
  };
}

/** One events page after `after`, oldest first. */
export async function readOpsEvents(
  session: BearerSource,
  after: number,
  options: ReadOptions & { wait?: number | null } = {},
): Promise<OpsEventsPage> {
  const response = await opsGet(
    session,
    opsEventsPath(after, undefined, options.wait ?? null),
    {},
    options,
  );
  if (response.status === 304) {
    discardBody(response);
    throw new PrivateReaderError(502, "unavailable");
  }
  const page = parseOpsEventsBytes(
    await readBounded(response, OPS_EVENTS_BOUNDS.maxBytes),
    after,
  );
  if (session.getState().status !== "ready")
    throw new PrivateReaderError(401, "expired");
  return page;
}

/**
 * `off`: the server flags are not both "true". `unissued`: admin's own
 * credential route failed, so nothing reached ap-mini. `unreachable`: the
 * read got no reply, or an unexpected error; `hop` says which hop the
 * browser can name (lib/reader-reach.ts). `unavailable`: the reader answered
 * 503, it has no valid snapshot. `rejected`: the reader sent a snapshot that
 * breaks the contract. `denied`: the owner gate refused issuance, or the
 * reader answered 403 (no ops:read). `ended`: the private session was
 * closed.
 */
export type OpsConnection =
  | "off"
  | "idle"
  | "connecting"
  | "connected"
  | "unissued"
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
  /** Events read so far, for a view that asked for them; null otherwise. */
  events: OpsEventLog | null;
  /** The last events read failed; what is held is the last good read. */
  eventsStale: boolean;
  /** While `unreachable`: the hop that failed (lib/reader-reach.ts). */
  hop?: Exclude<ReaderHop, "unissued">;
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
  /** Also read the events feed (Activity, Alerts, overview), on its own
   * faster loop. */
  events?: boolean;
  eventsPollMs?: number;
  /** Long-poll seconds; see OPS_EVENTS_WAIT_S. */
  eventsWaitS?: number | null;
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
  const withEvents = options.events === true;
  const eventsPollMs = options.eventsPollMs ?? OPS_EVENTS_POLL_MS;
  const eventsWait =
    options.eventsWaitS === undefined ? OPS_EVENTS_WAIT_S : options.eventsWaitS;
  let state: OpsStatusState = {
    connection: "idle",
    snapshot: null,
    checkedAt: null,
    events: withEvents ? EMPTY_EVENT_LOG : null,
    eventsStale: false,
  };
  let etag: string | null = null;
  let timer: Timer | null = null;
  let inflight: AbortController | null = null;
  let running = false;
  let lastAttempt = -Infinity;
  let eventsTimer: Timer | null = null;
  let eventsInflight: AbortController | null = null;
  let eventsRead = false;
  let shortHolds = 0;
  /** A snapshot read is owed as soon as the one in flight settles. */
  let owed = false;

  function set(next: Partial<OpsStatusState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  /** Private data never outlives the credential that read it. */
  function drop(connection: OpsConnection) {
    etag = null;
    set({
      connection,
      snapshot: null,
      checkedAt: null,
      events: withEvents ? EMPTY_EVENT_LOG : null,
      eventsStale: false,
    });
  }

  function cancelEvents() {
    if (eventsTimer !== null) clearTimer(eventsTimer);
    eventsTimer = null;
    eventsInflight?.abort();
    eventsInflight = null;
  }

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    inflight?.abort();
    inflight = null;
    owed = false;
    cancelEvents();
  }

  function scheduleEvents(delay: number) {
    if (eventsTimer !== null) clearTimer(eventsTimer);
    eventsTimer = null;
    if (!withEvents || !running || isHidden()) return;
    eventsTimer = setTimer(() => void eventsTick(), Math.max(0, delay));
  }

  /** The events loop: one read of every page after the cursor, then the
   * next read after OPS_EVENTS_POLL_MS (or at once when long-polling). The
   * snapshot loop owns opening and renewing the session. */
  async function eventsTick() {
    eventsTimer = null;
    if (!running || isHidden() || eventsInflight) return;
    if (session.getState().status !== "ready") {
      scheduleEvents(eventsPollMs);
      return;
    }
    const controller = new AbortController();
    eventsInflight = controller;
    eventsRead = true;
    const deadline = setTimer(
      () => controller.abort(),
      timeoutMs + (eventsWait ?? 0) * 1000,
    );
    const current = () => eventsInflight === controller && running;
    const began = now();
    let next = eventsWait === null ? eventsPollMs : 0;
    try {
      const { got, moved } = await readEvents(controller.signal, current);
      if (moved) readSnapshotNow();
      if (eventsWait !== null) {
        const short = !got && now() - began < OPS_EVENTS_SHORT_HOLD_MS;
        shortHolds = short ? shortHolds + 1 : 0;
        next = !short
          ? 0
          : shortHolds >= OPS_EVENTS_SHORT_HOLDS_FALLBACK
            ? eventsPollMs
            : OPS_EVENTS_SHORT_HOLD_MS;
      }
    } catch (error) {
      next = eventsPollMs;
      if (!current()) return;
      if (
        error instanceof PrivateReaderError &&
        (error.failure === "forbidden" ||
          (error.failure === "unauthorized" &&
            session.getState().status !== "ready"))
      )
        return stop("denied");
      // Expiry renews through the snapshot loop; anything else is stale.
      set({ eventsStale: true });
    } finally {
      clearTimer(deadline);
      if (eventsInflight === controller) {
        eventsInflight = null;
        scheduleEvents(next);
      }
    }
  }

  /** Admin's own credential issuance, under its own deadline: past it the
   * read fails as "Credential not issued", never as a reader timeout. */
  function issued<T>(start: () => Promise<T>): Promise<T> {
    let limit: Timer | null = null;
    return Promise.race([
      start(),
      new Promise<never>((_, reject) => {
        limit = setTimer(() => reject(new IssuanceTimeoutError()), timeoutMs);
      }),
    ]).finally(() => {
      if (limit !== null) clearTimer(limit);
    });
  }

  function schedule(delay: number) {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!running || isHidden()) return;
    timer = setTimer(() => void tick(), Math.max(0, delay));
  }

  /** A state changed or a run finished: read the snapshot now, with its
   * ETag, instead of at the next poll. System writes the snapshot before it
   * records the events, so the read sees the change. A read already in
   * flight may predate it, so one more follows as soon as it settles. */
  function readSnapshotNow() {
    if (!running || isHidden()) return;
    if (inflight) owed = true;
    else schedule(0);
  }

  async function tick() {
    timer = null;
    if (!running || isHidden() || inflight) return;
    const controller = new AbortController();
    inflight = controller;
    lastAttempt = now();
    let timedOut = false;
    let deadline: Timer | null = null;
    // The reader's deadline runs only while a request to ap-mini is out.
    const arm = () => {
      deadline = setTimer(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    };
    const disarm = () => {
      if (deadline !== null) clearTimer(deadline);
      deadline = null;
    };
    const current = () => inflight === controller && running;
    try {
      if (session.getState().status !== "ready") {
        if (!state.snapshot) set({ connection: "connecting" });
        // Admin's own issuance has its own deadline, and a slow one reads as
        // admin's failure, never as ap-mini's (A-26): the reader's deadline
        // starts only once there is a credential to send.
        const started = await issued(() => session.start());
        if (!current()) return;
        if (started.status !== "ready") {
          if (started.status === "cleared" && started.reason === "denied")
            return stop("denied");
          // Admin's own credential route failed; ap-mini was never asked.
          set({ connection: "unissued", hop: undefined });
          return;
        }
      }
      arm();
      const read = await readOpsSnapshot(session, etag, {
        fetch: options.fetch,
        signal: controller.signal,
        renewing: async (renew) => {
          disarm();
          try {
            return await issued(renew);
          } finally {
            arm();
          }
        },
      });
      if (!current()) return;
      if (read.kind === "snapshot") {
        etag = read.etag;
        set({
          connection: "connected",
          snapshot: read.snapshot,
          checkedAt: now(),
          hop: undefined,
        });
      } else set({ connection: "connected", checkedAt: now(), hop: undefined });
      // The first events read follows the first snapshot, on its own loop.
      if (withEvents && !eventsRead && !eventsInflight) void eventsTick();
    } catch (error) {
      if (!current()) return;
      // Admin's issuance gave no credential in time; ap-mini was not asked.
      if (error instanceof IssuanceTimeoutError)
        set({ connection: "unissued", hop: undefined });
      else if (error instanceof OpsSnapshotError) drop("rejected");
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
      // No reply, or an unexpected answer: keep the last snapshot, marked as
      // not current, with the hop that failed. Only a request that went out
      // and got nothing back within the deadline is ap-mini unreachable.
      else
        set({
          connection: "unreachable",
          hop: timedOut
            ? "timeout"
            : error instanceof ReaderNoReplyError
              ? error.hop
              : "reader",
        });
    } finally {
      disarm();
      if (inflight === controller) {
        inflight = null;
        schedule(owed ? 0 : pollMs);
        owed = false;
      }
    }
  }

  /** Pages after the held cursor. Each page is kept as it arrives, so a
   * failure part way keeps what was read and the next poll continues. A
   * page that breaks the contract clears the events and starts over. */
  /** Returns whether any event arrived, and whether one moved the snapshot
   * after the first read (the first read's backlog is history the snapshot
   * already shows). Only the first page waits; later pages of a backlog
   * answer at once. */
  async function readEvents(
    signal: AbortSignal,
    current: () => boolean,
  ): Promise<{ got: boolean; moved: boolean }> {
    let got = false;
    let moved = false;
    const result = () => ({ got, moved });
    for (let page = 0; page < OPS_EVENTS_PAGES_PER_READ; page++) {
      const log = state.events ?? EMPTY_EVENT_LOG;
      let read: OpsEventsPage;
      try {
        read = await readOpsEvents(session, log.cursor, {
          fetch: options.fetch,
          signal,
          wait: page === 0 ? eventsWait : null,
        });
      } catch (error) {
        if (!current()) return result();
        if (error instanceof OpsSnapshotError) {
          set({ events: EMPTY_EVENT_LOG, eventsStale: true });
          return result();
        }
        // Credential failures end or renew the session, as for the snapshot.
        if (
          error instanceof PrivateReaderError &&
          ["forbidden", "unauthorized", "expired"].includes(error.failure)
        )
          throw error;
        // Anything else leaves the snapshot alone: events are marked stale.
        set({ eventsStale: true });
        return result();
      }
      if (!current()) return result();
      got ||= read.items.length > 0;
      moved ||= log.cursor > 0 && opsEventsMoveSnapshot(read.items);
      set({
        events: appendOpsEvents(
          log,
          read.items,
          read.unknownFields,
          read.lastSeq,
          read.skipped,
        ),
        // Mostly unreadable is drift: the cursor still moves past it, and
        // the events read as not current until a readable page arrives.
        eventsStale: opsEventsDrifted(
          read.skipped,
          read.items.length + read.skipped,
        ),
      });
      if (read.nextAfter === null) return result();
    }
    return result();
  }

  function stop(connection: OpsConnection) {
    running = false;
    eventsRead = false;
    cancel();
    drop(connection);
  }

  // Logout, denial and expiry clear the snapshot along with the credential.
  // Only the idle rule opens a session this controller has stopped, on the
  // owner's next interaction, and polling resumes with it.
  const unsubscribe = session.subscribe(() => {
    const next = session.getState();
    if (next.status === "ready" && !running && state.connection === "ended") {
      running = true;
      if (!inflight) schedule(0);
      return;
    }
    if (next.status !== "cleared") return;
    if (next.reason === "logout") stop("ended");
    else if (next.reason === "denied") stop("denied");
    else if (next.reason === "expired") {
      // Nothing may wait on a credential that is gone; the events loop
      // starts again after the next snapshot.
      cancelEvents();
      eventsRead = false;
      drop("connecting");
    }
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
        cancelEvents();
        return;
      }
      if (!running) return;
      // Events are the latency-sensitive read: fetch them at once.
      if (eventsRead) scheduleEvents(0);
      if (!inflight) schedule(lastAttempt + pollMs - now());
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
