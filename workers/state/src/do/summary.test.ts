import { describe, expect, it, mock } from "bun:test";

// The workerd base class only stores ctx; each test assigns a fake one.
mock.module("cloudflare:workers", () => ({ DurableObject: class {} }));

const { LinkVault } = await import("./link-vault");
const { CodeStats, RECEIVED_KEY } = await import("./code-stats");

type ListOptions = { prefix?: string; reverse?: boolean; limit?: number };

// Enough of DurableObjectStorage for the two objects' key-value calls.
function fakeCtx() {
  const data = new Map<string, unknown>();
  const storage = {
    async get(key: string) {
      return data.get(key);
    },
    async put(key: string, value: unknown) {
      data.set(key, value);
    },
    async delete(keys: string | string[]) {
      for (const key of [keys].flat()) data.delete(key);
    },
    async list({ prefix = "", reverse = false, limit }: ListOptions = {}) {
      let keys = [...data.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort();
      if (reverse) keys.reverse();
      if (limit !== undefined) keys = keys.slice(0, limit);
      return new Map(keys.map((key) => [key, data.get(key)]));
    },
  };
  return { data, ctx: { storage, getWebSockets: () => [] } };
}

function withCtx<T extends object>(instance: T) {
  const fake = fakeCtx();
  return {
    object: Object.assign(instance, { ctx: fake.ctx }),
    data: fake.data,
  };
}

async function json(
  object: { fetch(request: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
) {
  const response = await object.fetch(
    new Request(`https://internal${path}`, init),
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("A-32 LinkVault /summary", () => {
  it("counts every held link and names the newest parseable savedAt", async () => {
    const { object, data } = withCtx(new LinkVault({} as never, {} as never));

    expect((await json(object, "/summary")).body).toEqual({
      held: 0,
      last_saved_at: null,
    });

    data.set("link:a", {
      id: "a",
      url: "https://a.test",
      savedAt: "2026-05-14T23:04:08.297Z",
    });
    data.set("link:b", {
      id: "b",
      url: "https://b.test",
      savedAt: "not a time",
    });
    data.set("link:c", {
      id: "c",
      url: "https://c.test",
      savedAt: "2026-05-01T00:00:00Z",
    });

    const { status, body } = await json(object, "/summary");
    expect(status).toBe(200);
    expect(body).toEqual({
      held: 3,
      last_saved_at: "2026-05-14T23:04:08.297Z",
    });
    expect(JSON.stringify(body)).not.toContain(".test");
  });
});

describe("A-32 CodeStats receipt and /summary", () => {
  const commit = {
    sha: "synthetic-sha-1",
    repo: "synthetic-repo",
    subject: "synthetic",
    author: "synthetic",
    ts: "2026-09-22T12:00:00Z",
  };

  it("records a receipt for each post with a well-formed commit, new or already held", async () => {
    const { object, data } = withCtx(new CodeStats({} as never, {} as never));
    expect((await json(object, "/summary")).body).toEqual({
      held: 0,
      last_received_at: null,
    });

    const before = Date.now();
    const first = await json(object, "/commits", {
      method: "POST",
      body: JSON.stringify({ commits: [commit] }),
    });
    expect(first.body).toEqual({ accepted: 1 });
    const summary = (await json(object, "/summary")).body;
    expect(summary.held).toBe(1);
    const received = Date.parse(String(summary.last_received_at));
    expect(received).toBeGreaterThanOrEqual(before);

    data.set(RECEIVED_KEY, "2026-01-01T00:00:00.000Z");
    const again = await json(object, "/commits", {
      method: "POST",
      body: JSON.stringify(commit),
    });
    expect(again.body).toEqual({ accepted: 0 });
    expect(Date.parse(String(data.get(RECEIVED_KEY)))).toBeGreaterThanOrEqual(
      before,
    );

    // The marker sits outside the commit window and never lists as a commit.
    const listed = await json(object, "/commits");
    expect(listed.body.commits).toHaveLength(1);
    expect((await json(object, "/summary")).body.held).toBe(1);
  });

  it("records no receipt when a post carries no well-formed commit", async () => {
    const { object, data } = withCtx(new CodeStats({} as never, {} as never));

    for (const payload of [{ commits: [{ sha: "x" }] }, { commits: [] }, {}]) {
      const response = await json(object, "/commits", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(response.body).toEqual({ accepted: 0 });
    }
    expect(data.has(RECEIVED_KEY)).toBe(false);
    expect((await json(object, "/summary")).body).toEqual({
      held: 0,
      last_received_at: null,
    });
  });
});
