/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
const record = { kind: "writing", id: "handoff-test" } as const;
const source =
  "---\ntitle: title\nsummary: subtitle\nstatus: published\npublished_at: 2026-09-08\n---\n\nbase";
const base = {
  source,
  baseCommit: "a".repeat(40),
  baseFileHash: null,
  directPublication: { publicationId: "baseline" },
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
it("imports into private SQLite and replays original receipt after later edits without overwriting", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  const input = {
    record,
    source: source + " new",
    operationId: crypto.randomUUID(),
    baseSha256: hash(source),
    base,
  };
  const first = await store.importHandoff(input);
  expect(first).toMatchObject({
    ok: true,
    draft: { revision: 1, source: input.source },
    expectedPublicationId: "baseline",
  });
  await store.save({
    record,
    source: source + " later",
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
    baseCommit: base.baseCommit,
    baseFileHash: null,
  });
  expect(
    await store.importHandoff({
      ...input,
      base: {
        ...base,
        source: "changed",
        directPublication: { publicationId: "later" },
      },
    }),
  ).toEqual(first);
  expect((await store.get(record))?.source).toBe(source + " later");
  expect(await store.latestPublication(record)).toBeNull();
  expect(
    await store.importHandoff({ ...input, source: source + " different" }),
  ).toEqual({ ok: false, code: "idempotency_conflict" });
});
it("never overwrites a dirty production draft or imports over a changed base", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  await store.save({
    record,
    source: source + " dirty",
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    baseCommit: base.baseCommit,
    baseFileHash: null,
  });
  const input = {
    record,
    source: source + " local",
    operationId: crypto.randomUUID(),
    baseSha256: hash(source),
    base,
  };
  expect(await store.importHandoff(input)).toEqual({
    ok: false,
    code: "draft_conflict",
  });
  expect(
    await store.importHandoff({ ...input, baseSha256: hash("wrong") }),
  ).toEqual({ ok: false, code: "base_conflict" });
  expect(await store.history(record)).toHaveLength(1);
});
it("advances local published base only from retained acknowledged source and refuses older receipts", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  const save = (text: string, revision: number) =>
    store.save({
      record,
      source: text,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
      baseCommit: base.baseCommit,
      baseFileHash: null,
    });
  await save(source, 0);
  const first = {
    record,
    source,
    sourceSha256: hash(source),
    localRevision: 1,
    publicationId: crypto.randomUUID(),
  };
  expect(await store.acknowledgeLocalPublication(first)).toEqual({ ok: true });
  await save(source + " newer", 1);
  expect(
    await store.acknowledgeLocalPublication({
      ...first,
      source: source + " newer",
      sourceSha256: hash(source + " newer"),
      localRevision: 2,
      publicationId: crypto.randomUUID(),
    }),
  ).toEqual({ ok: true });
  expect(await store.acknowledgeLocalPublication(first)).toEqual({ ok: false });
  expect((await store.readLocalPublishedBase(record))?.source).toBe(
    source + " newer",
  );
  expect(
    await store.acknowledgeLocalPublication({
      ...first,
      source: "invented",
      sourceSha256: hash("invented"),
    }),
  ).toEqual({ ok: false });
});
it("does not re-date a delayed acknowledgment when later local text repeats the old published source", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  const save = (text: string, revision: number) =>
    store.save({
      record,
      source: text,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
      baseCommit: base.baseCommit,
      baseFileHash: null,
    });
  await save(source, 0);
  const older = {
    record,
    source,
    sourceSha256: hash(source),
    publicationId: crypto.randomUUID(),
    localRevision: 1,
  };
  await save(source + " B", 1);
  const newer = {
    record,
    source: source + " B",
    sourceSha256: hash(source + " B"),
    publicationId: crypto.randomUUID(),
    localRevision: 2,
  };
  expect(await store.acknowledgeLocalPublication(newer)).toEqual({ ok: true });
  await save(source, 2);
  expect(await store.acknowledgeLocalPublication(older)).toEqual({ ok: false });
  expect(await store.readLocalPublishedBase(record)).toEqual({
    source: newer.source,
    publicationId: newer.publicationId,
  });
  expect(await store.acknowledgeLocalPublication(newer)).toEqual({ ok: true });
  expect(
    await store.acknowledgeLocalPublication({
      ...newer,
      publicationId: crypto.randomUUID(),
    }),
  ).toEqual({ ok: false });
  expect(
    await store.acknowledgeLocalPublication({ ...older, localRevision: 2 }),
  ).toEqual({ ok: false });
});
it("rejects missing, noninteger and nonmatching originating revisions", async () => {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  await store.save({
    record,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    baseCommit: base.baseCommit,
    baseFileHash: null,
  });
  const input = {
    record,
    source,
    sourceSha256: hash(source),
    publicationId: crypto.randomUUID(),
    localRevision: 1,
  };
  for (const localRevision of [0, 1.5, Number.MAX_SAFE_INTEGER + 1, 2])
    expect(
      await store.acknowledgeLocalPublication({ ...input, localRevision }),
    ).toEqual({ ok: false });
  expect(await store.readLocalPublishedBase(record)).toBeNull();
});
