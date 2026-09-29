// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
let api: typeof import("./protected-admin-json");
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  api = await import("./protected-admin-json");
});
it("uses Access AJAX signaling and refuses cross-origin transport without effects", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ ok: true }));
  const response = await api.protectedAdminJson(
    "/api/editorial/save",
    { method: "POST", body: "{}", headers: { "X-Editorial-CSRF": "fixture" } },
    fetcher,
  );
  expect(await response.json()).toEqual({ ok: true });
  const init = fetcher.mock.calls[0]![1]!;
  expect(init).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    method: "POST",
    body: "{}",
  });
  expect(new Headers(init.headers).get("X-Requested-With")).toBe(
    "XMLHttpRequest",
  );
  await expect(
    api.protectedAdminJson("https://reader.invalid/api", {}, fetcher),
  ).rejects.toMatchObject({ kind: "unavailable" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([401, 403])(
  "locks %s owner refusals and never replays a write",
  async (status) => {
    const fetcher = vi.fn(async () => json({ error: "unauthorized" }, status));
    await expect(
      api.protectedAdminJson(
        "/api/editorial/save",
        { method: "POST" },
        fetcher,
      ),
    ).rejects.toMatchObject({ kind: status === 401 ? "expired" : "denied" });
    await expect(
      api.protectedAdminJson(
        "/api/editorial/save",
        { method: "POST" },
        fetcher,
      ),
    ).rejects.toMatchObject({ kind: "locked" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([
  "csrf_required",
  "origin_required",
  "invalid_origin",
  "json_required",
])(
  "keeps application refusal %s distinct and permits explicit correction",
  async (code) => {
    const response = await api.protectedAdminJson(
      "/api/editorial/save",
      {},
      async () => json({ error: code }, 403),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(code);
    expect(
      await (
        await api.protectedAdminJson("/api/editorial/csrf", {}, async () =>
          json({ csrf: "fixture" }),
        )
      ).json(),
    ).toEqual({ csrf: "fixture" });
  },
);
it.each([
  () =>
    new Response("<html>Access</html>", {
      headers: { "content-type": "text/html" },
    }),
  () =>
    new Response("broken", { headers: { "content-type": "application/json" } }),
  () => json({ long: "12345678901234567890" }),
])(
  "rejects unusable JSON without interpreting it as identity proof",
  async (make) => {
    await expect(
      api.protectedAdminJson("/api/editorial/csrf", {}, async () => make(), {
        maxBytes: 15,
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  },
);
it("drops late private responses after pagehide and blocks BFCache renewal", async () => {
  let finish!: (response: Response) => void;
  const pending = api.protectedAdminJson(
    "/api/editorial/record",
    {},
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  window.dispatchEvent(new Event("pagehide"));
  finish(json({ source: "synthetic private text" }));
  await expect(pending).rejects.toMatchObject({ kind: "locked" });
  window.dispatchEvent(
    new PageTransitionEvent("pageshow", { persisted: true }),
  );
  await expect(
    api.protectedAdminJson("/api/editorial/record", {}, vi.fn()),
  ).rejects.toMatchObject({ kind: "locked" });
});
it("invalidates a previously buffered JSON response on cross-tab logout", async () => {
  const response = await api.protectedAdminJson(
    "/api/editorial/record",
    {},
    async () => json({ source: "private" }),
  );
  window.dispatchEvent(
    new StorageEvent("storage", { key: "editorial-recovery:logout" }),
  );
  // Use the actual persisted key, which is shared with recovery.
  const { recoveryLogoutGenerationKey } = await import("./browser-recovery");
  window.dispatchEvent(
    new StorageEvent("storage", { key: recoveryLogoutGenerationKey }),
  );
  await expect(response.json()).rejects.toMatchObject({ kind: "locked" });
});
