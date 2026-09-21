import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPrivateReaderSession,
  type PrivateReaderClearReason,
  type PrivateReaderSession,
} from "../../lib/private-reader-client";
import { usePrivateReader } from "../../lib/private-reader-fetch";
import type { LifeReader } from "../../lib/life-read-session";
import {
  createFixtureReader,
  type DataFixture,
} from "../../lib/data-fixture-reader";
import {
  sessionPolicy,
  sharedPrivateSession,
} from "../../lib/private-session-store";

export type DataSession = {
  /** off: the reader is switched off. opening: a session is being issued. */
  status: "off" | "opening" | "ready" | "closed" | "cleared";
  /** Why a session closed: idle, owner, or the reader's own reason. */
  reason?: PrivateReaderClearReason | "idle";
  reader: LifeReader | null;
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

/** A session for the server render, which never opens. */
const serverSession = () =>
  createPrivateReaderSession({
    fetch: () => Promise.reject(new Error("server")),
    csrf: () => Promise.reject(new Error("server")),
  });

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
  const [opening, setOpening] = useState(false);
  const generation = useRef<{ reader: LifeReader | null; key: number }>({
    reader: null,
    key: 0,
  });
  if (reader && generation.current.reader !== reader)
    generation.current = { reader, key: generation.current.key + 1 };
  const open = async () => {
    const policy = sessionPolicy(session);
    policy.endedByOwner = false;
    policy.idle = false;
    setOpening(true);
    try {
      await session.start();
    } finally {
      setOpening(false);
    }
  };
  const live = enabled && !fixture;
  // Open without a click: the Access session is the owner's consent, and
  // issuance checks it again.
  useEffect(() => {
    if (!live || session.getState().status !== "idle") return;
    if (sessionPolicy(session).endedByOwner) return;
    void open();
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
        : opening || state.status === "idle"
          ? "opening"
          : cleared
            ? "cleared"
            : "closed",
    reason: cleared ? (idle ? "idle" : state.reason) : undefined,
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

/** One plain line per closed state. */
export const SESSION_NOTICES: Record<
  PrivateReaderClearReason | "idle",
  { title: string; action: string }
> = {
  idle: { title: "Private session closed.", action: "Open session" },
  expired: { title: "Private session expired.", action: "Open session" },
  denied: { title: "Private access was refused.", action: "Try again" },
  unavailable: { title: "Private reader unavailable.", action: "Try again" },
  logout: { title: "Private session ended.", action: "Open session" },
};
