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
