import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  MAC_MINI_INGEST_KEY: "synthetic-mini-41",
  BRANDS_INGEST_KEY: "synthetic-brand-52",
  GITHUB_TOKEN: "synthetic-gh-63",
  CF_API_TOKEN: "synthetic-cf-74",
};

type Worker = {
  fetch(request: Request, env: unknown): Promise<Response>;
  scheduled(event: unknown, env: unknown, ctx: unknown): Promise<void>;
};

// A query suffix loads a fresh module instance, which stands in for a new isolate.
async function freshWorker(isolate: string): Promise<Worker> {
  return (await import(`./index.ts?isolate=${isolate}`)).default as Worker;
}

function fakeDb() {
  const statement = {
    bind: () => statement,
    first: async () => ({ cnt: 3 }),
    run: async () => ({}),
  };
  return { prepare: mock(() => statement), batch: mock(async () => []) };
}

function completeEnv(): Record<string, unknown> {
  return { DB: fakeDb(), CF_ACCOUNT_ID: "synthetic-acct-85", ...secrets };
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

describe("ingest entry wiring", () => {
  it("logs one contract line from the first fetch and keeps responses unchanged", async () => {
    const worker = await freshWorker("fetch-first");
    const logs = captureConsole();
    const env = completeEnv();

    const options = await worker.fetch(
      new Request("https://ingest.test/", { method: "OPTIONS" }),
      env,
    );
    expect(options.status).toBe(204);
    const health = await worker.fetch(new Request("https://ingest.test/"), env);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      app: "ingest",
      ok: true,
      d1: "connected",
      tables_ok: true,
    });
    const unauthorized = await worker.fetch(
      new Request("https://ingest.test/", { method: "POST" }),
      env,
    );
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "runtime_contract",
      worker: "ingest",
      entry: "fetch",
      ok: true,
      missing: [],
    });
    for (const value of Object.values(secrets))
      expect(logs.text()).not.toContain(value);
  });

  it("logs from the first cron and still runs the jobs when names are missing", async () => {
    const worker = await freshWorker("scheduled-first");
    const logs = captureConsole();
    const probes = mock(async () => {
      throw new Error("offline");
    });
    globalThis.fetch = probes as unknown as typeof fetch;
    const env = completeEnv();
    delete env.MAC_MINI_INGEST_KEY;
    delete env.GITHUB_TOKEN;
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };

    // Minute 1 in every timezone offset runs health probes only.
    const event = { scheduledTime: Date.UTC(2026, 8, 14, 12, 1) };
    await worker.scheduled(event, env, ctx);
    await Promise.all(pending);

    expect(probes).toHaveBeenCalledTimes(4);
    expect((env.DB as ReturnType<typeof fakeDb>).batch).toHaveBeenCalledTimes(
      1,
    );

    // Unchanged: the fetch handler answers exactly as before without the key.
    const health = await worker.fetch(new Request("https://ingest.test/"), env);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      app: "ingest",
      ok: true,
      d1: "connected",
      tables_ok: true,
    });
    const unauthorized = await worker.fetch(
      new Request("https://ingest.test/", { method: "POST" }),
      env,
    );
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });
    const invalid = await worker.fetch(
      new Request("https://ingest.test/", {
        method: "POST",
        headers: { "X-Ingest-Key": secrets.BRANDS_INGEST_KEY },
        body: JSON.stringify({ category: "unknown" }),
      }),
      env,
    );
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: string }).error).toStartWith(
      "Invalid category.",
    );

    const lines = logs.contractLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      worker: "ingest",
      entry: "scheduled",
      ok: false,
      missing: ["MAC_MINI_INGEST_KEY"],
      features: {
        github_stats: { state: "unavailable", missing: ["GITHUB_TOKEN"] },
      },
    });
    for (const value of Object.values(secrets))
      expect(logs.text()).not.toContain(value);
  });
});

describe("github stats", () => {
  it("reads the renamed agents repo and stores its rows under agents", async () => {
    const worker = await freshWorker("github-stats");
    captureConsole();
    const urls: string[] = [];
    globalThis.fetch = mock(async (input: unknown) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response(
        JSON.stringify({
          stargazers_count: 7,
          open_issues_count: 2,
          total_count: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const bound: unknown[][] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        bound.push(values);
        return statement;
      },
      first: async () => null,
      run: async () => ({}),
    };
    const db = {
      prepare: mock(() => statement),
      batch: mock(async () => []),
    };
    const env = { ...completeEnv(), DB: db };
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };

    // Minute 5 runs the GitHub and deployment jobs alongside health probes.
    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 8, 16, 12, 5) },
      env,
      ctx,
    );
    await Promise.all(pending);

    expect(urls).toContain("https://api.github.com/repos/anipotts/agents");
    expect(urls.some((url) => url.includes("claude-code-tips"))).toBe(false);
    const ids = bound.map((values) => String(values[0]));
    for (const metric of ["stars", "issues", "prs"]) {
      const pattern = new RegExp(
        `^github-agents-${metric}-\\d{4}-\\d{2}-\\d{2}T\\d{2}$`,
      );
      expect(ids.some((id) => pattern.test(id))).toBe(true);
    }
    expect(ids.some((id) => id.includes("claude-code-tips"))).toBe(false);
  });
});
