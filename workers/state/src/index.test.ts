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
    expect(await health.json()).toMatchObject({ ok: true });
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
