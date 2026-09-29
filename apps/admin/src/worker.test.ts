import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HASHED_ASSET_CACHE } from "./lib/hashed-assets";

const inner = vi.hoisted(() => ({
  fetch: vi.fn(
    async (_request: Request, _env: unknown, _context: unknown) =>
      new Response("astro", { status: 200 }),
  ),
}));
vi.mock("@astrojs/cloudflare/handler", () => ({ handle: inner.fetch }));
vi.mock("./editorial/draft-store", () => ({
  EditorialDraftStore: class EditorialDraftStore {},
}));

const context = { waitUntil() {}, passThroughOnException() {} };
// Workers request typing adds cf fields the adapter never reads here.
const request = () =>
  new Request("https://admin.anipotts.com/content") as never;

function contractLines(...spies: Array<{ mock: { calls: unknown[][] } }>) {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map(([line]) => String(line))
    .filter((line) => line.includes('"runtime_contract"'));
}

async function freshWorker() {
  return { ...(await import("./worker")) };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEV", false);
  vi.stubGlobal("__LOCAL_OWNER_BUILD__", false);
  inner.fetch.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("reports misconfiguration once per isolate without blocking requests", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const worker = await freshWorker();
  // No Access, assets, database or editorial configuration at all.
  const env = {} as never;
  const first = await worker.default.fetch(request(), env, context as never);
  const second = await worker.default.fetch(request(), env, context as never);
  expect(await first.text()).toBe("astro");
  expect(second.status).toBe(200);
  expect(inner.fetch).toHaveBeenCalledTimes(2);
  expect(inner.fetch.mock.calls[0][1]).toBe(env);
  expect(inner.fetch.mock.calls[0][2]).toBe(context);
  const lines = contractLines(info, warn);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({
    event: "runtime_contract",
    app: "admin",
    entry: "fetch",
    ok: false,
    missing: ["ASSETS", "ACCESS_TEAM_DOMAIN", "ACCESS_POLICY_AUD"],
  });
});

it("delegates even when the env itself throws on every read", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const worker = await freshWorker();
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile env");
      },
    },
  );
  const response = await worker.default.fetch(
    request(),
    hostile as never,
    context as never,
  );
  expect(response.status).toBe(200);
  expect(inner.fetch).toHaveBeenCalledTimes(1);
});

it("keeps the Durable Object export beside the wrapped handler", async () => {
  const worker = await freshWorker();
  expect(worker.EditorialDraftStore).toBeTypeOf("function");
  expect(Object.keys(worker).sort()).toEqual([
    "EditorialDraftStore",
    "default",
  ]);
});

it("answers the adapter image endpoint with 404", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const worker = await freshWorker();
  const assets = { fetch: vi.fn(async () => new Response("bytes")) };
  const response = await worker.default.fetch(
    new Request(
      "https://admin.anipotts.com/_image?href=/admin-bracket.svg",
    ) as never,
    { ASSETS: assets } as never,
    context as never,
  );
  expect(response.status).toBe(404);
  expect(assets.fetch).not.toHaveBeenCalled();
  expect(inner.fetch).not.toHaveBeenCalled();
});

describe("hashed build output", () => {
  const assetRequest = (init?: RequestInit, path = "/_astro/app.Ab12.js") =>
    new Request(`https://admin.anipotts.com${path}`, init) as never;
  const assets = (response: () => Response) => ({
    fetch: vi.fn(async (_request: Request) => response()),
  });

  it("serves the original request from ASSETS with a year-long private cache", async () => {
    const worker = await freshWorker();
    const binding = assets(
      () =>
        new Response("code", {
          headers: {
            "Cache-Control": "public, max-age=0, must-revalidate",
            ETag: '"abc"',
          },
        }),
    );
    const request = assetRequest({ headers: { "If-None-Match": '"old"' } });
    const response = await worker.default.fetch(
      request,
      { ASSETS: binding } as never,
      context as never,
    );
    expect(binding.fetch).toHaveBeenCalledWith(request);
    expect(inner.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("code");
    expect(response.headers.get("cache-control")).toBe(HASHED_ASSET_CACHE);
    expect(HASHED_ASSET_CACHE).toMatch(/^private, /);
    expect(response.headers.get("etag")).toBe('"abc"');
  });

  it("keeps a 304 bodyless with its validator", async () => {
    const worker = await freshWorker();
    const binding = assets(
      () => new Response(null, { status: 304, headers: { ETag: '"abc"' } }),
    );
    const response = await worker.default.fetch(
      assetRequest({ headers: { "If-None-Match": '"abc"' } }),
      { ASSETS: binding } as never,
      context as never,
    );
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get("etag")).toBe('"abc"');
    expect(response.headers.get("cache-control")).toBe(HASHED_ASSET_CACHE);
  });

  it("leaves misses, failures, writes and every other path to the adapter", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = await freshWorker();
    const missing = assets(() => new Response("", { status: 404 }));
    const failing = {
      fetch: vi.fn(async () => {
        throw new Error("assets down");
      }),
    };
    for (const [env, request] of [
      [{ ASSETS: missing }, assetRequest()],
      [{ ASSETS: failing }, assetRequest()],
      [{}, assetRequest()],
      [{ ASSETS: missing }, assetRequest({ method: "POST", body: "x" })],
      [{ ASSETS: missing }, assetRequest(undefined, "/content/pages")],
      [{ ASSETS: missing }, assetRequest(undefined, "/admin-bracket.svg")],
    ] as const) {
      const response = await worker.default.fetch(
        request,
        env as never,
        context as never,
      );
      expect(await response.text()).toBe("astro");
      expect(response.headers.get("cache-control")).toBeNull();
    }
    expect(inner.fetch).toHaveBeenCalledTimes(6);
    // Only GET and HEAD under /_astro ever reach ASSETS here.
    expect(missing.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("origin admission before every Worker branch", () => {
  it.each([
    "/",
    "/auth",
    "/auth/logout",
    "/api/admin/logout",
    "/api/health",
    "/api/canary/credential",
    "/api/private-reader/credential",
    "/api/editorial/publish",
    "/_image",
    "/_astro/app.Ab12.js",
    "/@vite/client",
    "/src/private.ts",
  ])(
    "refuses alternate origin %s before assets, adapter or diagnostic reads",
    async (path) => {
      vi.stubEnv("DEV", true);
      const worker = await freshWorker();
      const get = vi.fn(() => {
        throw new Error("must not inspect bindings");
      });
      const env = new Proxy({}, { get });
      const response = await worker.default.fetch(
        new Request(`https://alternate.example${path}`, {
          headers: {
            host: "localhost",
            "x-forwarded-host": "admin.anipotts.com",
            "x-forwarded-for": "127.0.0.1",
          },
        }) as never,
        env as never,
        context as never,
      );
      expect(response.status).toBe(403);
      expect(response.body).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
        "no-store",
      );
      expect(get).not.toHaveBeenCalled();
      expect(inner.fetch).not.toHaveBeenCalled();
    },
  );
  it("production rejects loopback despite runtime flags and forwarded headers", async () => {
    const worker = await freshWorker();
    const assets = { fetch: vi.fn() };
    const response = await worker.default.fetch(
      new Request("http://localhost:4311/_astro/app.Ab12.js") as never,
      { ASSETS: assets, ADMIN_LOCAL_OWNER: "1" } as never,
      context as never,
    );
    expect(response.status).toBe(403);
    expect(assets.fetch).not.toHaveBeenCalled();
    expect(inner.fetch).not.toHaveBeenCalled();
  });
  it("permits direct DEV Vite modules but denies a tunnel naming loopback", async () => {
    vi.stubEnv("DEV", true);
    const worker = await freshWorker();
    const assets = { fetch: vi.fn(async () => new Response("module")) };
    const response = await worker.default.fetch(
      new Request("http://localhost:4311/@vite/client") as never,
      { ASSETS: assets } as never,
      context as never,
    );
    expect(await response.text()).toBe("module");
    assets.fetch.mockClear();
    const tunneled = await worker.default.fetch(
      new Request("http://localhost:4311/@vite/client", {
        headers: { "x-forwarded-for": "203.0.113.8" },
      }) as never,
      { ASSETS: assets } as never,
      context as never,
    );
    expect(tunneled.status).toBe(403);
    expect(assets.fetch).not.toHaveBeenCalled();
  });
  it("admits direct compiled local-owner preview without creating production authority", async () => {
    vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
    const worker = await freshWorker();
    const response = await worker.default.fetch(
      new Request("http://localhost:4311/content") as never,
      {} as never,
      context as never,
    );
    expect(await response.text()).toBe("astro");
  });
});
