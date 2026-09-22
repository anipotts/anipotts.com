// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import snapshot from "../../fixtures/ops_v1.sample.json";
import events from "../../fixtures/ops_events_v1.synthetic.json";
import { AdminOverview } from "./AdminOverview";
import { createPrivateReaderSession } from "../../lib/private-reader-client";
import {
  OPS_CREDENTIAL_ENDPOINT,
  OPS_EVENTS_POLL_MS,
  createOpsStatusController,
} from "../../lib/ops-reader";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// Response bodies resolve on real macrotasks; let them run between steps.
const realSetTimeout = globalThis.setTimeout;
const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => new Promise((resolve) => realSetTimeout(resolve, 0)));
  }
};
afterEach(() => vi.useRealTimers());

const transition = (seq: number, from: string, to: string, at: string) => ({
  seq,
  at,
  kind: "transition",
  subject: "pc.writer",
  from_state: from,
  to_state: to,
  status: null,
  ms: null,
  detail: to === "ok" ? "last pass completed" : "last pass failed",
});

describe("live alerts on the overview", () => {
  it("shows a new firing alert on the next poll and drops it when it resolves, with no reload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T18:00:10Z"));
    const firstSight = events.items.filter(
      (item) => item.kind === "transition" && item.from_state === null,
    );
    const last = firstSight.at(-1)!.seq;
    let pending: unknown[] = [];
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json", ...headers },
      });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://admin.invalid");
      if (String(input) === OPS_CREDENTIAL_ENDPOINT)
        return Response.json({
          credential: "cred",
          scope: ["ops:read"],
          expiresAt: Math.floor(Date.now() / 1000) + 60,
        });
      if (url.pathname === "/v1/ops/snapshot")
        return json(snapshot, { etag: '"a"' });
      const after = Number(url.searchParams.get("after"));
      const items = after === 0 ? firstSight : pending;
      if (after !== 0) pending = [];
      return json({ version: "ops_events_v1", items, next_after: null });
    }) as unknown as typeof fetch;
    const controller = createOpsStatusController({
      session: createPrivateReaderSession({
        fetch: fetcher,
        csrf: async () => "csrf",
        endpoint: OPS_CREDENTIAL_ENDPOINT,
      }),
      fetch: fetcher,
      isHidden: () => false,
      events: true,
      eventsWaitS: null,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <AdminOverview
          content={[]}
          dataEnabled={false}
          enabled
          controller={controller}
        />,
      ),
    );
    await settle();
    // Everything is ok at first sight: no alerts section at all.
    expect(host.querySelector('table[aria-label="Firing alerts"]')).toBeNull();

    pending = [transition(last + 1, "ok", "failing", "2026-09-21T18:00:05Z")];
    await act(() => vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS));
    await settle();
    const table = host.querySelector('table[aria-label="Firing alerts"]');
    expect(table?.querySelector("tbody tr")?.textContent).toContain(
      "Personal context writer",
    );

    pending = [transition(last + 2, "failing", "ok", "2026-09-21T18:00:08Z")];
    await act(() => vi.advanceTimersByTimeAsync(OPS_EVENTS_POLL_MS));
    await settle();
    expect(host.querySelector('table[aria-label="Firing alerts"]')).toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});
