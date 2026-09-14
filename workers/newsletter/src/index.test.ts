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
    expect(await response.text()).toBe("newsletter worker ok");
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
    await worker.fetch(new Request("https://newsletter.test/"), { DB: db });

    // Unchanged: a missing Resend key mocks the send and the message is acked.
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(db.statement.run).toHaveBeenCalledTimes(1);
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
