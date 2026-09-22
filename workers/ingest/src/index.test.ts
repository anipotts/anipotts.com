import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  MAC_MINI_INGEST_KEY: "synthetic-mini-41",
  BRANDS_INGEST_KEY: "synthetic-brand-52",
};
// Stand-ins for secrets that may still be set in Cloudflare after the cron
// jobs were retired. The worker must neither read nor echo them.
const staleSecrets = {
  GITHUB_TOKEN: "synthetic-gh-63",
  CF_API_TOKEN: "synthetic-cf-74",
};

type Worker = {
  fetch(request: Request, env: unknown): Promise<Response>;
  scheduled(event: unknown, env: unknown, ctx?: unknown): Promise<void>;
};

// A query suffix loads a fresh module instance, which stands in for a new isolate.
async function freshWorker(isolate: string): Promise<Worker> {
  return (await import(`./index.ts?isolate=${isolate}`)).default as Worker;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeDb(lastAt: string | null = "2026-06-24T02:49:13.052Z") {
  const bound: unknown[][] = [];
  const statement = {
    bind: (...values: unknown[]) => {
      bound.push(values);
      return statement;
    },
    first: async () => ({ last_at: lastAt }),
    run: async () => ({}),
  };
  const prepare = mock((_sql: string) => statement);
  const batch = mock(async (_statements: unknown[]) => []);
  return {
    prepare,
    batch,
    bound,
    sql: () => prepare.mock.calls.map(([sql]) => sql),
  };
}

function completeEnv(db = fakeDb()): Record<string, unknown> & {
  DB: ReturnType<typeof fakeDb>;
} {
  return { DB: db, ...secrets, ...staleSecrets };
}

function post(body: unknown, key?: string) {
  return new Request("https://ingest.test/", {
    method: "POST",
    headers: key ? { "X-Ingest-Key": key } : {},
    body: JSON.stringify(body),
  });
}

function captureConsole() {
  const spies = (["info", "warn", "log", "error"] as const).map((level) =>
    spyOn(console, level).mockImplementation(() => {}),
  );
  const output = () =>
    spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String)));
  const events = (name: string) =>
    output()
      .map((args) => args[0] ?? "")
      .filter((line) => line.includes(`"event":"${name}"`))
      .map((line) => JSON.parse(line));
  return {
    contractLines: () => events("runtime_contract"),
    retiredLines: () => events("scheduled_retired"),
    text: () => JSON.stringify(output()),
  };
}

const realFetch = globalThis.fetch;

function forbidNetwork() {
  const network = mock(async () => new Response("unexpected", { status: 500 }));
  globalThis.fetch = network as unknown as typeof fetch;
  return network;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

describe("ingest health", () => {
  it("reports the stale brands_email capture as not ok", async () => {
    const worker = await freshWorker("health-stale");
    captureConsole();
    const network = forbidNetwork();
    const env = completeEnv();

    const response = await worker.fetch(
      new Request("https://ingest.test/"),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      app: "ingest",
      ok: false,
      d1: "connected",
      brands_email: {
        state: "stale",
        last_ingested_at: "2026-06-24T02:49:13.052Z",
        freshness_budget_s: 604800,
      },
    });
    expect(Object.keys(body).sort()).toEqual([
      "app",
      "brands_email",
      "d1",
      "ok",
      "ts",
    ]);

    // One timestamp read. It never counts the retired thoughts table and
    // never selects a subject, address or message id.
    expect(env.DB.sql()).toEqual([
      "SELECT MAX(ingested_at) AS last_at FROM brands_emails",
    ]);
    expect(network).not.toHaveBeenCalled();
  });

  it("reports a capture inside its 7 day budget as ok", async () => {
    const worker = await freshWorker("health-fresh");
    captureConsole();
    const recent = new Date(Date.now() - 6 * DAY_MS).toISOString();
    const body = (await (
      await worker.fetch(
        new Request("https://ingest.test/"),
        completeEnv(fakeDb(recent)),
      )
    ).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      brands_email: { state: "fresh", last_ingested_at: recent },
    });
  });

  it("reports an empty table as never received, not as zero", async () => {
    const worker = await freshWorker("health-never");
    captureConsole();
    const body = (await (
      await worker.fetch(
        new Request("https://ingest.test/"),
        completeEnv(fakeDb(null)),
      )
    ).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: false,
      d1: "connected",
      brands_email: { state: "never", last_ingested_at: null },
    });
  });

  it("reports an unparseable timestamp as unknown", async () => {
    const worker = await freshWorker("health-unparseable");
    captureConsole();
    const body = (await (
      await worker.fetch(
        new Request("https://ingest.test/"),
        completeEnv(fakeDb("not a time")),
      )
    ).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: false,
      brands_email: { state: "unknown", last_ingested_at: "not a time" },
    });
  });

  it("reports an unreadable D1 as an error with an unknown capture", async () => {
    const worker = await freshWorker("health-error");
    captureConsole();
    const db = {
      prepare: () => ({
        first: async () => {
          throw new Error("D1 offline with provider detail");
        },
      }),
    };
    const text = await (
      await worker.fetch(new Request("https://ingest.test/"), { DB: db })
    ).text();
    expect(text).not.toContain("provider detail");
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      d1: "error",
      brands_email: {
        state: "unknown",
        last_ingested_at: null,
        freshness_budget_s: 604800,
      },
    });
  });
});

describe("ingest writes", () => {
  it("answers OPTIONS, rejects other methods and requires a key", async () => {
    const worker = await freshWorker("methods");
    captureConsole();
    const env = completeEnv();
    const options = await worker.fetch(
      new Request("https://ingest.test/", { method: "OPTIONS" }),
      env,
    );
    expect(options.status).toBe(204);
    const put = await worker.fetch(
      new Request("https://ingest.test/", { method: "PUT" }),
      env,
    );
    expect(put.status).toBe(405);
    const unauthorized = await worker.fetch(
      new Request("https://ingest.test/", { method: "POST" }),
      env,
    );
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });
  });

  for (const category of ["ops", "code", "analytics", "business", "rollup"]) {
    it(`rejects the retired ${category} category even with the mini key`, async () => {
      const worker = await freshWorker(`retired-${category}`);
      captureConsole();
      const env = completeEnv();
      const response = await worker.fetch(
        post(
          { category, data: { key: "k", value: "v" } },
          secrets.MAC_MINI_INGEST_KEY,
        ),
        env,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid category. Must be one of: brands_email",
      });
      expect(env.DB.prepare).not.toHaveBeenCalled();
      expect(env.DB.batch).not.toHaveBeenCalled();
    });
  }

  it("writes brands_email identity fields with INSERT OR IGNORE", async () => {
    const worker = await freshWorker("brands-write");
    captureConsole();
    const env = completeEnv();
    const response = await worker.fetch(
      post(
        {
          category: "brands_email",
          data: [
            {
              message_id: "m-1",
              thread_id: "t-1",
              subject: "synthetic subject",
              status: "replied",
              notes: "admin note",
            },
          ],
        },
        secrets.BRANDS_INGEST_KEY,
      ),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, rows_written: 1 });
    expect(env.DB.sql()).toEqual([
      "INSERT OR IGNORE INTO brands_emails (message_id, thread_id, subject, ingested_at) VALUES (?, ?, ?, ?)",
    ]);
    const [values] = env.DB.bound;
    expect(values?.slice(0, 3)).toEqual(["m-1", "t-1", "synthetic subject"]);
    expect(env.DB.batch).toHaveBeenCalledTimes(1);
  });

  it("keeps the mini key as a superset key for brands_email", async () => {
    const worker = await freshWorker("brands-mini-key");
    captureConsole();
    const env = completeEnv();
    const accepted = await worker.fetch(
      post(
        { category: "brands_email", data: { message_id: "m-2" } },
        secrets.MAC_MINI_INGEST_KEY,
      ),
      env,
    );
    expect(accepted.status).toBe(200);
    const rejected = await worker.fetch(
      post(
        { category: "brands_email", data: { message_id: "m-3" } },
        "synthetic-wrong-00",
      ),
      env,
    );
    expect(rejected.status).toBe(401);
  });

  it("rejects a row with no allowlisted column", async () => {
    const worker = await freshWorker("brands-empty-row");
    captureConsole();
    const env = completeEnv();
    const response = await worker.fetch(
      post(
        { category: "brands_email", data: { status: "replied" } },
        secrets.BRANDS_INGEST_KEY,
      ),
      env,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No valid columns in row" });
    expect(env.DB.batch).not.toHaveBeenCalled();
  });
});

describe("retired ingest schedule", () => {
  it("logs a stale schedule and does nothing else", async () => {
    const worker = await freshWorker("scheduled");
    const logs = captureConsole();
    const network = forbidNetwork();
    const env = completeEnv();
    const waitUntil = mock((_promise: Promise<unknown>) => {});

    await worker.scheduled(
      { cron: "* * * * *", scheduledTime: Date.UTC(2026, 8, 22, 12, 5) },
      env,
      { waitUntil },
    );

    expect(network).not.toHaveBeenCalled();
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(logs.retiredLines()).toEqual([
      {
        event: "scheduled_retired",
        worker: "ingest",
        cron: "* * * * *",
        scheduled_at: "2026-09-22T12:05:00.000Z",
      },
    ]);
  });

  it("logs a malformed event without throwing", async () => {
    const worker = await freshWorker("scheduled-malformed");
    const logs = captureConsole();
    await worker.scheduled({ scheduledTime: "soon" }, completeEnv());
    expect(logs.retiredLines()).toEqual([
      {
        event: "scheduled_retired",
        worker: "ingest",
        cron: null,
        scheduled_at: null,
      },
    ]);
  });
});

describe("ingest entry wiring", () => {
  it("logs one contract line from the first entry and never echoes a secret", async () => {
    const worker = await freshWorker("contract-once");
    const logs = captureConsole();
    const env = completeEnv();
    delete env.MAC_MINI_INGEST_KEY;

    await worker.scheduled({ scheduledTime: Date.now() }, env);
    await worker.fetch(new Request("https://ingest.test/"), env);

    expect(logs.contractLines()).toEqual([
      {
        event: "runtime_contract",
        worker: "ingest",
        entry: "scheduled",
        ok: true,
        missing: [],
        features: {
          brands_ingest: { state: "available", missing: [] },
          mini_ingest: {
            state: "unavailable",
            missing: ["MAC_MINI_INGEST_KEY"],
          },
        },
      },
    ]);
    for (const value of [
      ...Object.values(secrets),
      ...Object.values(staleSecrets),
    ])
      expect(logs.text()).not.toContain(value);
  });

  it("keeps the retired cron jobs and categories out of the source", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    for (const retired of [
      "await fetch(",
      "api.github.com",
      "api.cloudflare.com",
      "api.npmjs.org",
      "workers.dev",
      "thoughts",
      "ops_snapshots",
      "code_health",
      "analytics_events",
      "business_data",
      "daily_rollups",
      "INSERT OR REPLACE INTO",
      "GITHUB_TOKEN",
      "CF_API_TOKEN",
      "CF_ACCOUNT_ID",
    ])
      expect(source).not.toContain(retired);
  });
});
