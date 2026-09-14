import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  RESEND_API_KEY: "synthetic-resend-51",
  MERCURY_API_TOKEN: "synthetic-mercury-62",
  MERCURY_ACCOUNT_ID_CHECKING: "synthetic-chk-73",
  MERCURY_ACCOUNT_ID_SAVINGS: "synthetic-sav-84",
  MINI_API_KEY: "synthetic-mini-95",
};

type Worker = {
  fetch(request: Request, env: unknown): Promise<Response>;
  scheduled(event: unknown, env: unknown, ctx: unknown): Promise<void>;
};

// A query suffix loads a fresh module instance, which stands in for a new isolate.
async function freshWorker(isolate: string): Promise<Worker> {
  return (await import(`./index.ts?isolate=${isolate}`)).default as Worker;
}

function healthyDb() {
  const statement = {
    bind: () => statement,
    first: async () => ({ cnt: 3 }),
  };
  return { prepare: mock(() => statement) };
}

// Every query rejects, so the report build fails before any email send.
function offlineDb() {
  const statement = {
    bind: () => statement,
    first: async () => Promise.reject(new Error("d1 offline")),
    all: async () => Promise.reject(new Error("d1 offline")),
  };
  return { prepare: mock(() => statement) };
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

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

describe("weekly email entry wiring", () => {
  it("logs one contract line from the first fetch and keeps responses unchanged", async () => {
    const worker = await freshWorker("fetch-first");
    const logs = captureConsole();
    const env = { DB: healthyDb(), ...secrets };

    const health = await worker.fetch(new Request("https://weekly.test/"), env);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      app: "weekly-email",
      ok: true,
      d1: "connected",
      tables_ok: true,
    });
    const rejected = await worker.fetch(
      new Request("https://weekly.test/", { method: "PUT" }),
      env,
    );
    expect(rejected.status).toBe(405);

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "runtime_contract",
      worker: "weekly-email",
      entry: "fetch",
      ok: true,
      missing: [],
    });
    for (const value of Object.values(secrets))
      expect(logs.text()).not.toContain(value);
  });

  it("logs from the first cron and still runs the report when names are missing", async () => {
    const worker = await freshWorker("scheduled-first");
    const logs = captureConsole();
    const provider = mock(async () => new Response(null, { status: 500 }));
    globalThis.fetch = provider as unknown as typeof fetch;
    const db = offlineDb();
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };

    await worker.scheduled({ scheduledTime: Date.now() }, { DB: db }, ctx);
    await Promise.all(pending);
    await worker.fetch(new Request("https://weekly.test/"), { DB: db });

    // Unchanged: the cron still queries D1 and never reaches the provider.
    expect(db.prepare.mock.calls.length).toBeGreaterThan(0);
    expect(provider).not.toHaveBeenCalled();
    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      worker: "weekly-email",
      entry: "scheduled",
      ok: false,
      missing: ["RESEND_API_KEY"],
      features: {
        mini_status: { state: "unavailable", missing: ["MINI_API_KEY"] },
      },
    });
  });
});
