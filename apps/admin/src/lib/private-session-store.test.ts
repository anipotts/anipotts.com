// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
let track: typeof import("./private-session-store").trackPrivateSession;
let create: typeof import("./private-reader-client").createPrivateReaderSession;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  ({ trackPrivateSession: track } = await import("./private-session-store"));
  ({ createPrivateReaderSession: create } =
    await import("./private-reader-client"));
});
afterEach(() => vi.useRealTimers());
it("cross-tab logout immediately clears bearer and cannot reopen from idle interaction", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    json({
      credential: "synthetic",
      scope: ["ops:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    }),
  );
  const session = create({ fetch: fetcher, csrf: async () => "fixture" });
  const policy = track(session);
  await session.start();
  expect(session.bearer()).toBe("synthetic");
  const { recoveryLogoutGenerationKey: logoutKey } =
    await import("./browser-recovery");
  window.dispatchEvent(new StorageEvent("storage", { key: logoutKey }));
  expect(session.bearer()).toBeNull();
  expect(policy.endedByOwner).toBe(true);
  window.dispatchEvent(new Event("pointerdown"));
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(session.getState().status).toBe("cleared");
});
it("pagehide clears custody and BFCache resume cannot reuse a late credential", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const session = create({ fetch: fetcher, csrf: async () => "fixture" });
  track(session);
  const pending = session.start();
  await Promise.resolve();
  window.dispatchEvent(new Event("pagehide"));
  finish(
    json({
      credential: "late",
      scope: ["data:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    }),
  );
  await pending;
  window.dispatchEvent(
    new PageTransitionEvent("pageshow", { persisted: true }),
  );
  expect(session.bearer()).toBeNull();
  await session.start();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retiring an idle session removes its ability to reopen", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    json({
      credential: "synthetic",
      scope: ["ops:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const session = create({ fetch: fetcher, csrf: async () => "fixture" });
  const policy = track(session);
  await session.start();
  const { PRIVATE_SESSION_IDLE_MS, releasePrivateSession } =
    await import("./private-session-store");
  await vi.advanceTimersByTimeAsync(PRIVATE_SESSION_IDLE_MS);
  expect(policy.idle).toBe(true);
  releasePrivateSession(session);
  window.dispatchEvent(new Event("pointerdown"));
  await vi.advanceTimersByTimeAsync(PRIVATE_SESSION_IDLE_MS);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(session.bearer()).toBeNull();
});
