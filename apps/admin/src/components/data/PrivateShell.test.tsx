// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateShell, shellRoute } from "./PrivateShell";
import { PRIVATE_READER_AUDIENCE } from "../../lib/private-reader-credential";
import { PRIVATE_READER_ROUTES } from "../../lib/private-reader-fetch";
import {
  PRIVATE_SESSION_IDLE_MS,
  trackPrivateSession,
} from "../../lib/private-session-store";
import { createPrivateReaderSession } from "../../lib/private-reader-client";

// Synthetic records only; every request goes through the mocked fetch.
const recordId = "rec-0123456789abcdef0123456789abcdef";
const record = {
  record_id: recordId,
  revision_id: "rev-0123456789abcdef0123456789abcdef",
  title: "Synthetic note",
  body: "Fixture text only.",
  source_id: "synthetic",
  status: "observed",
  tier: "open",
  observed_at: "2026-09-21T08:15:35Z",
  body_offset: 0,
  next_body_offset: null,
};
const envelope = (data: unknown) => ({
  schema: "personal_context_data_v1",
  response_observed_at: "2026-09-21T08:15:35Z",
  data,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let issued = 0;
function network() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://admin.anipotts.com");
    if (url.pathname === "/api/editorial/csrf")
      return json({ csrf: "c".repeat(64) });
    if (url.pathname === "/api/private-reader/credential") {
      issued += 1;
      const now = Math.floor(Date.now() / 1000);
      return json({
        credential: `synthetic.jws.${issued}`,
        tokenType: "Bearer",
        audience: PRIVATE_READER_AUDIENCE,
        scope: ["data:read", "activity:read"],
        issuedAt: now,
        expiresAt: now + 60,
      });
    }
    if (url.pathname === PRIVATE_READER_ROUTES.search)
      return json(envelope({ items: [record], total: 1, next_offset: null }));
    if (url.pathname === `${PRIVATE_READER_ROUTES.record}${recordId}`)
      return json(envelope(record));
    return json({ error: "fixture" }, 404);
  });
}

let root: Root;
let host: HTMLElement;
const settle = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      for (let j = 0; j < 5; j++) await Promise.resolve();
    });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  host = document.createElement("main");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the overview and Data shell", () => {
  it("draws only the routes it can without a document load", () => {
    const url = (path: string) => new URL(path, "https://admin.invalid");
    expect(shellRoute(url("/"), true)).toEqual({ page: "overview" });
    expect(shellRoute(url("/"), false)).toBeNull();
    expect(
      shellRoute(url(`/data/records/${recordId}?kind=people`), false),
    ).toEqual({
      page: "records",
      id: recordId,
      kind: "people",
    });
    expect(shellRoute(url("/data/records/not-an-id"), true)).toBeNull();
    expect(shellRoute(url("/data/sources?view=health"), true)).toEqual({
      page: "sources",
      view: "health",
    });
    expect(shellRoute(url("/content/pages"), true)).toBeNull();
  });

  it("opens a record from the overview without opening the session again", async () => {
    vi.stubGlobal("fetch", network());
    await act(async () =>
      root.render(
        <PrivateShell
          initialPath="/"
          content={[]}
          dataEnabled
          enabled={false}
        />,
      ),
    );
    await settle();
    expect(issued).toBe(1);
    const link = host.querySelector<HTMLAnchorElement>(
      `a[href="/data/records/${recordId}"]`,
    )!;
    expect(link.textContent).toBe("Synthetic note");
    await act(async () => link.click());
    await settle();
    expect(window.location.pathname).toBe(`/data/records/${recordId}`);
    expect(host.querySelector("h1")?.textContent).toBe("Records");
    expect(host.textContent).toContain("Fixture text only.");
    expect(issued).toBe(1);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("private session idle rule", () => {
  it("closes after 15 idle minutes and opens again on the next interaction", async () => {
    const timers: Array<{ callback: () => void; ms: number }> = [];
    const fetcher = network();
    const session = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
    });
    const policy = trackPrivateSession(session, {
      setTimer: (callback, ms) => {
        timers.push({ callback, ms });
        return timers.length;
      },
      clearTimer: () => {},
    });
    await session.start();
    expect(session.getState().status).toBe("ready");
    const idle = timers.find((timer) => timer.ms === PRIVATE_SESSION_IDLE_MS)!;
    idle.callback();
    expect(session.getState()).toEqual({ status: "cleared", reason: "logout" });
    expect(policy.idle).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(session.getState().status).toBe("ready");
    expect(policy.idle).toBe(false);
  });

  it("stays closed after the owner ends it", async () => {
    const session = createPrivateReaderSession({
      fetch: network() as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
    });
    const policy = trackPrivateSession(session, {
      setTimer: () => 0,
      clearTimer: () => {},
    });
    await session.start();
    policy.endedByOwner = true;
    session.logout();
    window.dispatchEvent(new Event("keydown"));
    await settle();
    expect(session.getState().status).toBe("cleared");
  });
});
