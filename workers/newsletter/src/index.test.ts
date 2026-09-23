import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  RESEND_API_KEY: "synthetic-resend-17",
  NEWSLETTER_MAILING_ADDRESS: "synthetic-postal-28",
};

type Worker = {
  fetch(request: Request, env: unknown): Promise<Response>;
  queue(batch: unknown, env: unknown): Promise<void>;
};

// A query suffix loads a fresh module instance, which stands in for a new isolate.
async function freshWorker(isolate: string): Promise<Worker> {
  return (await import(`./index.ts?isolate=${isolate}`)).default as Worker;
}

function fakeDb() {
  const statement = { bind: () => statement, run: mock(async () => ({})) };
  return { prepare: mock(() => statement), statement };
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

describe("newsletter entry wiring", () => {
  it("logs one contract line from the first fetch and keeps the response unchanged", async () => {
    const worker = await freshWorker("fetch-first");
    const logs = captureConsole();
    const env = { DB: fakeDb(), ...secrets };

    const response = await worker.fetch(
      new Request("https://newsletter.test/"),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ app: "newsletter" });
    await worker.queue({ queue: "newsletter-send", messages: [] }, env);

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "runtime_contract",
      worker: "newsletter",
      entry: "fetch",
      ok: true,
      missing: [],
    });
    for (const value of Object.values(secrets))
      expect(logs.text()).not.toContain(value);
  });

  it("logs from the first queue batch and still acks messages when names are missing", async () => {
    const worker = await freshWorker("queue-first");
    const logs = captureConsole();
    const provider = mock(async () => new Response(null, { status: 500 }));
    globalThis.fetch = provider as unknown as typeof fetch;
    const db = fakeDb();
    const message = {
      body: {
        type: "confirm",
        subscriberId: "sub-1",
        email: "reader@example.com",
        token: "tok-1",
        baseUrl: "https://news.example",
      },
      ack: mock(() => {}),
      retry: mock(() => {}),
    };

    await worker.queue(
      { queue: "newsletter-send", messages: [message] },
      { DB: db },
    );

    // Unchanged: a missing Resend key mocks the send and the message is acked.
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(db.statement.run).toHaveBeenCalledTimes(1);

    // A-32: the fetch answer reports missing secrets and an unreadable DB
    // instead of a constant ok.
    for (const env of [{ DB: db }, {}]) {
      const response = await worker.fetch(
        new Request("https://newsletter.test/"),
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: false,
        d1: "error",
        resend_key: "missing",
        mailing_address: "missing",
      });
    }

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      worker: "newsletter",
      entry: "queue",
      ok: true,
      features: {
        confirmation_email: {
          state: "unavailable",
          missing: ["RESEND_API_KEY"],
        },
        issue_delivery: {
          state: "unavailable",
          missing: ["RESEND_API_KEY", "NEWSLETTER_MAILING_ADDRESS"],
        },
      },
    });
  });
});

type Facts = {
  total?: unknown;
  confirmed?: unknown;
  last_sent_at?: unknown;
  last_error_at?: unknown;
};

// Answers the two health reads by table. Any other read fails the test.
function healthDb(facts: Facts = {}) {
  const sql: string[] = [];
  const bound: unknown[][] = [];
  const answer = (query: string) => {
    if (query.includes("FROM newsletter_subscribers"))
      return { total: facts.total ?? 0, confirmed: facts.confirmed ?? 0 };
    if (query.includes("FROM newsletter_events"))
      return {
        last_sent_at: facts.last_sent_at ?? null,
        last_error_at: facts.last_error_at ?? null,
      };
    throw new Error(`unexpected read: ${query}`);
  };
  return {
    sql,
    bound,
    prepare(query: string) {
      sql.push(query);
      const statement = {
        bind: (...values: unknown[]) => {
          bound.push(values);
          return statement;
        },
        first: async () => answer(query),
        run: async () => {
          throw new Error("health must not write");
        },
      };
      return statement;
    },
  };
}

async function health(worker: Worker, env: unknown) {
  const response = await worker.fetch(
    new Request("https://newsletter.test/"),
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe("A-32 newsletter health", () => {
  it("reports the live shape as dormant with counts, not a constant ok", async () => {
    const worker = await freshWorker("health-dormant");
    captureConsole();
    const network = mock(async () => new Response(null, { status: 500 }));
    globalThis.fetch = network as unknown as typeof fetch;
    const db = healthDb();

    const body = await health(worker, { DB: db, ...secrets });
    expect(body).toMatchObject({
      app: "newsletter",
      ok: true,
      dormant: true,
      d1: "connected",
      subscribers: { confirmed: 0, total: 0 },
      last_sent_at: null,
      last_error_at: null,
      resend_key: "configured",
      mailing_address: "configured",
      notes: ["Dormant: no confirmed subscriber and no send recorded."],
    });
    // It names what it can't see: the queue, the DLQ and the key's validity.
    expect(body.unobserved).toContain("newsletter-send queue");
    expect(body.unobserved).toContain("dead-letter");
    expect(Object.keys(body).sort()).toEqual([
      "app",
      "d1",
      "dormant",
      "last_error_at",
      "last_sent_at",
      "mailing_address",
      "notes",
      "ok",
      "resend_key",
      "subscribers",
      "ts",
      "unobserved",
    ]);
    // Counts and timestamps only: no address, subject, token or payload, and
    // no call to Resend.
    const reads = db.sql.join("\n");
    for (const column of ["email", "subject", "token", "payload", "html"])
      expect(reads).not.toContain(column);
    expect(db.bound).toEqual([
      [
        "confirm_email_sent",
        "issue_delivery_sent",
        "queue_error",
        "confirm_email_failed",
      ],
    ]);
    expect(network).not.toHaveBeenCalled();
    for (const value of Object.values(secrets))
      expect(JSON.stringify(body)).not.toContain(value);
  });

  it("reports a real subscriber count and the last send", async () => {
    const worker = await freshWorker("health-active");
    captureConsole();
    const body = await health(worker, {
      DB: healthDb({
        total: 7,
        confirmed: 5,
        last_sent_at: "2026-09-20T13:00:02.000Z",
        last_error_at: "2026-09-19T13:00:00.000Z",
      }),
      ...secrets,
    });
    expect(body).toMatchObject({
      ok: true,
      dormant: false,
      subscribers: { confirmed: 5, total: 7 },
      last_sent_at: "2026-09-20T13:00:02.000Z",
      last_error_at: "2026-09-19T13:00:00.000Z",
      notes: [],
    });
  });

  it("is not ok when a send error is newer than the last send", async () => {
    const worker = await freshWorker("health-failing");
    captureConsole();
    for (const last_sent_at of ["2026-09-20T13:00:02.000Z", null]) {
      const body = await health(worker, {
        DB: healthDb({
          total: 1,
          confirmed: 1,
          last_sent_at,
          last_error_at: "2026-09-21T09:15:00.000Z",
        }),
        ...secrets,
      });
      expect(body).toMatchObject({
        ok: false,
        dormant: false,
        notes: ["The last send attempt failed."],
      });
    }
  });

  // www records a confirmation that never reached the queue as
  // confirm_email_failed in the same table: a send that did not happen.
  it("A-32: counts a confirmation that never reached the queue as a failed send", async () => {
    const worker = await freshWorker("health-enqueue");
    captureConsole();
    const db = healthDb({
      total: 1,
      confirmed: 0,
      last_sent_at: null,
      last_error_at: "2026-09-21T09:15:00.000Z",
    });
    const body = await health(worker, { DB: db, ...secrets });
    const events = db.sql.find((query) => query.includes("newsletter_events"))!;
    // last_error_at is the newest of both failure types.
    expect(events).toMatch(
      /MAX\(CASE WHEN type IN \(\?, \?\) THEN created_at END\) AS last_error_at/,
    );
    expect(db.bound[0]!.slice(2)).toEqual([
      "queue_error",
      "confirm_email_failed",
    ]);
    expect(body).toMatchObject({
      ok: false,
      last_error_at: "2026-09-21T09:15:00.000Z",
      notes: expect.arrayContaining(["The last send attempt failed."]),
    });
  });

  it("is not ok when a send secret is missing, and says which", async () => {
    const worker = await freshWorker("health-secrets");
    captureConsole();
    const noKey = await health(worker, {
      DB: healthDb(),
      NEWSLETTER_MAILING_ADDRESS: secrets.NEWSLETTER_MAILING_ADDRESS,
      RESEND_API_KEY: " ",
    });
    expect(noKey).toMatchObject({
      ok: false,
      resend_key: "missing",
      mailing_address: "configured",
      notes: [
        "RESEND_API_KEY isn't set, so sends are recorded as mocked and nothing is delivered.",
        "Dormant: no confirmed subscriber and no send recorded.",
      ],
    });
    const noAddress = await health(worker, {
      DB: healthDb(),
      RESEND_API_KEY: secrets.RESEND_API_KEY,
    });
    expect(noAddress).toMatchObject({
      ok: false,
      resend_key: "configured",
      mailing_address: "missing",
    });
    expect(noAddress.notes).toContain(
      "NEWSLETTER_MAILING_ADDRESS isn't set, so issue deliveries fail.",
    );
  });

  it("reports unreadable or malformed tables as an error, never as zero", async () => {
    const worker = await freshWorker("health-unreadable");
    captureConsole();
    const offline = {
      prepare: () => ({
        bind() {
          return this;
        },
        first: async () => {
          throw new Error("D1 offline with provider detail");
        },
      }),
    };
    for (const DB of [
      offline,
      healthDb({ total: "7" }),
      healthDb({ confirmed: -1 }),
      healthDb({ last_sent_at: "not a time" }),
    ]) {
      const response = await worker.fetch(
        new Request("https://newsletter.test/"),
        { DB, ...secrets },
      );
      const text = await response.text();
      expect(text).not.toContain("provider detail");
      expect(JSON.parse(text)).toMatchObject({
        ok: false,
        dormant: null,
        d1: "error",
        subscribers: null,
        last_sent_at: null,
        notes: ["Couldn't read the newsletter tables."],
      });
    }
  });

  it("answers 405 to anything but GET and HEAD, with no read", async () => {
    const worker = await freshWorker("health-methods");
    captureConsole();
    const db = healthDb();
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await worker.fetch(
        new Request("https://newsletter.test/", { method }),
        { DB: db, ...secrets },
      );
      expect(response.status).toBe(405);
    }
    expect(db.sql).toEqual([]);
  });
});
