/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
const record = { kind: "writing", id: "capture-test" } as const;
const source =
  "---\ntitle: my title\nsummary: subtitle\nstatus: published\npublished_at: 2026-09-08\n---\n\nbody";
it("captures an exact private revision without creating publication jobs, alarms or changing history", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  await store.save({
    record,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  });
  const captured = await store.captureDirectDraft({
    record,
    expectedRevision: 1,
  });
  expect(captured).toMatchObject({ ok: true, draft: { source, revision: 1 } });
  expect(await store.latestPublication(record)).toBeNull();
  expect(await store.history(record)).toHaveLength(1);
  await runInDurableObject(store, async (_instance, state) => {
    expect(await state.storage.getAlarm()).toBeNull();
    expect(
      state.storage.sql.exec("SELECT * FROM publication_jobs").toArray(),
    ).toEqual([]);
  });
  await store.save({
    record,
    source: source + " later",
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  });
  expect(captured).toMatchObject({ ok: true, draft: { source, revision: 1 } });
  expect(
    await store.captureDirectDraft({ record, expectedRevision: 1 }),
  ).toEqual({ ok: false, code: "revision_conflict" });
  await store.discard(record, 2);
  expect(
    await store.captureDirectDraft({ record, expectedRevision: 3 }),
  ).toEqual({ ok: false, code: "revision_conflict" });
});
it("rejects intermediate invalid draft source without side effects", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  await store.save({
    record,
    source: "unfinished",
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  });
  expect(
    await store.captureDirectDraft({ record, expectedRevision: 1 }),
  ).toEqual({ ok: false, code: "invalid_source" });
  expect(await store.latestPublication(record)).toBeNull();
});
