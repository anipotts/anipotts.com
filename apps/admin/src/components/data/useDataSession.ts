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

export type DataSession = {
  /** off: the reader is switched off for this admin. */
  status: "off" | "closed" | "ready" | "cleared";
  reason?: PrivateReaderClearReason;
  reader: LifeReader | null;
  /** Bumps with every new session, so views keyed on it start clean. */
  generation: number;
  opening: boolean;
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

/**
 * One private Data session for a page. Everything it reads lives in the
 * consuming component's memory and is dropped on logout, page hide, denial
 * or credential expiry; nothing is written to storage.
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
      createPrivateReaderSession({
        fetch: (...args) => globalThis.fetch(...args),
        csrf: readEditorialCsrf,
      }),
  );
  useEffect(() => {
    // bfcache would otherwise keep private records in a restored page.
    const end = () => session.logout();
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      session.logout();
    };
  }, [session]);
  const { state, reader } = usePrivateReader(session, { fetch: fetcher });
  const generation = useRef<{ reader: LifeReader | null; key: number }>({
    reader: null,
    key: 0,
  });
  if (reader && generation.current.reader !== reader)
    generation.current = { reader, key: generation.current.key + 1 };
  const [opening, setOpening] = useState(false);
  // The synthetic preview opens on load; it holds no private data.
  const fixtureReader = useMemo(
    () => (fixture ? createFixtureReader(fixture) : null),
    [fixture],
  );
  const [fixtureOpen, setFixtureOpen] = useState(true);
  if (fixtureReader)
    return {
      status: fixtureOpen ? "ready" : "closed",
      reader: fixtureOpen ? fixtureReader : null,
      generation: fixtureOpen ? 1 : 0,
      opening: false,
      fixture: true,
      open: async () => setFixtureOpen(true),
      end: () => setFixtureOpen(false),
    };
  const open = async () => {
    setOpening(true);
    try {
      await session.start();
    } finally {
      setOpening(false);
    }
  };
  return {
    status: !enabled
      ? "off"
      : state.status === "ready" && reader
        ? "ready"
        : state.status === "cleared"
          ? "cleared"
          : "closed",
    reason: state.status === "cleared" ? state.reason : undefined,
    reader: enabled ? reader : null,
    generation: generation.current.key,
    opening,
    fixture: false,
    open,
    end: () => session.logout(),
  };
}

/** What a closed or cleared session says, in one sentence each. */
export const SESSION_NOTICES: Record<
  PrivateReaderClearReason,
  { title: string; description: string }
> = {
  expired: {
    title: "Private session expired",
    description:
      "Records were cleared from this page. Open it again to continue.",
  },
  denied: {
    title: "Private access was refused",
    description:
      "Records were cleared from this page. Sign in to admin again if this continues.",
  },
  unavailable: {
    title: "The private reader is unavailable",
    description:
      "No credential could be issued. This does not mean your records are empty.",
  },
  logout: {
    title: "Private session ended",
    description: "Records were cleared from this page.",
  },
};

export const SESSION_NOTE = "Memory only, cleared on logout or expiry";
