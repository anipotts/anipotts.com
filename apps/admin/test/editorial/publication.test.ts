/// <reference types="@cloudflare/vitest-plugin/types" />
import { createHash } from "node:crypto";
import { env } from "cloudflare:workers";
import {
  runInDurableObject,
  evictDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";

const record = { kind: "writing", id: "test-essay" } as const;
const source =
  "---\ntitle: my title\nsummary: my subtitle\nstatus: published\npublished_at: 2026-09-08\n---\n\nmy essay\n";
const draft = (text = source, revision = 0) => ({
  record,
  source: text,
  expectedRevision: revision,
  requestId: crypto.randomUUID(),
  baseCommit: "a".repeat(40),
  baseFileHash: "b".repeat(40),
});

describe("private publication authorization in real SQLite", () => {
  it("retries only its own blocked receipt with a durable wake and unchanged source", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    await store.save(draft());
    const operationId = crypto.randomUUID();
    const frozen = await store.startPublication({
      record,
      operationId,
      expectedRevision: 1,
    });
    expect(frozen.ok).toBe(true);
    expect(await runDurableObjectAlarm(store)).toBe(true);
    const blocked = await store.publicationStatus(record, operationId);
    expect(blocked?.blocked).toBe("publisher_not_configured");
    if (!blocked) throw new Error("missing job");
    const other = { kind: "writing", id: "other-essay" } as const;
    expect(await store.publicationStatus(other, operationId)).toBeNull();
    expect(
      await store.retryPublication(other, operationId, blocked.version),
    ).toEqual({ ok: false, code: "publication_conflict" });
    await store.save(draft(source.replace("my title", "next title"), 1));
    const results = await Promise.all([
      store.retryPublication(record, operationId, blocked.version),
      store.retryPublication(record, operationId, blocked.version),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    await evictDurableObject(store);
    await runInDurableObject(store, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
    expect((await store.publication(record, operationId))?.source).toBe(source);
    expect((await store.get(record))?.source).toContain("next title");
    const resumed = await store.publicationStatus(record, operationId);
    expect(resumed?.phase).toBe(blocked.phase);
    expect(resumed?.checkpoint).toEqual(blocked.checkpoint);
    expect(resumed?.blocked).toBeNull();
    expect(await runDurableObjectAlarm(store)).toBe(true);
    expect((await store.publicationStatus(record, operationId))?.blocked).toBe(
      "publisher_not_configured",
    );
    expect(
      await store.retryPublication(record, operationId, blocked.version),
    ).toEqual({ ok: false, code: "publication_conflict" });
  });
  it("stops a blocked publication durably without losing a newer draft", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    await store.save(draft());
    const operationId = crypto.randomUUID();
    await store.startPublication({ record, operationId, expectedRevision: 1 });
    await runDurableObjectAlarm(store);
    const blocked = (await store.publicationStatus(record, operationId))!;
    expect(
      await store.cancelPublication(
        { kind: "writing", id: "other" },
        operationId,
        blocked.version,
      ),
    ).toEqual({ ok: false, code: "publication_conflict" });
    await store.save(draft(source.replace("my title", "corrected title"), 1));
    expect(
      await store.cancelPublication(record, operationId, blocked.version),
    ).toEqual({ ok: true });
    await evictDurableObject(store);
    await runDurableObjectAlarm(store);
    expect((await store.publicationStatus(record, operationId))?.phase).toBe(
      "cancelled",
    );
    expect((await store.get(record))?.source).toContain("corrected title");
    expect(
      (
        await store.startPublication({
          record,
          operationId: crypto.randomUUID(),
          expectedRevision: 2,
        })
      ).ok,
    ).toBe(true);
  });
  it("rejects publication when source matches the published Git blob", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    const bytes = Buffer.from(source);
    const baseFileHash = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    await store.save({ ...draft(), baseFileHash });
    expect(
      await store.freezePublication({
        record,
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
      }),
    ).toEqual({ ok: false, code: "no_changes" });
  });
  it("freezes one revision and deduplicates concurrent clicks and lost-response retries", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    expect((await store.save(draft())).ok).toBe(true);
    const first = {
      record,
      expectedRevision: 1,
      operationId: crypto.randomUUID(),
    };
    const second = { ...first, operationId: crypto.randomUUID() };
    const [a, b] = await Promise.all([
      store.freezePublication(first),
      store.freezePublication(second),
    ]);
    expect(a.ok).toBe(true);
    expect(b).toEqual(a);
    expect(await store.freezePublication(first)).toEqual(a);
    expect(await store.freezePublication(second)).toEqual(a);
    expect(
      (await store.save(draft(source.replace("my title", "next title"), 1))).ok,
    ).toBe(true);
    if (!a.ok) throw new Error("missing publication");
    expect((await store.publication(record, a.publication.id))?.source).toBe(
      source,
    );
    expect((await store.get(record))?.source).toContain("next title");
    // Retrying the authorized revision after continued editing is still safe.
    expect(await store.freezePublication(first)).toEqual(a);
    expect(
      await store.freezePublication({ ...first, expectedRevision: 2 }),
    ).toEqual({ ok: false, code: "idempotency_key_reused" });
    const next = await store.freezePublication({
      ...first,
      expectedRevision: 2,
      operationId: crypto.randomUUID(),
    });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.publication.id).not.toBe(a.publication.id);
  });

  it("never authorizes malformed, discarded, or stale source", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    const freeze = (revision: number) =>
      store.freezePublication({
        record,
        expectedRevision: revision,
        operationId: crypto.randomUUID(),
      });
    await store.save(draft("unfinished: ["));
    expect(await freeze(1)).toEqual({ ok: false, code: "invalid_source" });
    await store.save(draft(source, 1));
    expect(await freeze(1)).toEqual({ ok: false, code: "revision_conflict" });
    await store.discard(record, 2);
    expect(await freeze(3)).toEqual({ ok: false, code: "revision_conflict" });
  });

  it("scopes receipts to their record and rejects reused operation IDs", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    await store.save(draft());
    const operationId = crypto.randomUUID();
    const result = await store.freezePublication({
      record,
      operationId,
      expectedRevision: 1,
    });
    expect(result.ok).toBe(true);
    const other = { kind: "writing", id: "other-essay" } as const;
    expect(await store.publication(other, operationId)).toBeNull();
    expect(
      await store.freezePublication({
        record: other,
        operationId,
        expectedRevision: 1,
      }),
    ).toEqual({ ok: false, code: "idempotency_key_reused" });
    expect(
      await store.freezePublication({
        record: { kind: "work", id: "../secret" },
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_request" });
  });
});
