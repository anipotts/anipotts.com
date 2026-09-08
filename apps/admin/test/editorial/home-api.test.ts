/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
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
