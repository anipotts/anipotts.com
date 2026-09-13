/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  EditorialDraftStore,
  SaveDraft,
} from "../../src/editorial/draft-store";

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
  it("retains all authored revisions with stable bounded history pages", async () => {
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
    const first = await instance.historyPage(record);
    expect(first.history.map((draft) => draft.revision)).toEqual(
      Array.from({ length: 100 }, (_, index) => 105 - index),
    );
    expect(first.nextBeforeRevision).toBe(6);
    await instance.save({
      ...input,
      source: "newer concurrent save",
      expectedRevision: 105,
      requestId: crypto.randomUUID(),
    });
    const last = await instance.historyPage(record, { beforeRevision: 6 });
    expect(last.history.map((draft) => draft.revision)).toEqual([
      5, 4, 3, 2, 1,
    ]);
    expect(last.history.at(-1)?.source).toBe("revision 1");
    expect(last.nextBeforeRevision).toBeNull();
    await evictDurableObject(instance);
    expect(await instance.historyPage(record, { beforeRevision: 6 })).toEqual(
      last,
    );
  });
  it("replays the original conflict after hot receipts are pruned and rejects changed payloads", async () => {
    const instance = store();
    await instance.save(request("winning source"));
    const losing = request("losing source: 🪴\nunfinished: [");
    const conflict = await instance.save(losing);
    expect(conflict).toMatchObject({ ok: false, code: "revision_conflict" });
    for (let revision = 1; revision <= 105; revision++) {
      expect(
        (
          await instance.save({
            ...request(`later ${revision}`),
            expectedRevision: revision,
          })
        ).ok,
      ).toBe(true);
    }
    await runInDurableObject(instance, (_instance, state) => {
      expect(
        state.storage.sql
          .exec("SELECT id FROM save_requests WHERE id = ?", losing.requestId)
          .toArray(),
      ).toEqual([]);
      expect(
        state.storage.sql
          .exec(
            "SELECT id FROM save_request_identities WHERE id = ?",
            losing.requestId,
          )
          .toArray(),
      ).toHaveLength(1);
    });
    await evictDurableObject(instance);
    expect(await instance.save(losing)).toEqual(conflict);
    for (const changed of [
      { source: "replacement losing source" },
      { expectedRevision: 106 },
      { baseCommit: "c".repeat(40) },
      { record: { kind: "page", id: "work" } as const },
    ]) {
      expect(await instance.save({ ...losing, ...changed })).toEqual({
        ok: false,
        code: "idempotency_key_reused",
      });
    }
    expect(await instance.rebase(losing)).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect(await instance.conflict(record, losing.requestId)).toEqual({
      source: losing.source,
      expectedRevision: 0,
    });
    expect((await instance.get(record))?.revision).toBe(106);
  });
  it("replays the original accepted revision after hot receipt pruning", async () => {
    const instance = store();
    const original = request("first acknowledged source");
    const saved = await instance.save(original);
    for (let revision = 1; revision <= 100; revision++) {
      await instance.save({
        ...request(`later ${revision}`),
        expectedRevision: revision,
      });
    }
    await evictDurableObject(instance);
    expect(await instance.save(original)).toEqual(saved);
    expect(await instance.save({ ...original, source: "different" })).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect((await instance.get(record))?.revision).toBe(101);
  });
  it("retains a conflict against a missing record without substituting the later draft", async () => {
    const instance = store();
    const losing = { ...request("missing base"), expectedRevision: 1 };
    const conflict = await instance.save(losing);
    for (let revision = 0; revision <= 100; revision++) {
      await instance.save({
        ...request(`later ${revision}`),
        expectedRevision: revision,
      });
    }
    expect(await instance.save(losing)).toEqual(conflict);
    expect(conflict).toMatchObject({ current: null });
  });
  it("preserves legacy conflicts whose receipts were already pruned before upgrade", async () => {
    const instance = store();
    await instance.save(request("winning source"));
    const losing = request("original legacy losing bytes");
    await instance.save(losing);
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM save_requests WHERE id = ?",
        losing.requestId,
      );
      state.storage.sql.exec(
        "DELETE FROM save_request_identities WHERE id = ?",
        losing.requestId,
      );
    });
    await evictDurableObject(instance);
    expect(await instance.save(losing)).toEqual({
      ok: false,
      code: "save_reconciliation_required",
    });
    expect(
      await instance.save({ ...losing, source: "new losing bytes" }),
    ).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect(await instance.conflict(record, losing.requestId)).toEqual({
      source: losing.source,
      expectedRevision: losing.expectedRevision,
    });
    expect((await instance.get(record))?.revision).toBe(1);
  });
  it("migrates existing receipts even when an older release removed their revision", async () => {
    const instance = store();
    const original = request("historical source in surviving receipt");
    const saved = await instance.save(original);
    await runInDurableObject(instance, (_instance, state) => {
      // Synthetic pre-upgrade state: lifecycle writes pruned the revision while
      // the previous release still retained its save receipt.
      state.storage.sql.exec("DELETE FROM save_request_identities");
      state.storage.sql.exec("DELETE FROM revisions WHERE revision = 1");
    });
    await evictDurableObject(instance);
    for (let revision = 1; revision <= 100; revision++) {
      await instance.save({
        ...request(`later ${revision}`),
        expectedRevision: revision,
      });
    }
    await evictDurableObject(instance);
    expect(await instance.save(original)).toEqual(saved);
    expect(
      await instance.save({ ...original, baseFileHash: "c".repeat(40) }),
    ).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
  });
  it("restores a discarded draft after 31 days without changing publication state", async () => {
    const instance = store();
    const input = request("retained private source");
    await instance.save(input);
    await instance.discard(record, 1);
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE drafts SET discardedAt = ?",
        Date.now() - 31 * 24 * 60 * 60 * 1000,
      );
    });
    await evictDurableObject(instance);
    const restored = await instance.restore(record, 2);
    expect(restored).toMatchObject({
      source: input.source,
      revision: 3,
      discardedAt: null,
    });
    expect(await instance.latestPublication(record)).toBeNull();
    await runInDurableObject(instance, async (local) => {
      await expect(
        (local as unknown as EditorialDraftStore).restore(record, 2),
      ).rejects.toThrow("revision_conflict");
    });
  });
  it("bounds history by bytes and rejects invalid pagination options", async () => {
    const instance = store();
    const source = "🪴".repeat(120_000);
    for (let revision = 0; revision < 10; revision++) {
      await instance.save({ ...request(source), expectedRevision: revision });
    }
    const first = await instance.historyPage(record);
    expect(first.history).toHaveLength(8);
    expect(first.nextBeforeRevision).toBe(3);
    const next = await instance.historyPage(record, {
      beforeRevision: 3,
      limit: 1,
    });
    expect(next.history.map((draft) => draft.revision)).toEqual([2]);
    expect(next.nextBeforeRevision).toBe(2);
    for (const options of [
      { limit: 101 },
      { limit: 0 },
      { limit: 1.5 },
      { beforeRevision: 0 },
    ]) {
      await runInDurableObject(instance, async (local) => {
        await expect(
          (local as unknown as EditorialDraftStore).historyPage(
            record,
            options,
          ),
        ).rejects.toThrow("invalid_history_page");
      });
    }
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
