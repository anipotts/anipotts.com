/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { evictDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { SaveDraft } from "../../src/editorial/draft-store";

const record = { kind: "page", id: "home" } as const;
function request(source = "unfinished: ["): SaveDraft {
  return {
    record,
    source,
    expectedRevision: 0,
    baseCommit: "a".repeat(40),
    baseFileHash: "b".repeat(40),
    requestId: crypto.randomUUID(),
  };
}
function store() {
  return env.EDITORIAL.getByName(crypto.randomUUID());
}

describe("private SQLite drafts", () => {
  it("persists invalid intermediate source through a fresh stub", async () => {
    const name = crypto.randomUUID();
    const first = env.EDITORIAL.getByName(name);
    const saved = await first.save(request());
    expect(saved.ok).toBe(true);
    await evictDurableObject(first);
    const reopened = env.EDITORIAL.getByName(name);
    expect((await reopened.get(record))?.source).toBe("unfinished: [");
    expect(await reopened.history(record)).toHaveLength(1);
  });
  it("reconciles repeated saves to one revision", async () => {
    const instance = store();
    const input = request();
    const [a, b] = await Promise.all([
      instance.save(input),
      instance.save(input),
    ]);
    expect(a).toEqual(b);
    expect((await instance.get(record))?.revision).toBe(1);
    expect(await instance.history(record)).toHaveLength(1);
  });
  it("rejects reuse of an idempotency key for different bytes", async () => {
    const instance = store();
    const input = request();
    await instance.save(input);
    expect(await instance.save({ ...input, source: "different" })).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
  });
  it("retains the losing source when two devices save the same base", async () => {
    const instance = store();
    const results = await Promise.all([
      instance.save(request("device one")),
      instance.save(request("device two")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const conflict = results.find((r) => !r.ok)!;
    if (conflict.ok || conflict.code !== "revision_conflict")
      throw new Error("expected conflict");
    const retained = await instance.conflict(record, conflict.conflictId);
    expect(retained?.source).not.toBe(conflict.current?.source);
    expect([retained?.source, conflict.current?.source].sort()).toEqual([
      "device one",
      "device two",
    ]);
  });
  it("cannot silently change the Git base during autosave", async () => {
    const instance = store();
    const input = request();
    await instance.save(input);
    expect(
      await instance.save({
        ...input,
        requestId: crypto.randomUUID(),
        expectedRevision: 1,
        baseCommit: "c".repeat(40),
      }),
    ).toEqual({ ok: false, code: "draft_base_changed" });
    expect((await instance.get(record))?.revision).toBe(1);
  });
  it("discard is recoverable and stale saves cannot reactivate it", async () => {
    const instance = store();
    const input = request();
    await instance.save(input);
    const discarded = await instance.discard(record, 1);
    expect(discarded.discardedAt).not.toBeNull();
    const stale = await instance.save({
      ...input,
      requestId: crypto.randomUUID(),
      expectedRevision: 1,
    });
    expect(stale.ok).toBe(false);
    const restored = await instance.restore(record, 2);
    expect(restored.source).toBe(input.source);
    expect(restored.discardedAt).toBeNull();
    expect(restored.revision).toBe(3);
  });
  it("bounds revision history without expiring the active draft", async () => {
    const instance = store();
    const input = request();
    for (let revision = 0; revision < 105; revision++) {
      await instance.save({
        ...input,
        source: `revision ${revision + 1}`,
        expectedRevision: revision,
        requestId: crypto.randomUUID(),
      });
    }
    expect(await instance.history(record)).toHaveLength(100);
    expect((await instance.get(record))?.source).toBe("revision 105");
  });
  it("rejects paths outside the server record map", async () => {
    const instance = store();
    expect(
      await instance.save({
        ...request(),
        record: { kind: "writing", id: "../secret" },
      }),
    ).toEqual({ ok: false, code: "invalid_draft_request" });
  });
});
