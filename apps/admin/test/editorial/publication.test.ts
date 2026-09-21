/// <reference types="@cloudflare/vitest-plugin/types" />
import { createHash } from "node:crypto";
import { env } from "cloudflare:workers";
import {
  runInDurableObject,
  evictDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { PublicationJobs } from "../../src/editorial/publication-jobs";
import type { EditorialDraftStore } from "../../src/editorial/draft-store";

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

describe("owner publication queue metadata", () => {
  it("identifies the blocked head and safely stops untouched waiting work without losing its receipt", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    await store.save(draft());
    const first = crypto.randomUUID();
    await store.freezePublication({
      record,
      operationId: first,
      expectedRevision: 1,
    });
    const waitingRecord = { kind: "writing", id: "waiting-essay" } as const;
    await store.save({ ...draft(), record: waitingRecord });
    const waitingId = crypto.randomUUID();
    await store.freezePublication({
      record: waitingRecord,
      operationId: waitingId,
      expectedRevision: 1,
    });
    const alarmAt = Date.now() + 60_000;
    await runInDurableObject(store, async (_instance, state) => {
      const jobs = new PublicationJobs(state.storage);
      const claim = jobs.claim(Date.now())!;
      jobs.settle(claim, { blocked: "unreleased_public_changes" }, Date.now());
      await state.storage.setAlarm(alarmAt);
    });
    const head = await store.publicationStatus(record, first);
    const waiting = await store.latestPublication(waitingRecord);
    expect(waiting).toMatchObject({
      id: waitingId,
      phase: "validate",
      attempts: 0,
      canCancel: true,
      queue: {
        position: 2,
        pending: 2,
        alarmAt,
        head: {
          id: first,
          record,
          revision: 1,
          blocked: "unreleased_public_changes",
        },
      },
    });
    const frozen = await store.publication(waitingRecord, waitingId);
    await store.save({
      ...draft(source.replace("my title", "newer draft"), 1),
      record: waitingRecord,
    });
    expect(await store.cancelPublication(waitingRecord, waitingId, 99)).toEqual(
      { ok: false, code: "publication_conflict" },
    );
    expect(await store.cancelPublication(record, waitingId, 0)).toEqual({
      ok: false,
      code: "publication_conflict",
    });
    expect(await store.cancelPublication(waitingRecord, waitingId, 0)).toEqual({
      ok: true,
    });
    // GET reconciliation after a lost response and eviction is authoritative.
    await evictDurableObject(store);
    expect(
      await store.publicationStatus(waitingRecord, waitingId),
    ).toMatchObject({
      phase: "cancelled",
      attempts: 0,
      version: 1,
      canCancel: false,
      queue: { position: null, pending: 1, head: { id: first } },
    });
    expect(await store.publication(waitingRecord, waitingId)).toEqual(frozen);
    const unchanged = await store.publicationStatus(record, first);
    expect(unchanged?.version).toBe(head?.version);
    expect(unchanged?.blocked).toBe(head?.blocked);
    expect((await store.get(waitingRecord))?.source).toContain("newer draft");
    // Replaying the original Publish cannot reactivate a cancelled operation.
    expect(
      await store.freezePublication({
        record: waitingRecord,
        operationId: waitingId,
        expectedRevision: 1,
      }),
    ).toEqual({ ok: true, publication: frozen });
    expect(
      (await store.publicationStatus(waitingRecord, waitingId))?.phase,
    ).toBe("cancelled");
  });

  it("paginates every unfinished job, including an orphan, without returning snapshots or checkpoint data", async () => {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    const ids: string[] = [];
    for (let index = 0; index < 53; index++) {
      const itemRecord = { kind: "writing", id: `essay-${index}` } as const;
      await store.save({ ...draft(), record: itemRecord });
      const operationId = crypto.randomUUID();
      ids.push(operationId);
      await store.freezePublication({
        record: itemRecord,
        operationId,
        expectedRevision: 1,
      });
    }
    await runInDurableObject(store, (_instance, state) => {
      const jobs = new PublicationJobs(state.storage);
      jobs.enqueue("orphan", Date.now());
      state.storage.sql.exec(
        "UPDATE publication_jobs SET checkpoint = ?, lease = ? WHERE id = ?",
        JSON.stringify({
          baseHead: "a".repeat(40),
          prNodeId: "private-provider-reference",
        }),
        "private-lease-token",
        ids[0],
      );
    });
    const first = await store.publicationQueue({ limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.pending).toBe(54);
    expect(first.head?.id).toBe(ids[0]);
    expect(first.nextAfterSequence).toBe(first.items.at(-1)?.sequence);
    expect(first.alarmAt).toBeNull();
    const second = await store.publicationQueue({
      afterSequence: first.nextAfterSequence!,
      limit: 50,
    });
    expect(second.items).toHaveLength(4);
    expect(second.items.at(-1)).toMatchObject({
      id: "orphan",
      record: null,
      revision: null,
      createdAt: null,
    });
    expect(second.head?.id).toBe(ids[0]);
    expect(second.nextAfterSequence).toBeNull();
    expect([...first.items, ...second.items].map((entry) => entry.id)).toEqual([
      ...ids,
      "orphan",
    ]);
    const serialized = JSON.stringify([first, second]);
    for (const forbidden of [
      "my title",
      "my essay",
      "source",
      "snapshot",
      "checkpoint",
      "private-provider-reference",
      "private-lease-token",
      "baseCommit",
      "baseFileHash",
    ])
      expect(serialized).not.toContain(forbidden);
    await runInDurableObject(store, async (instance) => {
      for (const options of [
        { limit: 51 },
        { limit: 0 },
        { limit: 1.5 },
        { afterSequence: -1 },
        { afterSequence: Number.MAX_SAFE_INTEGER + 1 },
      ])
        await expect(
          (instance as unknown as EditorialDraftStore).publicationQueue(
            options,
          ),
        ).rejects.toThrow("invalid_publication_page");
    });
  });
});

it("reapproves identical content at a new private revision while old canceled requests stay canceled", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  await store.save(draft());
  const previous = {
    record,
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
  };
  const frozen = await store.freezePublication(previous);
  expect(
    await store.cancelPublication(record, previous.operationId, 0),
  ).toEqual({ ok: true });
  expect(
    await store.publicationStatus(record, previous.operationId),
  ).toMatchObject({ revision: 1, phase: "cancelled" });
  // Explicit editor checkpoint stores identical bytes under its normal save identity.
  const checkpoint = draft(source, 1);
  const nextRevision = await store.save(checkpoint);
  expect(nextRevision).toMatchObject({
    ok: true,
    draft: { source, revision: 2 },
  });
  expect(await store.save(checkpoint)).toEqual(nextRevision);
  const next = {
    record,
    operationId: crypto.randomUUID(),
    expectedRevision: 2,
  };
  const replacement = await store.freezePublication(next);
  expect(replacement).toMatchObject({
    ok: true,
    publication: { id: next.operationId, revision: 2, source },
  });
  expect(await store.freezePublication(previous)).toEqual(frozen);
  expect(
    await store.publicationStatus(record, previous.operationId),
  ).toMatchObject({ revision: 1, phase: "cancelled" });
  expect(await store.latestPublication(record)).toMatchObject({
    id: next.operationId,
    revision: 2,
    phase: "validate",
    queue: { pending: 1, position: 1 },
  });
  expect(await store.freezePublication(next)).toEqual(replacement);
});

describe("maintenance legacy retirement", () => {
  async function frozen() {
    const store = env.EDITORIAL.getByName(crypto.randomUUID());
    await store.save(draft());
    const id = crypto.randomUUID();
    await store.freezePublication({
      record,
      operationId: id,
      expectedRevision: 1,
    });
    return { store, id };
  }
  async function maintenance(
    store: ReturnType<typeof env.EDITORIAL.getByName>,
  ) {
    await runInDurableObject(store, async (instance) => {
      const owner = instance as unknown as { env: Record<string, unknown> };
      owner.env = { ...owner.env, EDITORIAL_PUBLISH_MODE: "maintenance" };
    });
  }
  it("cancels only the exact unstarted receipt without changing newer drafts or history", async () => {
    const { store, id } = await frozen();
    expect(
      await store.cancelUnstartedLegacyPublication(record, id, 1, 0),
    ).toMatchObject({ ok: false, code: "maintenance_required" });
    await maintenance(store);
    await store.save(draft(source + "New private paragraph.", 1));
    const history = await store.history(record);
    expect(
      await store.cancelUnstartedLegacyPublication(
        { ...record, id: "wrong-record" },
        id,
        1,
        0,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await store.cancelUnstartedLegacyPublication(record, id, 2, 0),
    ).toMatchObject({ ok: false });
    expect(
      await store.cancelUnstartedLegacyPublication(record, id, 1, 9),
    ).toMatchObject({ ok: false });
    const results = await Promise.all([
      store.cancelUnstartedLegacyPublication(record, id, 1, 0),
      store.cancelUnstartedLegacyPublication(record, id, 1, 0),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await store.publicationStatus(record, id)).toMatchObject({
      phase: "cancelled",
      version: 1,
      attempts: 0,
    });
    expect((await store.publication(record, id))?.source).toBe(source);
    expect((await store.get(record))?.source).toContain(
      "New private paragraph.",
    );
    expect(await store.history(record)).toEqual(history);
  });
  it("retires an attempted, blocked validate job at the queue head and frees the queue", async () => {
    const { store, id } = await frozen();
    const laterId = crypto.randomUUID();
    const later = { kind: "writing", id: "later-essay" } as const;
    await store.save({ ...draft(), record: later });
    await store.freezePublication({
      record: later,
      operationId: laterId,
      expectedRevision: 1,
    });
    await maintenance(store);
    // The production chainedchat shape: two past claims, one owner retry,
    // settled back to validate with a readiness blocker and no checkpoint.
    await runInDurableObject(store, async (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE publication_jobs SET attempts = 2, version = 5, blocked = 'unreleased_public_changes' WHERE id = ?",
        id,
      );
    });
    await store.save(draft(source + "Newer private paragraph.", 1));
    const history = await store.history(record);
    expect((await store.publicationQueue()).head?.blocked).toBe(
      "unreleased_public_changes",
    );
    expect(
      await store.cancelUnstartedLegacyPublication(record, id, 1, 4),
    ).toEqual({ ok: false, code: "publication_conflict" });
    expect(
      await store.cancelUnstartedLegacyPublication(record, id, 2, 5),
    ).toEqual({ ok: false, code: "publication_conflict" });
    const results = await Promise.all([
      store.cancelUnstartedLegacyPublication(record, id, 1, 5),
      store.cancelUnstartedLegacyPublication(record, id, 1, 5),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await store.publicationStatus(record, id)).toMatchObject({
      phase: "cancelled",
      version: 6,
      attempts: 2,
      lease: null,
      leaseUntil: 0,
      blocked: null,
      checkpoint: { cancelRequested: "true" },
    });
    expect((await store.publication(record, id))?.source).toBe(source);
    expect((await store.get(record))?.source).toContain(
      "Newer private paragraph.",
    );
    expect(await store.history(record)).toEqual(history);
    const queue = await store.publicationQueue();
    expect(queue.pending).toBe(1);
    expect(queue.head?.id).toBe(laterId);
    // The later job is itself unstarted and retires under the same rules.
    expect(
      await store.cancelUnstartedLegacyPublication(later, laterId, 1, 0),
    ).toEqual({ ok: true });
    expect((await store.publicationQueue()).pending).toBe(0);
  });
  it("refuses leased, checkpointed or advanced jobs without changing them", async () => {
    for (const change of [
      "lease = 'active'",
      "lease = 'active', leaseUntil = 9999999999999, attempts = 1",
      "leaseUntil = 1",
      "leaseUntil = 1, attempts = 3, blocked = 'unreleased_public_changes'",
      'checkpoint = \'{"commit":"abc"}\'',
      "checkpoint = '{\"baseHead\":\"abc\"}', blocked = 'stale_renderer'",
      "phase = 'commit'",
      "phase = 'commit', attempts = 1, blocked = 'unreleased_public_changes'",
      "phase = 'branch'",
    ]) {
      const { store, id } = await frozen();
      await maintenance(store);
      await runInDurableObject(store, async (_instance, state) => {
        state.storage.sql.exec(
          `UPDATE publication_jobs SET ${change} WHERE id = ?`,
          id,
        );
      });
      const before = await store.publicationStatus(record, id);
      expect(
        await store.cancelUnstartedLegacyPublication(record, id, 1, 0),
      ).toEqual({
        ok: false,
        code: "legacy_publication_requires_reconciliation",
      });
      expect(await store.publicationStatus(record, id)).toEqual(before);
    }
  });
});
