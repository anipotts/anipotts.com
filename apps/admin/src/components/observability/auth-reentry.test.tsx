// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import snapshot from "../../fixtures/ops_v1.sample.json";
import events from "../../fixtures/ops_events_v1.synthetic.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
let auth: typeof import("../../lib/protected-admin-json");
let ObservabilityWorkspace: (typeof import("../astryx/ObservabilityWorkspace"))["ObservabilityWorkspace"];
let AdminOverview: (typeof import("../overview/AdminOverview"))["AdminOverview"];
let reader: typeof import("../../lib/private-reader-client");
let ops: typeof import("../../lib/ops-reader");
let stopDocumentListeners: () => void;
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  // Module resets alone leave a prior document's lifecycle listeners active.
  // Capture all listeners installed by this synthetic document and retire them
  // after unmount, like the browser discarding a document on fresh navigation.
  const listeners: [
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined,
  ][] = [];
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  const registration = vi
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (listener) listeners.push([type, listener, options]);
      add(type, listener, options);
    });
  stopDocumentListeners = () => {
    for (const [type, listener, options] of listeners)
      remove(type, listener, options);
    registration.mockRestore();
  };
  // Cold component graph setup belongs to the hook, not the bounded assertion
  // phase; the full parallel suite otherwise spends its first test importing.
  [auth, { ObservabilityWorkspace }, { AdminOverview }, reader, ops] =
    await Promise.all([
      import("../../lib/protected-admin-json"),
      import("../astryx/ObservabilityWorkspace"),
      import("../overview/AdminOverview"),
      import("../../lib/private-reader-client"),
      import("../../lib/ops-reader"),
    ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  stopDocumentListeners();
  history.replaceState(null, "", "/");
});

it.each([401, 403])(
  "Observability uses safe native reentry after owner credential refusal %s",
  async (status) => {
    history.replaceState(
      null,
      "",
      "/observability/status?entry=private-record&sort=name&q=private#detail",
    );
    await act(async () =>
      root.render(<ObservabilityWorkspace enabled={false} />),
    );
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "unauthorized" }, { status }),
    );
    await act(async () => {
      await expect(
        auth.protectedAdminJson(
          "/api/private/ops-credential",
          { method: "POST" },
          fetcher,
        ),
      ).rejects.toMatchObject({ kind: status === 401 ? "expired" : "denied" });
    });
    expect(host.textContent).toContain("Session locked");
    expect(host.textContent).not.toContain("Try again");
    expect(host.textContent).not.toContain("Open again");
    const link = host.querySelector<HTMLAnchorElement>(
      'a[href="/observability/status?sort=name"]',
    )!;
    expect(link.textContent).toBe("Sign in again");
    const clientRouter = vi.fn();
    document.addEventListener("click", clientRouter);
    // Prevent jsdom navigation without intercepting React's bubbling handler.
    link.addEventListener("click", (event) => event.preventDefault());
    await act(async () => link.click());
    document.removeEventListener("click", clientRouter);
    expect(clientRouter).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it.each(["expired", "denied", "logout", "locked"] as const)(
  "overview alerts withdraw rows and offer root reentry when the document becomes %s",
  async (reason) => {
    history.replaceState(null, "", "/?q=private");
    await act(async () =>
      root.render(
        <AdminOverview
          content={[]}
          dataEnabled={false}
          enabled={false}
          fixture={snapshot}
          eventsFixture={events}
          now={Date.parse("2026-09-21T18:00:00Z")}
        />,
      ),
    );
    expect(
      host.querySelector('table[aria-label="Firing alerts"]'),
    ).not.toBeNull();
    await act(async () => auth.lockProtectedSession(reason));
    expect(host.querySelector('table[aria-label="Firing alerts"]')).toBeNull();
    expect(host.textContent).toContain("Session locked");
    const link = [...host.querySelectorAll<HTMLAnchorElement>("a")].find(
      (item) => item.textContent === "Sign in again",
    );
    expect(link?.getAttribute("href")).toBe("/");
    expect(host.textContent).not.toContain("Try again");
  },
);

// A hidden document remains locked even if BFCache restores its components.
it("pagehide clears live ops records and requires fresh-document reentry", async () => {
  const { createPrivateReaderSession } = reader;
  const { createOpsStatusController, OPS_CREDENTIAL_ENDPOINT } = ops;
  const fetcher = vi.fn<typeof fetch>(async (input) =>
    String(input) === OPS_CREDENTIAL_ENDPOINT
      ? Response.json({
          credential: "synthetic",
          scope: ["ops:read"],
          expiresAt: Math.floor(Date.now() / 1000) + 60,
        })
      : Response.json(snapshot),
  );
  const controller = createOpsStatusController({
    session: createPrivateReaderSession({
      fetch: fetcher,
      csrf: async () => "synthetic",
      endpoint: OPS_CREDENTIAL_ENDPOINT,
    }),
    fetch: fetcher,
    isHidden: () => false,
  });
  await act(async () =>
    root.render(<ObservabilityWorkspace enabled controller={controller} />),
  );
  // Let Response stream reads and the controller subscription complete.
  for (let i = 0; i < 8; i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(host.querySelector("table")).not.toBeNull();
  await act(async () =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  expect(host.querySelector("table")).toBeNull();
  expect(host.textContent).toContain("Session locked");
  expect(
    [...host.querySelectorAll("a")].some(
      (link) => link.textContent === "Sign in again",
    ),
  ).toBe(true);
  const attempts = fetcher.mock.calls.length;
  await act(async () =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  expect(host.querySelector("table")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(attempts);
});
