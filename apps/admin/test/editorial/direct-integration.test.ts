/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { createHash } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import {
  DIRECT_PUBLICATION_SCHEMA_SQL,
  getPublished,
  getPublishedInventory,
  listPublicationHistory,
} from "@anipotts/content/editorial/direct-publication";
import { directPublishDraft } from "../../src/editorial/direct-publisher";
import { validatePublishedCandidate } from "../../src/lib/editorial-published-base";
let record: { kind: "writing"; id: string } = {
  kind: "writing",
  id: "direct-integration-fixture",
};
let initialVersion = 0;
const source =
  "---\ntitle: Synthetic integration fixture\nsummary: Local tests only\nstatus: published\npublished_at: 2026-09-08\n---\n\nSynthetic body.";
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6U6sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
beforeEach(async () => {
  for (const sql of DIRECT_PUBLICATION_SCHEMA_SQL)
    await env.CONTENT_DB.prepare(sql).run();
  record = { kind: "writing", id: `integration-${crypto.randomUUID()}` };
  initialVersion = (await getPublishedInventory(env.CONTENT_DB)).version;
});
function setup() {
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  const save = (text: string, revision: number) =>
    store.save({
      record,
      source: text,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
      baseCommit: "a".repeat(40),
      baseFileHash: null,
    });
  const deps = {
    store,
    db: env.CONTENT_DB,
    media: env.CONTENT_MEDIA,
    validateSnapshot: (candidate: typeof record, text: string) =>
      validatePublishedCandidate(env.CONTENT_DB, candidate, text),
  };
  const input = (
    text: string,
    revision: number,
    expectedPublicationId: string | null = null,
  ) => ({
    record,
    expectedRevision: revision,
    operationId: crypto.randomUUID(),
    expectedPublicationId,
    reviewedSourceSha256: hash(text),
  });
  return { store, save, deps, input };
}
it("publishes real DO source and verified PNG through real local R2 and D1, replays once and preserves later typing", async () => {
  const { store, save, deps, input } = setup();
  const upload = await store.saveMedia(png);
  if (!upload.ok) throw new Error("fixture upload failed");
  const text =
    source + `\n\n![Synthetic pixel](/images/editorial/${upload.media.id})`;
  await save(text, 0);
  const request = input(text, 1);
  const result = await directPublishDraft(deps, request);
  expect(result.status).toBe("published");
  const published = await getPublished(env.CONTENT_DB, record);
  expect(published).toMatchObject({
    publicationId: request.operationId,
    source: text,
    revision: 1,
    sourceSha256: hash(text),
  });
  const copied = await env.CONTENT_MEDIA.get(upload.media.id);
  expect(copied).not.toBeNull();
  expect(hash(new Uint8Array(await copied!.arrayBuffer()))).toBe(hash(png));
  expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(
    initialVersion + 1,
  );
  await save(text + "\nLater private typing.", 1);
  expect((await directPublishDraft(deps, request)).status).toBe("replayed");
  expect((await store.get(record))?.source).toContain("Later private typing.");
  expect(await listPublicationHistory(env.CONTENT_DB, record)).toHaveLength(1);
  expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(
    initialVersion + 1,
  );
  expect(await store.latestPublication(record)).toBeNull();
  await runInDurableObject(store, async (_instance, state) =>
    expect(await state.storage.getAlarm()).toBeNull(),
  );
});
it("rejects stale publication pointer without activating the later draft", async () => {
  const { save, deps, input } = setup();
  await save(source, 0);
  const first = input(source, 1);
  expect((await directPublishDraft(deps, first)).status).toBe("published");
  const next = source + "\nNew draft";
  await save(next, 1);
  expect((await directPublishDraft(deps, input(next, 2, null))).status).toBe(
    "conflict",
  );
  expect((await getPublished(env.CONTENT_DB, record))?.publicationId).toBe(
    first.operationId,
  );
  expect(await listPublicationHistory(env.CONTENT_DB, record)).toHaveLength(1);
});
it("missing private media never creates an active publication", async () => {
  const { save, deps, input } = setup();
  const text = source + "\n![](/images/editorial/" + "f".repeat(64) + ".png)";
  await save(text, 0);
  expect((await directPublishDraft(deps, input(text, 1))).status).toBe(
    "publication_image_missing",
  );
  expect(await getPublished(env.CONTENT_DB, record)).toBeNull();
  expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(
    initialVersion,
  );
});
it("rejects a global inventory change after validation even with a fresh record pointer", async () => {
  const { save, deps, input } = setup();
  await save(source, 0);
  const validation = await validatePublishedCandidate(
    env.CONTENT_DB,
    record,
    source,
  );
  const other = {
    kind: "writing",
    id: `other-${crypto.randomUUID()}`,
  } as const;
  const store = env.EDITORIAL.getByName(crypto.randomUUID());
  await store.save({
    record: other,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  });
  const otherResult = await directPublishDraft(
    {
      ...deps,
      store,
      validateSnapshot: (candidate, text) =>
        validatePublishedCandidate(env.CONTENT_DB, candidate, text),
    },
    {
      record: other,
      expectedRevision: 1,
      operationId: crypto.randomUUID(),
      expectedPublicationId: null,
      reviewedSourceSha256: hash(source),
    },
  );
  expect(otherResult.status).toBe("published");
  expect(
    (
      await directPublishDraft(
        { ...deps, validateSnapshot: async () => validation },
        input(source, 1),
      )
    ).status,
  ).toBe("conflict");
  expect(await getPublished(env.CONTENT_DB, record)).toBeNull();
  expect(await getPublished(env.CONTENT_DB, other)).not.toBeNull();
});
