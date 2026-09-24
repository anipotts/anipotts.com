import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Synthetic values stay short so the literal-secret scan keeps working here.
// They stand in for secrets that may still be set in Cloudflare after the
// retirement; the worker must neither read nor echo them.
const staleSecrets = {
  RESEND_API_KEY: "synthetic-resend-51",
  MERCURY_API_TOKEN: "synthetic-mercury-62",
  MINI_API_KEY: "synthetic-mini-95",
};

type Worker = {
  fetch(request: Request, env: unknown): Promise<Response>;
  scheduled(event: unknown, env: unknown, ctx?: unknown): Promise<void>;
};

// A query suffix loads a fresh module instance, which stands in for a new isolate.
async function freshWorker(isolate: string): Promise<Worker> {
  return (await import(`./index.ts?isolate=${isolate}`)).default as Worker;
}

type QueueRow = { status: string; n: number; last_at: string | null };

// Shaped like production on 2026-09-22: 17 failed and 4 pending, none sent.
const liveQueue: QueueRow[] = [
  { status: "failed", n: 17, last_at: "2026-09-20T13:00:41.955Z" },
  { status: "pending", n: 4, last_at: "2026-09-20T13:00:42.635Z" },
];

function queueDb(rows: QueueRow[] = liveQueue) {
  const statement = {
    bind: () => statement,
    all: async () => ({ results: rows }),
    first: async () => null,
    run: async () => ({}),
  };
  const prepare = mock((_sql: string) => statement);
  const batch = mock(async () => []);
  return {
    prepare,
    batch,
    sql: () => prepare.mock.calls.map(([sql]) => sql),
  };
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

describe("retired weekly email status", () => {
  it("A-14: reports the retirement with queue counts and no send", async () => {
    const worker = await freshWorker("status-live");
    captureConsole();
    const network = forbidNetwork();
    const db = queueDb();

    const response = await worker.fetch(new Request("https://weekly.test/"), {
      DB: db,
      ...staleSecrets,
    });
    expect(response.status).toBe(410);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      app: "weekly-email",
      ok: false,
      retired: true,
      d1: "connected",
      last_sent_at: null,
      email_queue: { pending: 4, failed: 17, sent: 0 },
    });
    expect(Object.keys(body).sort()).toEqual([
      "app",
      "d1",
      "email_queue",
      "last_sent_at",
      "ok",
      "retired",
      "ts",
    ]);

    // One aggregate read of the queue. It never selects a report body,
    // subject or address, and it never counts the retired thoughts table.
    const [sql, ...rest] = db.sql();
    expect(rest).toEqual([]);
    expect(sql).toContain("FROM email_queue GROUP BY status");
    for (const column of ["html", "subject", "to_address", "thoughts"])
      expect(sql).not.toContain(column);
    expect(db.batch).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("reads last_sent_at from a delivered queue row when one exists", async () => {
    const worker = await freshWorker("status-sent");
    captureConsole();
    const db = queueDb([
      ...liveQueue,
      { status: "sent", n: 1, last_at: "2026-04-26T13:00:05.000Z" },
    ]);
    const body = (await (
      await worker.fetch(new Request("https://weekly.test/"), { DB: db })
    ).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: false,
      last_sent_at: "2026-04-26T13:00:05.000Z",
      email_queue: { pending: 4, failed: 17, sent: 1 },
    });
  });

  it("reports an unreadable queue as a D1 error instead of zero counts", async () => {
    const worker = await freshWorker("status-error");
    captureConsole();
    const db = {
      prepare: () => ({
        all: async () => {
          throw new Error("D1 offline with provider detail");
        },
      }),
    };
    const response = await worker.fetch(new Request("https://weekly.test/"), {
      DB: db,
    });
    expect(response.status).toBe(410);
    const text = await response.text();
    expect(text).not.toContain("provider detail");
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      retired: true,
      d1: "error",
      last_sent_at: null,
      email_queue: null,
    });
  });

  for (const method of ["POST", "PUT", "DELETE"]) {
    it(`answers ${method} with 405 and never reads, writes or sends`, async () => {
      const worker = await freshWorker(`method-${method}`);
      captureConsole();
      const network = forbidNetwork();
      const db = queueDb();
      const response = await worker.fetch(
        new Request("https://weekly.test/", { method }),
        { DB: db, ...staleSecrets },
      );
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "Method not allowed" });
      expect(db.prepare).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    });
  }
});

describe("retired weekly email schedule", () => {
  it("A-14: logs a stale schedule and does nothing else", async () => {
    const worker = await freshWorker("scheduled");
    const logs = captureConsole();
    const network = forbidNetwork();
    const db = queueDb();
    const waitUntil = mock((_promise: Promise<unknown>) => {});

    await worker.scheduled(
      { cron: "0 13 * * SUN", scheduledTime: Date.UTC(2026, 8, 27, 13) },
      { DB: db, ...staleSecrets },
      { waitUntil },
    );

    expect(db.prepare).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(logs.retiredLines()).toEqual([
      {
        event: "scheduled_retired",
        worker: "weekly-email",
        cron: "0 13 * * SUN",
        scheduled_at: "2026-09-27T13:00:00.000Z",
      },
    ]);
  });

  it("logs a malformed event without throwing", async () => {
    const worker = await freshWorker("scheduled-malformed");
    const logs = captureConsole();
    await worker.scheduled({ scheduledTime: Number.NaN }, { DB: queueDb() });
    expect(logs.retiredLines()).toEqual([
      {
        event: "scheduled_retired",
        worker: "weekly-email",
        cron: null,
        scheduled_at: null,
      },
    ]);
  });
});

describe("weekly email entry wiring", () => {
  it("logs one contract line from the first entry and never echoes a secret", async () => {
    const worker = await freshWorker("contract-once");
    const logs = captureConsole();
    const env = { DB: queueDb(), ...staleSecrets };

    await worker.scheduled({ scheduledTime: Date.now() }, env);
    await worker.fetch(new Request("https://weekly.test/"), env);
    await worker.fetch(
      new Request("https://weekly.test/", { method: "POST" }),
      env,
    );

    const lines = logs.contractLines();
    expect(lines).toEqual([
      {
        event: "runtime_contract",
        worker: "weekly-email",
        entry: "scheduled",
        ok: true,
        missing: [],
      },
    ]);
    for (const value of Object.values(staleSecrets))
      expect(logs.text()).not.toContain(value);
  });

  it("A-14, A-15: keeps the send, the retry and every report source out of the source", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    for (const retired of [
      "api.resend.com",
      "api.mercury.com",
      "mini.anipotts.com",
      "INSERT",
      "UPDATE",
      "business_data",
      "code_health",
      "ops_snapshots",
      "thoughts",
      "RESEND_API_KEY",
    ])
      expect(source).not.toContain(retired);
  });
});
