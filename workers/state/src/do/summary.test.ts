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

/** Counts storage.list calls, so a summary can be held to key reads. */
function countLists(data: { ctx: { storage: { list: unknown } } }["ctx"]) {
  let lists = 0;
  const list = data.storage.list as (...args: unknown[]) => unknown;
  data.storage.list = (...args: unknown[]) => {
    lists += 1;
    return list(...args);
  };
  return () => lists;
}

describe("A-32 LinkVault /summary", () => {
  it("counts links held before the counts were kept, once, and names the newest parseable savedAt", async () => {
    const { object, data } = withCtx(new LinkVault({} as never, {} as never));

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

    const lists = countLists((object as unknown as { ctx: never }).ctx);
    const { status, body } = await json(object, "/summary");
    expect(status).toBe(200);
    expect(body).toEqual({
      held: 3,
      last_saved_at: "2026-05-14T23:04:08.297Z",
    });
    expect(JSON.stringify(body)).not.toContain(".test");
    // Counted once; after that a summary reads two keys, never the vault.
    expect(lists()).toBe(1);
    await json(object, "/summary");
    await json(object, "/summary");
    expect(lists()).toBe(1);
  });

  // GET /health is public and uncached: each call must stay two key reads.
  it("keeps its count and newest time on every write, so /health never lists the vault", async () => {
    const { object } = withCtx(new LinkVault({} as never, {} as never));
    const lists = countLists((object as unknown as { ctx: never }).ctx);
    expect((await json(object, "/summary")).body).toEqual({
      held: 0,
      last_saved_at: null,
    });
    const add = (id: string, savedAt: string) =>
      json(object, "/links", {
        method: "POST",
        body: JSON.stringify({ id, url: `https://${id}.test`, savedAt }),
      });
    await add("a", "2026-05-01T00:00:00.000Z");
    await add("b", "2026-05-14T23:04:08.297Z");
    await add("c", "not a time");
    // Saving the same link again holds it once.
    await add("a", "2026-05-01T00:00:00.000Z");
    const listed = lists();
    expect((await json(object, "/summary")).body).toEqual({
      held: 3,
      last_saved_at: "2026-05-14T23:04:08.297Z",
    });
    expect(lists()).toBe(listed);
    // Removing the newest recomputes it from the listing the delete makes.
    await json(object, "/links/b", { method: "DELETE" });
    expect((await json(object, "/summary")).body).toEqual({
      held: 2,
      last_saved_at: "2026-05-01T00:00:00.000Z",
    });
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

  it("keeps its count on every write, so /health never lists the window", async () => {
    const { object, data } = withCtx(new CodeStats({} as never, {} as never));
    // Held before the count was kept: counted once.
    data.set("commit:2026-09-01T00:00:00Z:old", { ...commit, sha: "old" });
    const lists = countLists((object as unknown as { ctx: never }).ctx);
    expect((await json(object, "/summary")).body.held).toBe(1);
    expect(lists()).toBe(1);
    await json(object, "/summary");
    expect(lists()).toBe(1);
    await json(object, "/commits", {
      method: "POST",
      body: JSON.stringify({ commits: [commit, { ...commit, sha: "two" }] }),
    });
    const listed = lists();
    expect((await json(object, "/summary")).body.held).toBe(3);
    expect(lists()).toBe(listed);
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
