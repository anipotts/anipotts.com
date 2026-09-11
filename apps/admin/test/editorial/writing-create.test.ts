/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { homeEditorApi } from "../../src/lib/editorial-home-api";
import { newWritingSource } from "../../src/lib/writing-draft";

const csrf = "c".repeat(64);
const record = { kind: "writing", id: "new-article" } as const;
const base = async () => ({
  source: newWritingSource(),
  baseCommit: "a".repeat(40),
  baseFileHash: null,
});
const request = (body: unknown, origin = "https://admin.anipotts.com") =>
  new Request(
    `https://admin.anipotts.com/api/editorial/create?kind=writing&id=${record.id}`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: `__Host-editorial-csrf=${csrf}`,
        "X-Editorial-CSRF": csrf,
      },
      body: JSON.stringify(body),
    },
  );

describe("create writing with durable storage", () => {
  it("creates one private revision on repeated requests and never overwrites a colliding draft", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const input = {
      title: 'An article: "quoted"',
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await homeEditorApi(request(input), storage, base);
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        ok: true,
        draft: {
          revision: 1,
          baseFileHash: null,
          source: newWritingSource(input.title),
        },
      });
    }
    expect(await storage.latestPublication(record)).toBeNull();
    expect((await storage.history(record)).length).toBe(1);
    const collision = await homeEditorApi(
      request({ ...input, title: "Overwrite", requestId: crypto.randomUUID() }),
      storage,
      base,
    );
    expect(collision.status).toBe(409);
    expect((await storage.get(record))?.source).toBe(
      newWritingSource(input.title),
    );
    expect(
      (await storage.listWritingDrafts()).map((draft) => draft.key),
    ).toEqual(["content/public/writing/new-article.md"]);
  });

  it("rejects unauthorized requests and existing published paths without creating a draft", async () => {
    const storage = env.EDITORIAL.getByName(crypto.randomUUID());
    const input = {
      title: "Private",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    };
    expect(
      (
        await homeEditorApi(
          request(input, "https://other.example"),
          storage,
          base,
        )
      ).status,
    ).toBe(403);
    const existing = async () => ({
      ...(await base()),
      baseFileHash: "b".repeat(40),
    });
    expect(
      (await homeEditorApi(request(input), storage, existing)).status,
    ).toBe(409);
    expect(await storage.get(record)).toBeNull();
    expect(await storage.listWritingDrafts()).toEqual([]);
  });
});
