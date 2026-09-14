import type { SSRManifest } from "astro";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const inner = vi.hoisted(() => ({
  fetch: vi.fn(
    async (_request: Request, _env: unknown, _context: unknown) =>
      new Response("astro", { status: 200 }),
  ),
}));
vi.mock("@astrojs/cloudflare/entrypoints/server.js", () => ({
  createExports: () => ({ default: { fetch: inner.fetch } }),
}));
vi.mock("./editorial/draft-store", () => ({
  EditorialDraftStore: class EditorialDraftStore {},
}));

const context = { waitUntil() {}, passThroughOnException() {} };
// Workers request typing adds cf fields the adapter never reads here.
const request = () =>
  new Request("https://admin.example.test/content") as never;

function contractLines(...spies: Array<{ mock: { calls: unknown[][] } }>) {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map(([line]) => String(line))
    .filter((line) => line.includes('"runtime_contract"'));
}

async function freshWorker() {
  const { createExports } = await import("./worker");
  return createExports({} as SSRManifest);
}

beforeEach(() => {
  vi.resetModules();
  inner.fetch.mockClear();
});
afterEach(() => vi.restoreAllMocks());

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
