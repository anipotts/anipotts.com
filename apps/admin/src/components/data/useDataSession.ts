import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPrivateReaderSession,
  type PrivateReaderClearReason,
  type PrivateReaderSession,
} from "../../lib/private-reader-client";
import { usePrivateReader } from "../../lib/private-reader-fetch";
import type { DataReader } from "../../lib/data-read-session";
import {
  createFixtureReader,
  type DataFixture,
} from "../../lib/data-fixture-reader";
import {
  sessionPolicy,
  sharedPrivateSession,
} from "../../lib/private-session-store";

export type DataSession = {
  /** off: the reader is switched off. opening: the first session is being
   * issued. cleared: a session closed, or issuance failed, for `reason`. */
  status: "off" | "opening" | "ready" | "cleared";
  /** Why a session closed: idle, owner, or the reader's own reason. */
  reason?: PrivateReaderClearReason | "idle";
  /** A reopen from a notice is under way; the notice stays in place. */
  busy: boolean;
  reader: DataReader | null;
  /** Bumps with every new session, so views keyed on it start clean. */
  generation: number;
  fixture: boolean;
  open: () => Promise<void>;
  end: () => void;
};

export type DataSessionOptions = {
  /** PRIVATE_READER_ENABLED is exactly "true" on the server. */
  enabled: boolean;
  /** Development only: a synthetic dataset stands in for the reader. */
  fixture?: DataFixture;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
};

/** A reopen shows its progress for at least this long, so a fast failure
 * still reads as a retry. */
const REOPEN_MIN_MS = 400;

/** A session for the server render, which never opens. */
const serverSession = () =>
  createPrivateReaderSession({
    fetch: () => Promise.reject(new Error("server")),
    csrf: () => Promise.reject(new Error("server")),
  });

const rest = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : undefined;

/**
 * The page's private Data session. It opens on its own when a Data view
 * mounts, is shared by every view in the document (see
 * lib/private-session-store.ts), and holds everything in memory only.
 */
export function useDataSession({
  enabled,
  fixture,
  session: injected,
  fetch: fetcher,
}: DataSessionOptions): DataSession {
  const [session] = useState(
    () =>
      injected ??
      (typeof window === "undefined"
        ? serverSession()
        : sharedPrivateSession()),
  );
  const { state, reader } = usePrivateReader(session, { fetch: fetcher });
  const [busy, setBusy] = useState(false);
  const generation = useRef<{ reader: DataReader | null; key: number }>({
    reader: null,
    key: 0,
  });
  if (reader && generation.current.reader !== reader)
    generation.current = { reader, key: generation.current.key + 1 };
  const open = async () => {
    const policy = sessionPolicy(session);
    policy.endedByOwner = false;
    policy.idle = false;
    const started = Date.now();
    setBusy(true);
    try {
      await session.start();
    } finally {
      await rest(REOPEN_MIN_MS - (Date.now() - started));
      setBusy(false);
    }
  };
  const live = enabled && !fixture;
  // Open without a click: the Access session is the owner's consent, and
  // issuance checks it again.
  useEffect(() => {
    if (!live || session.getState().status !== "idle") return;
    if (sessionPolicy(session).endedByOwner) return;
    void session.start();
  }, [live, session]);
  const fixtureReader = useMemo(
    () => (fixture ? createFixtureReader(fixture) : null),
    [fixture],
  );
  const [fixtureOpen, setFixtureOpen] = useState(true);
  if (fixtureReader)
    return {
      status: fixtureOpen ? "ready" : "cleared",
      reason: fixtureOpen ? undefined : "logout",
      busy: false,
      reader: fixtureOpen ? fixtureReader : null,
      generation: fixtureOpen ? 1 : 0,
      fixture: true,
      open: async () => setFixtureOpen(true),
      end: () => setFixtureOpen(false),
    };
  const cleared = state.status === "cleared";
  const idle =
    cleared && typeof window !== "undefined" && sessionPolicy(session).idle;
  return {
    status: !enabled
      ? "off"
      : state.status === "ready" && reader
        ? "ready"
        : cleared
          ? "cleared"
          : "opening",
    reason: cleared ? (idle ? "idle" : state.reason) : undefined,
    busy,
    reader: enabled ? reader : null,
    generation: generation.current.key,
    fixture: false,
    open,
    end: () => {
      sessionPolicy(session).endedByOwner = true;
      session.logout();
    },
  };
}
