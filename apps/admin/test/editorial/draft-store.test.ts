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
  it("keeps authored history when the previous writer prunes during saves, including after restart", async () => {
    const instance = store();
    const first = await instance.save(request("original retained source"));
    if (!first.ok) throw new Error("initial save failed");
    const legacySaves = async (from: number, through: number) => {
      await runInDurableObject(instance, (_instance, state) => {
        for (let revision = from; revision <= through; revision++) {
          const draft = {
            ...first.draft,
            source: `legacy save ${revision}`,
            revision,
            updatedAt: Date.now(),
          };
          state.storage.transactionSync(() => {
            // Exact write/prune SQL from the writer at ae2d9570. The subsequent
            // save receipt proves ignoring its DELETE does not abort the save.
            state.storage.sql.exec(
              "INSERT OR REPLACE INTO drafts (key, source, baseCommit, baseFileHash, revision, updatedAt, discardedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
              draft.key,
              draft.source,
              draft.baseCommit,
              draft.baseFileHash,
              draft.revision,
              draft.updatedAt,
              draft.discardedAt,
            );
            state.storage.sql.exec(
              "INSERT INTO revisions (key, revision, snapshot) VALUES (?, ?, ?)",
              draft.key,
              draft.revision,
              JSON.stringify(draft),
            );
            state.storage.sql.exec(
              "DELETE FROM revisions WHERE key = ? AND revision <= ?",
              draft.key,
              draft.revision - 100,
            );
            state.storage.sql.exec(
              "INSERT INTO save_requests (id, key, payloadHash, result) VALUES (?, ?, ?, ?)",
              `legacy-${revision}`,
              draft.key,
              `legacy-payload-${revision}`,
              JSON.stringify({ ok: true, draft }),
            );
            state.storage.sql.exec(
              "DELETE FROM save_requests WHERE key = ? AND rowid NOT IN (SELECT rowid FROM save_requests WHERE key = ? ORDER BY rowid DESC LIMIT ?)",
              draft.key,
              draft.key,
              100,
            );
          });
        }
      });
    };
    await legacySaves(2, 105);
    await evictDurableObject(instance);
    await legacySaves(106, 107);
    expect(await instance.get(record)).toMatchObject({
      revision: 107,
      source: "legacy save 107",
    });
    await runInDurableObject(instance, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM revisions")
          .one().count,
      ).toBe(107);
      expect(
        state.storage.sql
          .exec<{ result: string }>(
            "SELECT result FROM save_requests WHERE id = 'legacy-107'",
          )
          .one().result,
      ).toContain('"source":"legacy save 107"');
      // Only technical response snapshots continue to be pruned.
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM save_requests",
          )
          .one().count,
      ).toBe(100);
    });
    const oldest = await instance.historyPage(record, { beforeRevision: 2 });
    expect(oldest.history).toEqual([first.draft]);
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
      { record: { kind: "page", id: "work" } as const },
    ]) {
      expect(await instance.save({ ...losing, ...changed })).toEqual({
        ok: false,
        code: "idempotency_key_reused",
      });
    }
    // baseCommit/baseFileHash are read from the stored draft rather than sent
    // by the caller, and a publication acknowledgment rewrites them in place. An otherwise
    // unchanged retry that carries the advanced base is the same request and
    // replays its original outcome.
    expect(
      await instance.save({ ...losing, baseCommit: "c".repeat(40) }),
    ).toEqual(conflict);
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
    await runInDurableObject(instance, (_instance, state) => {
      // A publication acknowledgment advances only the active draft's Git base.
      state.storage.sql.exec(
        "UPDATE drafts SET baseCommit = ?, baseFileHash = ?",
        "c".repeat(40),
        "d".repeat(40),
      );
    });
    for (let revision = 1; revision <= 100; revision++) {
      await instance.save({
        ...request(`later ${revision}`),
        expectedRevision: revision,
        baseCommit: "c".repeat(40),
        baseFileHash: "d".repeat(40),
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
  it("replays a retry that resends the publication-advanced base", async () => {
    // homeEditorApi derives baseCommit/baseFileHash from the stored draft, not
    // from the caller, so a genuine retry after a publication carries the new
    // base even though the caller's own request is unchanged.
    const instance = store();
    const original = request("acknowledged before publication");
    const saved = await instance.save(original);
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE drafts SET baseCommit = ?, baseFileHash = ?",
        "c".repeat(40),
        "d".repeat(40),
      );
      // Drop the hot receipt so reconciliation runs through the identity table.
      state.storage.sql.exec("DELETE FROM save_requests");
    });
    await evictDurableObject(instance);
    const retry = {
      ...original,
      baseCommit: "c".repeat(40),
      baseFileHash: "d".repeat(40),
    };
    expect(await instance.save(retry)).toEqual(saved);
    // A genuinely different caller request under the same id is still refused.
    expect(await instance.save({ ...retry, source: "different" })).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect((await instance.get(record))?.revision).toBe(1);
  });
  it("replays the hot receipt for a retry that resends the publication-advanced base", async () => {
    // A lost response retried soon after a publication goes live still has its
    // hot receipt. Only the server-derived base moved, so it is the same request.
    const instance = store();
    const original = request("acknowledged before publication");
    const saved = await instance.save(original);
    await runInDurableObject(instance, (_instance, state) => {
      // Server-derived base update, as a publication acknowledgment does.
      state.storage.sql.exec(
        "UPDATE drafts SET baseCommit = ?, baseFileHash = ?",
        "c".repeat(40),
        "d".repeat(40),
      );
      expect(
        state.storage.sql
          .exec("SELECT id FROM save_requests WHERE id = ?", original.requestId)
          .toArray(),
      ).toHaveLength(1);
    });
    await evictDurableObject(instance);
    const retry = {
      ...original,
      baseCommit: "c".repeat(40),
      baseFileHash: "d".repeat(40),
    };
    expect(await instance.save(retry)).toEqual(saved);
    for (const changed of [
      { source: "different" },
      { expectedRevision: 1 },
      { record: { kind: "page", id: "work" } as const },
    ]) {
      expect(await instance.save({ ...retry, ...changed })).toEqual({
        ok: false,
        code: "idempotency_key_reused",
      });
    }
    expect(await instance.rebase(retry)).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect((await instance.get(record))?.revision).toBe(1);
  });
  it("replays a hot conflict receipt for a retry that resends the publication-advanced base", async () => {
    const instance = store();
    await instance.save(request("winning source"));
    const losing = request("losing source before publication");
    const conflict = await instance.save(losing);
    expect(conflict).toMatchObject({ ok: false, code: "revision_conflict" });
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE drafts SET baseCommit = ?, baseFileHash = ?",
        "c".repeat(40),
        "d".repeat(40),
      );
    });
    await evictDurableObject(instance);
    const retry = {
      ...losing,
      baseCommit: "c".repeat(40),
      baseFileHash: "d".repeat(40),
    };
    expect(await instance.save(retry)).toEqual(conflict);
    expect(await instance.save({ ...retry, source: "different" })).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect(await instance.rebase(retry)).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect(await instance.conflict(record, losing.requestId)).toEqual({
      source: losing.source,
      expectedRevision: losing.expectedRevision,
    });
    expect((await instance.get(record))?.revision).toBe(1);
  });
  it("keeps payloadHash-only matching for identities written before clientHash", async () => {
    const instance = store();
    const original = request("legacy identity source");
    const saved = await instance.save(original);
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM save_requests");
      // Simulate a row written by the release before clientHash existed.
      state.storage.sql.exec(
        "UPDATE save_request_identities SET clientHash = NULL",
      );
    });
    await evictDurableObject(instance);
    expect(await instance.save(original)).toEqual(saved);
    expect(await instance.save({ ...original, source: "different" })).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
  });
  it("keeps payloadHash-only matching for hot receipts whose identity predates clientHash", async () => {
    const instance = store();
    const original = request("legacy hot receipt source");
    const saved = await instance.save(original);
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE save_request_identities SET clientHash = NULL",
      );
    });
    await evictDurableObject(instance);
    expect(await instance.save(original)).toEqual(saved);
    expect(
      await instance.save({ ...original, baseCommit: "c".repeat(40) }),
    ).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
  });
  it.each(["new", "already retained"])(
    "replays exact %s conflict metadata after publication advances the active base",
    async (receiptKind) => {
      const instance = store();
      await instance.save(request("winning source"));
      await runInDurableObject(instance, (_instance, state) => {
        // Advance the server-derived base as a publication acknowledgment does,
        // without any provider I/O. The historical revision remains unchanged.
        state.storage.sql.exec(
          "UPDATE drafts SET baseCommit = ?, baseFileHash = ?",
          "c".repeat(40),
          "d".repeat(40),
        );
      });
      const losing = request("original losing bytes\nunfinished: [");
      const conflict = await instance.save(losing);
      expect(conflict).toMatchObject({
        current: {
          revision: 1,
          baseCommit: "c".repeat(40),
          baseFileHash: "d".repeat(40),
        },
      });
      if (receiptKind === "already retained") {
        await runInDurableObject(instance, (_instance, state) => {
          // Model a compact identity written by the earlier R2 implementation.
          state.storage.sql.exec(
            "UPDATE save_request_identities SET legacyResult = NULL WHERE id = ?",
            losing.requestId,
          );
        });
        await evictDurableObject(instance);
      }
      for (let revision = 1; revision <= 101; revision++) {
        const result = await instance.save({
          ...request(`later ${revision}`),
          expectedRevision: revision,
          baseCommit: "c".repeat(40),
          baseFileHash: "d".repeat(40),
        });
        expect(result.ok).toBe(true);
      }
      await runInDurableObject(instance, (_instance, state) => {
        expect(
          state.storage.sql
            .exec("SELECT id FROM save_requests WHERE id = ?", losing.requestId)
            .toArray(),
        ).toEqual([]);
      });
      await evictDurableObject(instance);
      expect(await instance.save(losing)).toEqual(conflict);
      // The advanced base is server-derived, so this is the same request.
      expect(
        await instance.save({ ...losing, baseCommit: "c".repeat(40) }),
      ).toEqual(conflict);
      expect(await instance.conflict(record, losing.requestId)).toEqual({
        source: losing.source,
        expectedRevision: losing.expectedRevision,
      });
      expect((await instance.get(record))?.revision).toBe(102);
    },
  );
  it("requires comparison when an older compact conflict lost its exact receipt", async () => {
    const instance = store();
    await instance.save(request("winning source"));
    const losing = request("retained losing bytes");
    await instance.save(losing);
    await runInDurableObject(instance, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE save_request_identities SET legacyResult = NULL WHERE id = ?",
        losing.requestId,
      );
      state.storage.sql.exec(
        "DELETE FROM save_requests WHERE id = ?",
        losing.requestId,
      );
    });
    await evictDurableObject(instance);
    expect(await instance.save(losing)).toEqual({
      ok: false,
      code: "save_reconciliation_required",
    });
    expect(await instance.save({ ...losing, source: "different" })).toEqual({
      ok: false,
      code: "idempotency_key_reused",
    });
    expect(await instance.conflict(record, losing.requestId)).toEqual({
      source: losing.source,
      expectedRevision: losing.expectedRevision,
    });
    expect((await instance.get(record))?.revision).toBe(1);
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
      state.storage.sql.exec(
        "DROP TRIGGER IF EXISTS editorial_revisions_retained",
      );
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
    expect(await instance.latestDirectPublication(record)).toBeNull();
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
