/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { homeEditorApi, homeRecord } from "../../src/lib/editorial-home-api";
const base = async () => ({
  source: "original",
  baseCommit: "a".repeat(40),
  baseFileHash: "b".repeat(40),
});
const csrf = "c".repeat(64);
const request = (action: string, body: unknown, headers = {}) =>
  new Request(`https://admin.anipotts.com/api/editorial/${action}`, {
    method: "POST",
    headers: {
      Origin: "https://admin.anipotts.com",
      "Content-Type": "application/json",
      Cookie: `__Host-editorial-csrf=${csrf}`,
      "X-Editorial-CSRF": csrf,
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe("home API with real SQLite", () => {
  it("serves bounded private history pages independently of Git availability", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    for (let revision = 0; revision < 3; revision++) {
      await storage.save({
        ...(await base()),
        record: homeRecord,
        source: `source ${revision + 1}`,
        expectedRevision: revision,
        requestId: crypto.randomUUID(),
      });
    }
    const snapshot = await homeEditorApi(
      new Request("https://admin.anipotts.com/api/editorial/record"),
      storage,
      base,
    );
    expect(await snapshot.json()).toMatchObject({
      history: [{ revision: 3 }, { revision: 2 }, { revision: 1 }],
      nextBeforeRevision: null,
      // Without a publisher (local development) the editor matches production.
      publicationMode: "direct",
      publishing: "not_configured",
    });
    const read = (query: string) =>
      homeEditorApi(
        new Request(
          `https://admin.anipotts.com/api/editorial/history?${query}`,
        ),
        storage,
        async () => {
          throw new Error("Git unavailable");
        },
      );
    const current = await homeEditorApi(
      new Request("https://admin.anipotts.com/api/editorial/draft"),
      storage,
      async () => {
        throw new Error("Git unavailable");
      },
    );
    expect(current.headers.get("Cache-Control")).toContain("no-store");
    expect(await current.json()).toMatchObject({
      draft: { source: "source 3", revision: 3 },
    });
    const first = await read("limit=2");
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    expect(await first.json()).toMatchObject({
      history: [{ revision: 3 }, { revision: 2 }],
      nextBeforeRevision: 2,
    });
    expect(await (await read("beforeRevision=2&limit=2")).json()).toMatchObject(
      {
        history: [{ revision: 1 }],
        nextBeforeRevision: null,
      },
    );
    for (const query of [
      "limit=101",
      "limit=0",
      "limit=2.5",
      "beforeRevision=-1",
      "beforeRevision=NaN",
      "beforeRevision=9007199254740992",
    ]) {
      const response = await read(query);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_history_page" });
    }
    const differentRecord = await read("kind=page&id=work");
    expect(await differentRecord.json()).toEqual({
      history: [],
      nextBeforeRevision: null,
    });
  });
  it("rebases only an explicitly reviewed upstream version and retains source history", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    await storage.save({
      ...(await base()),
      record: homeRecord,
      source: "retained draft",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    });
    const upstream = {
      source: "upstream edit",
      baseCommit: "d".repeat(40),
      baseFileHash: "e".repeat(40),
    };
    const input = {
      source: "reconciled draft",
      expectedRevision: 1,
      requestId: crypto.randomUUID(),
      reviewedBaseCommit: upstream.baseCommit,
      reviewedBaseFileHash: upstream.baseFileHash,
    };
    const rebase = (body: unknown, headers = {}) =>
      homeEditorApi(
        request("rebase", body, headers),
        storage,
        async () => upstream,
      );
    expect(
      (await rebase(input, { Origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(
      (await rebase({ ...input, reviewedBaseFileHash: "f".repeat(40) })).status,
    ).toBe(409);
    expect((await storage.get(homeRecord))?.revision).toBe(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await rebase(input);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        draft: {
          source: input.source,
          baseCommit: upstream.baseCommit,
          baseFileHash: upstream.baseFileHash,
          revision: 2,
        },
      });
    }
    expect(
      (await rebase({ ...input, requestId: crypto.randomUUID() })).status,
    ).toBe(409);
    expect(
      (await storage.history(homeRecord)).map((draft) => draft.source),
    ).toEqual(["reconciled draft", "retained draft"]);
    const saved = await homeEditorApi(
      request("save", {
        source: "further edit",
        expectedRevision: 2,
        requestId: crypto.randomUUID(),
      }),
      storage,
      base,
    );
    expect(await saved.json()).toMatchObject({
      ok: true,
      draft: {
        revision: 3,
        baseCommit: upstream.baseCommit,
        baseFileHash: upstream.baseFileHash,
      },
    });
  });
  it("requires disclosure and CSRF, freezes a revision once, and isolates status", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const record = { kind: "writing", id: "essay" } as const;
    const source =
      "---\ntitle: my essay\nsummary: summary\nstatus: published\npublished_at: 2026-09-08\n---\nprivate until published\n";
    await storage.save({
      ...(await base()),
      record,
      source,
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    });
    const body = {
      expectedRevision: 1,
      operationId: crypto.randomUUID(),
      discloseSource: true,
    };
    const scoped = (action: string, payload: unknown, headers = {}) => {
      const original = request(action, payload, headers);
      return new Request(`${original.url}?kind=writing&id=essay`, original);
    };
    const publisher = { storage, enabled: true };
    expect(
      (
        await homeEditorApi(
          scoped("publish", body, { Origin: "https://evil.example" }),
          storage,
          base,
          publisher,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await homeEditorApi(
          scoped("publish", { ...body, discloseSource: false }),
          storage,
          base,
          publisher,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await homeEditorApi(scoped("publish", body), storage, base, {
          ...publisher,
          enabled: false,
        })
      ).status,
    ).toBe(503);
    expect(await storage.latestPublication(record)).toBeNull();
    for (let i = 0; i < 2; i++) {
      const response = await homeEditorApi(
        scoped("publish", body),
        storage,
        base,
        publisher,
      );
      expect(response.status).toBe(202);
      const value = await response.json();
      expect(value).toMatchObject({
        publication: { id: body.operationId, phase: "validate" },
      });
      expect(JSON.stringify(value)).not.toContain(source);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect((await storage.publication(record, body.operationId))?.source).toBe(
      source,
    );
    const wrong = await homeEditorApi(
      new Request(
        `https://admin.anipotts.com/api/editorial/publication?kind=work&id=essay&operationId=${body.operationId}`,
      ),
      storage,
      base,
      publisher,
    );
    expect(await wrong.json()).toEqual({ publication: null });
  });
  it("isolates work and writing drafts even when they share an id", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    for (const kind of ["work", "writing"] as const) {
      const original = request("save", {
        source: `private ${kind} edit`,
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      });
      const scoped = new Request(
        `${original.url}?kind=${kind}&id=shared-title`,
        original,
      );
      const response = await homeEditorApi(scoped, storage, async (record) => {
        expect(record).toEqual({ kind, id: "shared-title" });
        return base();
      });
      expect(response.status).toBe(200);
    }
    expect(
      (await storage.get({ kind: "work", id: "shared-title" }))?.source,
    ).toBe("private work edit");
    expect(
      (await storage.get({ kind: "writing", id: "shared-title" }))?.source,
    ).toBe("private writing edit");
    expect(await storage.get(homeRecord)).toBeNull();
  });
  it("rejects path traversal identities before reading source or storage", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const response = await homeEditorApi(
      new Request(
        "https://admin.anipotts.com/api/editorial/record?kind=work&id=..%2Fsecrets",
      ),
      storage,
      async () => {
        throw new Error("must not read");
      },
    );
    expect(response.status).toBe(400);
  });
  it("saves malformed intermediate text, fixes the Git base server-side, and retains a conflicting edit", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const body = {
      source: "unfinished: [",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
      baseCommit: "forged",
      path: "workflows/publish.yml",
    };
    const first = await homeEditorApi(request("save", body), storage, base);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      valid: false,
      draft: { baseCommit: "a".repeat(40), revision: 1 },
    });
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    const conflict = await homeEditorApi(
      request("save", {
        ...body,
        source: "other",
        requestId: crypto.randomUUID(),
      }),
      storage,
      base,
    );
    expect(conflict.status).toBe(409);
    expect((await storage.get(homeRecord))?.source).toBe(body.source);
    expect(await storage.history(homeRecord)).toHaveLength(1);
  });
  it("rejects cross-origin and missing CSRF without creating drafts", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    for (const headers of [
      { Origin: "https://evil.example" },
      { Cookie: "" },
    ]) {
      const response = await homeEditorApi(
        request(
          "save",
          {
            source: "text",
            expectedRevision: 0,
            requestId: crypto.randomUUID(),
          },
          headers,
        ),
        storage,
        base,
      );
      expect(response.status).toBe(403);
    }
    expect(await storage.get(homeRecord)).toBeNull();
  });
  it("discards and recovers without deleting source or revisions", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    await homeEditorApi(
      request("save", {
        source: "private",
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      }),
      storage,
      base,
    );
    expect(
      (
        await homeEditorApi(
          request("discard", { expectedRevision: 1 }),
          storage,
          base,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await homeEditorApi(
          request("restore", { expectedRevision: 1 }),
          storage,
          base,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await homeEditorApi(
          request("restore", { expectedRevision: 2 }),
          storage,
          base,
        )
      ).status,
    ).toBe(200);
    expect(await storage.get(homeRecord)).toMatchObject({
      source: "private",
      revision: 3,
      discardedAt: null,
    });
  });
});

it("returns bounded queue metadata and refreshed publication state after cancellation", async () => {
  const storage = env.EDITORIAL.getByName(crypto.randomUUID());
  const record = { kind: "writing", id: "queue-essay" } as const;
  const source =
    "---\ntitle: private title\nsummary: summary\nstatus: published\npublished_at: 2026-09-08\n---\nprivate body\n";
  await storage.save({
    ...(await base()),
    record,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const operationId = crypto.randomUUID();
  await storage.freezePublication({ record, operationId, expectedRevision: 1 });
  const publisher = { storage, enabled: true };
  const read = (query = "") =>
    homeEditorApi(
      new Request(
        `https://admin.anipotts.com/api/editorial/publication-queue?${query}`,
      ),
      storage,
      async () => {
        throw new Error("Git unavailable");
      },
      publisher,
    );
  const response = await read("limit=1");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const value = await response.json();
  expect(value).toMatchObject({
    items: [{ id: operationId, record }],
    pending: 1,
    nextAfterSequence: null,
  });
  expect(JSON.stringify(value)).not.toContain("private title");
  expect(JSON.stringify(value)).not.toContain("private body");
  for (const query of [
    "limit=51",
    "limit=0",
    "limit=1.5",
    "afterSequence=0",
    "afterSequence=-1",
    "afterSequence=9007199254740992",
  ])
    expect((await read(query)).status).toBe(400);
  const cancel = () => {
    const original = request("cancel-publication", {
      expectedRevision: 1,
      operationId,
      expectedVersion: 0,
    });
    return homeEditorApi(
      new Request(`${original.url}?kind=writing&id=queue-essay`, original),
      storage,
      base,
      publisher,
    );
  };
  const canceled = await cancel();
  expect(canceled.status).toBe(202);
  expect(await canceled.json()).toMatchObject({
    ok: true,
    publication: {
      id: operationId,
      phase: "cancelled",
      canCancel: false,
      queue: { pending: 0, position: null, head: null },
    },
  });
  const stale = await cancel();
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({
    ok: false,
    code: "publication_conflict",
    publication: { id: operationId, phase: "cancelled" },
  });
});

describe("direct publisher API boundary", () => {
  it("fails closed rather than falling through to Git when direct storage is missing", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const result = await homeEditorApi(
      request("publish", {
        expectedRevision: 1,
        operationId: crypto.randomUUID(),
        discloseSource: true,
      }),
      storage,
      base,
      { storage, enabled: true, mode: "direct" },
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "publisher_unavailable" });
    expect(await storage.latestPublication(homeRecord)).toBeNull();
  });
  it("requires versioned review identities before dispatching any direct intent", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    let calls = 0;
    const direct = {
      startDirectPublication: async () => {
        calls++;
        throw new Error("unexpected activation");
      },
      latestDirectPublication: async () => null,
      directPublicationStatus: async () => null,
      retryDirectPublication: async () => ({
        ok: false as const,
        code: "publication_conflict" as const,
      }),
      cancelDirectPublication: async () => ({
        ok: false as const,
        code: "publication_conflict" as const,
      }),
    };
    const result = await homeEditorApi(
      request("publish", {
        expectedRevision: 1,
        operationId: crypto.randomUUID(),
        discloseSource: true,
      }),
      storage,
      base,
      { storage, enabled: true, mode: "direct", direct },
    );
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({
      error: "publication_review_upgrade_required",
    });
    expect(calls).toBe(0);
  });
  it("unpublishes only in direct mode, with the public source from the server's own read", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const record = { kind: "writing", id: "api-unpublish" } as const;
    const publicSource =
      "---\ntitle: Test\nsummary: Example\nstatus: published\npublished_at: 2026-09-20\n---\nBody";
    const received: unknown[] = [];
    const direct = {
      startDirectPublication: async (input: unknown) => {
        received.push(input);
        return { ok: false as const, code: "already_hidden" as const };
      },
      latestDirectPublication: async () => null,
      directPublicationStatus: async () => null,
      retryDirectPublication: async () => ({
        ok: false as const,
        code: "publication_conflict" as const,
      }),
      cancelDirectPublication: async () => ({
        ok: false as const,
        code: "publication_conflict" as const,
      }),
    };
    const body = {
      expectedRevision: 0,
      operationId: crypto.randomUUID(),
      reviewedSourceSha256: "b".repeat(64),
      expectedBaselineSha256: "c".repeat(64),
      expectedPublicationId: "published-receipt",
      // A browser-supplied source is ignored; the route reads its own.
      baselineSource: "---\ntitle: forged\n---\n",
    };
    const call = (mode: "direct" | "maintenance" | "legacy") => {
      const req = request("unpublish", body);
      return homeEditorApi(
        new Request(req.url + "?kind=writing&id=api-unpublish", req),
        storage,
        async () => ({
          ...(await base()),
          source: publicSource,
          publicationId: "published-receipt",
        }),
        { storage, enabled: true, mode, direct },
      );
    };
    for (const mode of ["maintenance", "legacy"] as const) {
      const refused = await call(mode);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({
        error: "unpublish_requires_direct_publishing",
      });
    }
    expect(received).toEqual([]);
    const result = await call("direct");
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: "already_hidden" });
    expect(received).toEqual([
      {
        record,
        operationId: body.operationId,
        expectedRevision: 1,
        reviewedSourceSha256: body.reviewedSourceSha256,
        expectedBaselineSha256: body.expectedBaselineSha256,
        expectedPublicationId: "published-receipt",
        action: "unpublish",
        baselineSource: publicSource,
      },
    ]);
  });
});

it("direct API returns the original publication when another intent already owns the record", async () => {
  const storage = env.DIRECT_EDITORIAL.getByName(crypto.randomUUID());
  const record = { kind: "writing", id: "held-api" } as const;
  const source =
    "---\ntitle: Test\nsummary: Example\nstatus: published\npublished_at: 2026-09-20\n---\nBody";
  await storage.save({
    ...(await base()),
    record,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const { publicationSourceHash } =
    await import("@anipotts/content/editorial/publication-contract");
  const input = {
    record,
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    reviewedSourceSha256: await publicationSourceHash(source),
    expectedBaselineSha256: "a".repeat(64),
    expectedPublicationId: null,
  };
  const original = await storage.startDirectPublication(input);
  expect(original.ok).toBe(true);
  const req = request("publish", {
    ...input,
    operationId: crypto.randomUUID(),
    discloseSource: true,
  });
  const result = await homeEditorApi(
    new Request(req.url + "?kind=writing&id=held-api", req),
    storage,
    base,
    { storage, enabled: true, mode: "direct", direct: storage },
  );
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({
    error: "publication_in_progress",
    publication: { id: input.operationId, revision: 1, mode: "direct" },
  });
});

it("allows exact unstarted legacy cancellation in maintenance while publishing is disabled", async () => {
  const storage = env.EDITORIAL.getByName(crypto.randomUUID());
  const record = { kind: "writing", id: "maintenance-essay" } as const;
  const source =
    "---\ntitle: Private essay\nsummary: Subtitle\nstatus: published\npublished_at: 2026-09-20\n---\nPrivate body.\n";
  await storage.save({
    ...(await base()),
    record,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const operationId = crypto.randomUUID();
  await storage.freezePublication({ record, operationId, expectedRevision: 1 });
  await runInDurableObject(storage, async (instance) => {
    const owner = instance as unknown as { env: Record<string, unknown> };
    owner.env = { ...owner.env, EDITORIAL_PUBLISH_MODE: "maintenance" };
  });
  const publisher = {
    storage,
    direct: storage,
    enabled: false,
    mode: "maintenance" as const,
  };
  const call = (headers = {}) => {
    const original = request(
      "cancel-legacy-publication",
      { expectedRevision: 1, operationId, expectedVersion: 0 },
      headers,
    );
    return homeEditorApi(
      new Request(
        `${original.url}?kind=writing&id=maintenance-essay`,
        original,
      ),
      storage,
      base,
      publisher,
    );
  };
  expect((await call({ "X-Editorial-CSRF": "wrong" })).status).toBe(403);
  expect((await call({ Origin: "https://example.com" })).status).toBe(403);
  const result = await call();
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    ok: true,
    publication: { id: operationId, phase: "cancelled" },
  });
  expect((await call()).status).toBe(409);
  const read = await homeEditorApi(
    new Request(
      `https://admin.anipotts.com/api/editorial/legacy-publication?kind=writing&id=maintenance-essay&operationId=${operationId}`,
    ),
    storage,
    base,
    publisher,
  );
  expect(await read.json()).toMatchObject({
    publication: { id: operationId, phase: "cancelled" },
  });
  expect((await storage.get(record))?.source).toBe(source);
});

describe("private project creation", () => {
  it("creates and replays one private record, rejects collisions and remains unpublished", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const record = { kind: "work", id: "fresh-project" } as const;
    const body = {
      title: "Fresh project",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    };
    const missingBase = async () => ({ ...(await base()), baseFileHash: null });
    const create = (payload = body, readBase = missingBase) =>
      homeEditorApi(
        request("create?kind=work&id=fresh-project", payload),
        storage,
        readBase,
      );
    const response = await create();
    expect(response.status).toBe(201);
    const first = await response.json();
    expect(first).toMatchObject({
      ok: true,
      draft: { revision: 1, baseFileHash: null },
    });
    expect(await (await create()).json()).toEqual(first);
    expect(
      (await create({ ...body, requestId: crypto.randomUUID() })).status,
    ).toBe(409);
    const stored = await storage.get(record);
    expect(stored?.source).toContain("public_state: hidden");
    expect(stored?.source).toContain("homepage_placement: none");
    expect(await storage.listProjectDrafts()).toEqual([stored]);
    expect(await storage.listWritingDrafts()).toEqual([]);
    expect(await storage.history(record)).toHaveLength(1);
    expect(
      (
        await homeEditorApi(
          request("create?kind=work&id=existing-project", body),
          storage,
          base,
        )
      ).status,
    ).toBe(409);
    expect(
      await storage.get({ kind: "work", id: "existing-project" }),
    ).toBeNull();
  });
  it("rejects invalid project identity and creation details before writing", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const missingBase = async () => ({ ...(await base()), baseFileHash: null });
    const body = {
      title: "Fresh project",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    };
    for (const title of ["", " ", "x".repeat(301)]) {
      expect(
        (
          await homeEditorApi(
            request("create?kind=work&id=invalid", { ...body, title }),
            storage,
            missingBase,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await homeEditorApi(
          request("create?kind=work&id=../escape", body),
          storage,
          missingBase,
        )
      ).status,
    ).toBe(400);
    expect(await storage.listProjectDrafts()).toEqual([]);
  });
});
