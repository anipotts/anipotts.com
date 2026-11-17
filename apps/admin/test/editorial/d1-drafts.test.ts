/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { D1_DRAFT_SCHEMA } from "../../src/editorial/d1-drafts";
import type { Draft, SaveDraft } from "../../src/editorial/draft-store";
import { inspectEditorialMediaAdmission } from "../../src/editorial/media-store";
const record = { kind: "writing", id: "migration-fixture" } as const;
const input = (source = "unfinished: [", expectedRevision = 0): SaveDraft => ({
  record,
  source,
  expectedRevision,
  baseCommit: "a".repeat(40),
  baseFileHash: null,
  requestId: crypto.randomUUID(),
});
beforeAll(async () => {
  await env.CONTENT_DB.batch(
    D1_DRAFT_SCHEMA.map((sql) => env.CONTENT_DB.prepare(sql)),
  );
});
it("imports exact legacy drafts and immutable history, retaining originals", async () => {
  const instance = env.D1_EDITORIAL.getByName(crypto.randomUUID());
  const draft: Draft = {
    key: "content/public/writing/migration-fixture.md",
    source: '\ufeffa: "雪"\r\n\r\noriginal',
    baseCommit: "a".repeat(40),
    baseFileHash: null,
    revision: 2,
    updatedAt: 100,
    discardedAt: null,
  };
  await runInDurableObject(instance, async (_, state) => {
    state.storage.sql.exec(
      "INSERT INTO direct_published_bases VALUES (?,?,?)",
      draft.key,
      "fixture-publication",
      3,
    );
    state.storage.sql.exec(
      "INSERT INTO drafts VALUES (?,?,?,?,?,?,?)",
      draft.key,
      draft.source,
      draft.baseCommit,
      null,
      2,
      100,
      null,
    );
    for (const revision of [1, 2])
      state.storage.sql.exec(
        "INSERT INTO revisions VALUES (?,?,?)",
        draft.key,
        revision,
        JSON.stringify({ ...draft, revision }),
      );
  });
  expect(await instance.get(record)).toEqual(draft);
  expect((await instance.history(record)).map((d) => d.revision)).toEqual([
    2, 1,
  ]);
  expect((await instance.draftStorageStatus()).backend).toBe("d1");
  await evictDurableObject(instance);
  expect(await instance.get(record)).toEqual(draft);
  await runInDurableObject(instance, async (_, state) => {
    expect(
      state.storage.sql
        .exec<{ n: number }>("SELECT count(*) n FROM revisions")
        .one().n,
    ).toBe(2);
  });
});
it("commits saves and retries once, retains concurrent losing text and paginates history", async () => {
  const instance = env.D1_EDITORIAL.getByName(crypto.randomUUID());
  const first = input();
  const [a, b] = await Promise.all([
    instance.save(first),
    instance.save(first),
  ]);
  expect(a).toEqual(b);
  expect(a.ok).toBe(true);
  const [c, d] = await Promise.all([
    instance.save(input("one", 1)),
    instance.save(input("two", 1)),
  ]);
  expect([c, d].filter((r) => r.ok)).toHaveLength(1);
  const failure = [c, d].find((r) => !r.ok);
  if (!failure || failure.ok || failure.code !== "revision_conflict")
    throw new Error("expected conflict");
  expect(
    (await instance.conflict(record, failure.conflictId))?.source,
  ).not.toEqual(failure.current?.source);
  expect(await instance.save({ ...first, source: "reused" })).toEqual({
    ok: false,
    code: "idempotency_key_reused",
  });
  expect(await instance.save(first)).toEqual(a);
  const page = await instance.historyPage(record, { limit: 1 });
  expect(page.nextBeforeRevision).toBe(2);
  expect(
    (await instance.historyPage(record, { beforeRevision: 2 })).history[0]
      ?.revision,
  ).toBe(1);
  expect((await instance.discard(record, 2)).discardedAt).not.toBeNull();
  expect((await instance.restore(record, 3)).discardedAt).toBeNull();
  expect(await instance.history(record)).toHaveLength(4);
});
it("rejects an inconsistent partial import without changing legacy source", async () => {
  const instance = env.D1_EDITORIAL.getByName(crypto.randomUUID());
  await runInDurableObject(instance, async (_, state) => {
    const draft = {
      key: "content/public/writing/migration-fixture.md",
      source: "keep me",
      baseCommit: "a".repeat(40),
      baseFileHash: null,
      revision: 1,
      updatedAt: 10,
      discardedAt: null,
    };
    state.storage.sql.exec(
      "INSERT INTO drafts VALUES (?,?,?,?,?,?,?)",
      draft.key,
      draft.source,
      draft.baseCommit,
      null,
      1,
      10,
      null,
    );
    await env.CONTENT_DB.prepare(
      "INSERT INTO editorial_drafts VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(
        state.id.toString(),
        draft.key,
        "different",
        draft.baseCommit,
        null,
        1,
        10,
        null,
      )
      .run();
  });
  const refusal = await runInDurableObject(instance, async (object) => {
    try {
      await object.get(record);
      return "unexpected_success";
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(refusal).toContain("draft_import_mismatch");
});
it("stores new immutable uploads in private R2 and reads legacy chunks without deleting them", async () => {
  const instance = env.D1_EDITORIAL.getByName(crypto.randomUUID());
  const bytes = Uint8Array.from(
    Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    ),
  );
  const admission = inspectEditorialMediaAdmission(bytes);
  expect(admission.ok).toBe(true);
  if (!admission.ok) return;
  const saved = await instance.saveMedia(bytes);
  expect(saved.ok).toBe(true);
  expect(
    await env.CONTENT_MEDIA.head(`editorial-private/${admission.media.id}`),
  ).not.toBeNull();
  expect((await instance.readMedia(admission.media.id))?.bytes).toEqual(bytes);
  const broken = bytes.slice();
  broken[broken.length - 1] = 0;
  expect(inspectEditorialMediaAdmission(broken).ok).toBe(false);
  await expect(
    env.CONTENT_DB.prepare("DELETE FROM editorial_draft_history").run(),
  ).rejects.toThrow();
});
