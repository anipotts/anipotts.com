import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Durable Object classes extend the workerd base class; the routes under test
// never construct them.
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  STATE_PUBLISH_KEY: "synthetic-publish-39",
  CONTROL_PLANE_DEVICE_PUBLIC_JWK: "synthetic-jwk-40",
};
const origin = "https://owner.example";

type App = {
  fetch(request: Request, env: unknown): Response | Promise<Response>;
};

// A query suffix loads a fresh module instance, which stands in for a new isolate.
async function freshApp(isolate: string): Promise<App> {
  return (await import(`./index.ts?isolate=${isolate}`)).default as App;
}

function namespace() {
  return {
    idFromName: mock(() => null),
    get: mock(() => null),
    getByName: mock(() => null),
  };
}

function completeEnv(): Record<string, unknown> {
  return {
    LINK_VAULT: namespace(),
    CODE_STATS: namespace(),
    COMMAND_RELAY: namespace(),
    ALLOWED_ORIGINS: origin,
    ...secrets,
  };
}

function captureConsole() {
  const spies = (["info", "warn", "log", "error"] as const).map((level) =>
    spyOn(console, level).mockImplementation(() => {}),
  );
  const output = () =>
    spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String)));
  return {
    contractLines: () =>
      output()
        .map((args) => args[0] ?? "")
        .filter((line) => line.includes('"event":"runtime_contract"'))
        .map((line) => JSON.parse(line)),
    text: () => JSON.stringify(output()),
  };
}

afterEach(() => {
  mock.restore();
});

describe("state entry wiring", () => {
  it("logs one contract line from the first request and keeps responses unchanged", async () => {
    const app = await freshApp("complete");
    const logs = captureConsole();
    const env = completeEnv();

    const health = await app.fetch(new Request("https://api.test/health"), env);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ service: "anipotts-state" });
    const info = await app.fetch(
      new Request("https://api.test/", { headers: { Origin: origin } }),
      env,
    );
    expect(info.status).toBe(200);
    expect(info.headers.get("access-control-allow-origin")).toBe(origin);
    expect(await info.json()).toMatchObject({ service: "anipotts-state" });
    const unauthorized = await app.fetch(
      new Request("https://api.test/api/links", { method: "POST" }),
      env,
    );
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "unauthorized" });

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "runtime_contract",
      worker: "state",
      entry: "fetch",
      ok: true,
      missing: [],
    });
    for (const value of Object.values(secrets))
      expect(logs.text()).not.toContain(value);
  });

  it("advertises only the links and commits endpoints", async () => {
    const app = await freshApp("info");
    captureConsole();

    const info = await app.fetch(
      new Request("https://api.test/"),
      completeEnv(),
    );
    const body = (await info.json()) as {
      durableObjects: string[];
      endpoints: Record<string, unknown>;
    };
    expect(Object.keys(body.endpoints)).toEqual(["links", "commits"]);
    expect(JSON.stringify(body)).not.toContain("/api/control");
    expect(body.durableObjects).toEqual([
      "LinkVault",
      "CodeStats",
      "CommandRelay",
    ]);
  });

  it("refuses every control connect when no device key is configured", async () => {
    const app = await freshApp("no-device-key");
    captureConsole();
    const env = completeEnv();
    delete env.CONTROL_PLANE_DEVICE_PUBLIC_JWK;
    const relay = env.COMMAND_RELAY as ReturnType<typeof namespace>;

    const connect = await app.fetch(
      new Request("https://api.test/api/control/devices/ap-mini/connect", {
        headers: {
          Upgrade: "websocket",
          "x-control-timestamp": new Date().toISOString(),
          "x-control-nonce": "n".repeat(32),
          "x-control-signature": "s".repeat(64),
        },
      }),
      env,
    );
    expect(connect.status).toBe(401);
    expect(await connect.json()).toEqual({ error: "unauthorized_device" });
    expect(relay.getByName).not.toHaveBeenCalled();
  });

  it("logs a degraded contract without changing any route outcome", async () => {
    const app = await freshApp("degraded");
    const logs = captureConsole();
    const env = completeEnv();
    delete env.LINK_VAULT;
    delete env.STATE_PUBLISH_KEY;

    const publish = await app.fetch(
      new Request("https://api.test/api/links", { method: "POST" }),
      env,
    );
    expect(publish.status).toBe(503);
    expect(await publish.json()).toEqual({
      error: "STATE_PUBLISH_KEY not configured",
    });
    const socket = await app.fetch(
      new Request("https://api.test/api/control/devices/ap-mini/connect"),
      env,
    );
    expect(socket.status).toBe(426);
    const health = await app.fetch(new Request("https://api.test/health"), env);
    expect(health.status).toBe(200);

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      worker: "state",
      entry: "fetch",
      ok: false,
      missing: ["LINK_VAULT"],
      features: {
        publish: { state: "unavailable", missing: ["STATE_PUBLISH_KEY"] },
      },
    });
  });
});

// A namespace whose one stub answers like the real Durable Object would.
function answering(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const calls: Request[] = [];
  const stub = {
    fetch: mock(async (input: RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      return handler(request);
    }),
  };
  return {
    calls,
    stub,
    namespace: {
      idFromName: mock(() => "default-id"),
      get: mock(() => stub),
      getByName: mock(() => stub),
    },
  };
}

function summaries(links: unknown, commits: unknown) {
  const vault = answering((request) =>
    new URL(request.url).pathname === "/summary"
      ? Response.json(links)
      : Response.json({ link: { id: "synthetic" } }),
  );
  const stats = answering(() => Response.json(commits));
  const env = completeEnv();
  env.LINK_VAULT = vault.namespace;
  env.CODE_STATS = stats.namespace;
  return { env, vault, stats };
}

async function readHealth(app: App, env: Record<string, unknown>) {
  const response = await app.fetch(new Request("https://api.test/health"), env);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return (await response.json()) as Record<string, unknown> & {
    ok: boolean;
    planes: Record<string, Record<string, unknown>>;
  };
}

describe("A-32 GET /health reports each plane", () => {
  it("reads today's state: links readable, commits never received, control disabled, ok false", async () => {
    const app = await freshApp("health-today");
    const logs = captureConsole();
    const { env } = summaries(
      { held: 1, last_saved_at: "2026-05-14T23:04:08.297Z" },
      { held: 0, last_received_at: null },
    );
    delete env.CONTROL_PLANE_DEVICE_PUBLIC_JWK;

    const body = await readHealth(app, env);
    const { ts, ...rest } = body;
    expect(typeof ts).toBe("string");
    expect(rest).toEqual({
      service: "anipotts-state",
      ok: false,
      planes: {
        links: {
          state: "readable",
          held: 1,
          last_saved_at: "2026-05-14T23:04:08.297Z",
        },
        commits: {
          state: "never_received",
          held: 0,
          last_received_at: null,
          freshness_budget_s: 604800,
        },
        control: { state: "disabled" },
      },
    });
    for (const value of Object.values(secrets))
      expect(JSON.stringify(body) + logs.text()).not.toContain(value);
  });

  it("reads ok only while links answer and a commit arrived inside the budget", async () => {
    const app = await freshApp("health-receiving");
    captureConsole();
    const received = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { env } = summaries(
      { held: 0, last_saved_at: null },
      { held: 3, last_received_at: received },
    );

    const body = await readHealth(app, env);
    expect(body.ok).toBe(true);
    expect(body.planes.links).toEqual({
      state: "readable",
      held: 0,
      last_saved_at: null,
    });
    expect(body.planes.commits).toMatchObject({
      state: "receiving",
      held: 3,
      last_received_at: received,
    });
    // A configured key names the route's state; it never sets ok.
    expect(body.planes.control).toEqual({ state: "configured" });
  });

  it("reads none_in_budget once the last receipt is older than a week", async () => {
    const app = await freshApp("health-quiet");
    captureConsole();
    const received = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { env } = summaries(
      { held: 1, last_saved_at: null },
      { held: 40, last_received_at: received },
    );

    const body = await readHealth(app, env);
    expect(body.ok).toBe(false);
    expect(body.planes.commits).toMatchObject({
      state: "none_in_budget",
      last_received_at: received,
    });
  });

  it("reads unrecorded when commits are held without a receipt time", async () => {
    const app = await freshApp("health-unrecorded");
    captureConsole();
    const { env } = summaries(
      { held: 1, last_saved_at: null },
      { held: 2, last_received_at: null },
    );

    const body = await readHealth(app, env);
    expect(body.ok).toBe(false);
    expect(body.planes.commits).toMatchObject({ state: "unrecorded", held: 2 });
  });

  it("reads unreadable for a missing binding, an error, a malformed summary or a timeout", async () => {
    const app = await freshApp("health-unreadable");
    captureConsole();

    const missing = completeEnv();
    delete missing.LINK_VAULT;
    delete missing.CODE_STATS;
    const none = await readHealth(app, missing);
    expect(none.ok).toBe(false);
    expect(none.planes.links).toEqual({
      state: "unreadable",
      held: null,
      last_saved_at: null,
    });
    expect(none.planes.commits).toMatchObject({
      state: "unreadable",
      held: null,
    });

    const failing = summaries({ held: 1, last_saved_at: null }, {});
    failing.env.LINK_VAULT = answering(
      () => new Response("boom", { status: 500 }),
    ).namespace;
    const broken = await readHealth(app, failing.env);
    expect(broken.planes.links.state).toBe("unreadable");
    // `held` is missing from the commits summary.
    expect(broken.planes.commits.state).toBe("unreadable");

    for (const malformed of [
      { held: -1, last_saved_at: null },
      { held: "1", last_saved_at: null },
      { held: 1.5, last_saved_at: null },
      { held: 1, last_saved_at: "not a time" },
      { held: 1 },
      [1],
    ]) {
      const { env } = summaries(malformed, { held: 0, last_received_at: null });
      const body = await readHealth(app, env);
      expect(body.planes.links.state).toBe("unreadable");
    }
  });

  it("gives each plane read a budget instead of waiting forever", async () => {
    const { stateHealth } = await import("./health");
    const hung = { fetch: () => new Promise<Response>(() => {}) };
    const started = Date.now();
    const body = await stateHealth(
      {
        links: () => hung as unknown as DurableObjectStub,
        commits: () => hung as unknown as DurableObjectStub,
        controlConfigured: false,
        timeoutMs: 20,
      },
      Date.now(),
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(body.ok).toBe(false);
    expect(body.planes.links.state).toBe("unreadable");
    expect(body.planes.commits.state).toBe("unreadable");
  });

  it("returns counts and times only, never a stored url or anything extra", async () => {
    const app = await freshApp("health-bounded");
    captureConsole();
    const { env } = summaries(
      {
        held: 1,
        last_saved_at: "2026-05-14T23:04:08.297Z",
        url: "https://private.example/link",
      },
      { held: 0, last_received_at: null, sha: "synthetic-sha" },
    );

    const body = await readHealth(app, env);
    const text = JSON.stringify(body);
    expect(text).not.toContain("private.example");
    expect(text).not.toContain("synthetic-sha");
    expect(Object.keys(body.planes.links)).toEqual([
      "state",
      "held",
      "last_saved_at",
    ]);
  });
});

describe("POST /api/links validates source", () => {
  const auth = { Authorization: `Bearer ${secrets.STATE_PUBLISH_KEY}` };

  async function post(app: App, env: Record<string, unknown>, body: string) {
    return app.fetch(
      new Request("https://api.test/api/links", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body,
      }),
      env,
    );
  }

  it("rejects any source outside shortcut, admin and manual with a 400 before the vault", async () => {
    const app = await freshApp("links-source-reject");
    captureConsole();
    const { env, vault } = summaries({}, {});

    for (const source of ["rudy", "", "Manual", null, 1, ["manual"]]) {
      const response = await post(
        app,
        env,
        JSON.stringify({ url: "https://example.test", source }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "source must be one of shortcut, admin, manual",
      });
    }
    for (const body of ["not json", "[]", "null", '"manual"']) {
      const response = await post(app, env, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "body must be a JSON object",
      });
    }
    expect(vault.calls).toHaveLength(0);
  });

  it("forwards each allowed source, and a missing one, to the vault unchanged", async () => {
    const app = await freshApp("links-source-accept");
    captureConsole();
    const { env, vault } = summaries({}, {});

    for (const source of ["shortcut", "admin", "manual", undefined]) {
      const payload = { url: "https://example.test", source };
      const response = await post(app, env, JSON.stringify(payload));
      expect(response.status).toBe(200);
      const forwarded = vault.calls.at(-1);
      expect(forwarded?.method).toBe("POST");
      expect(await forwarded?.json()).toEqual(
        JSON.parse(JSON.stringify(payload)),
      );
    }
    expect(vault.calls).toHaveLength(4);
  });

  it("still answers 401 before it looks at the body", async () => {
    const app = await freshApp("links-source-auth");
    captureConsole();
    const { env, vault } = summaries({}, {});

    const response = await app.fetch(
      new Request("https://api.test/api/links", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.test", source: "rudy" }),
      }),
      env,
    );
    expect(response.status).toBe(401);
    expect(vault.calls).toHaveLength(0);
  });
});
