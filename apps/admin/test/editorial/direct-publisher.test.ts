/// <reference types="@cloudflare/vitest-plugin/types" />
import { createHash } from "node:crypto";
import { env } from "cloudflare:workers";
import {
  runInDurableObject,
  evictDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DIRECT_PUBLICATION_SCHEMA_SQL,
  DIRECT_PUBLICATION_CONTRACT_MIGRATION_SQL,
  getPublishedInventory,
  getPublished,
  getDirectReceipt,
  publishDirect,
  type PublicationDatabase,
  type PublicationStatement,
} from "@anipotts/content/editorial/direct-publication";
import type { EditorialDraftStore } from "../../src/editorial/draft-store";
import {
  DirectPublisher,
  editorialPublishMode,
  type DirectPublisherDependencies,
} from "../../src/editorial/direct-publisher";
import {
  readPublishedBase,
  bundledEditorialSources,
  bundledEditorialSourceHash,
  validatePublishedCandidate,
} from "../../src/lib/editorial-published-base";
import {
  type EditorialRecord,
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";
import { newProjectSource } from "../../src/lib/project-draft";
import { PublicationJobs } from "../../src/editorial/publication-jobs";
import type { StartDirectPublication } from "../../src/lib/editorial-publication-status";

const source =
  "---\ntitle: Test essay\nsummary: Test subtitle\nstatus: published\npublished_at: 2026-09-20\n---\n\nSynthetic body.\n";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const freshRecord = () => ({
  kind: "writing" as const,
  id: `test-${crypto.randomUUID()}`,
});
const save = (record: EditorialRecord, text = source, revision = 0) => ({
  record,
  source: text,
  expectedRevision: revision,
  requestId: crypto.randomUUID(),
  baseCommit: "a".repeat(40),
  baseFileHash: null,
});
const directInput = async (
  record: EditorialRecord,
  text = source,
): Promise<StartDirectPublication> => ({
  record,
  expectedRevision: 1,
  operationId: crypto.randomUUID(),
  reviewedSourceSha256: hash(text),
  expectedPublicationId: null,
  expectedBaselineSha256: (await readPublishedBase(env.CONTENT_DB, record))
    .sourceSha256,
});
const publicTransport: typeof fetch = async (input) => {
  const url = new URL(String(input));
  expect(url.origin).toBe("https://anipotts.com");
  const inventory = await getPublishedInventory(env.CONTENT_DB);
  if (url.pathname.startsWith("/images/editorial/")) {
    const object = await env.CONTENT_MEDIA.get(url.pathname.split("/").at(-1)!);
    return object
      ? new Response(object.body)
      : new Response(null, { status: 404 });
  }
  if (url.pathname !== "/api/content-version")
    return new Response("synthetic public page", {
      headers: { "X-Content-Version": String(inventory.version) },
    });
  const record = inventory.publications.find(
    (entry) =>
      entry.record.id === url.searchParams.get("id") &&
      entry.record.kind === url.searchParams.get("kind"),
  );
  return Response.json({
    runtime: 1,
    bundledSourceSha256: await bundledEditorialSourceHash(),
    contentSchemaVersion: 1 as const,
    inventoryVersion: inventory.version,
    ...(record
      ? {
          visible: true,
          publicationId: record.publicationId,
          sourceSha256: record.sourceSha256,
        }
      : {}),
  });
};

beforeAll(async () => {
  await env.CONTENT_DB.batch(
    [
      ...DIRECT_PUBLICATION_SCHEMA_SQL,
      ...DIRECT_PUBLICATION_CONTRACT_MIGRATION_SQL,
    ].map((sql) => env.CONTENT_DB.prepare(sql)),
  );
});

async function fixture(text = source, record: EditorialRecord = freshRecord()) {
  const store = env.DIRECT_EDITORIAL.getByName(crypto.randomUUID());
  expect((await store.save(save(record, text))).ok).toBe(true);
  const input = await directInput(record, text);
  let now = Date.now();
  const acknowledged: string[] = [];
  const advance = async (
    override: Partial<DirectPublisherDependencies> = {},
  ) => {
    now += 6000;
    await runInDurableObject(store, async (instance, state) => {
      const engine = new DirectPublisher(state.storage, {
        db: env.CONTENT_DB,
        media: env.CONTENT_MEDIA,
        readDraft: () => null,
        readMedia: (id) => (instance as EditorialDraftStore).readMedia(id),
        acknowledge: (receipt) => {
          acknowledged.push(receipt.publicationId);
        },
        transport: publicTransport,
        now: () => now,
        ...override,
      });
      await engine.alarm();
    });
  };
  return {
    store,
    record,
    input,
    advance,
    acknowledged,
    elapse: (ms: number) => {
      now += ms;
    },
  };
}

describe("direct publication with real local D1, R2 and SQLite Durable Objects", () => {
  it("loads the actual bundled inventory and validates complete candidates", async () => {
    expect(
      bundledEditorialSources().some((entry) => entry.record.id === "home"),
    ).toBe(true);
    const candidate = await validatePublishedCandidate(
      env.CONTENT_DB,
      freshRecord(),
      source,
    );
    expect(candidate.valid).toBe(true);
    expect(candidate.baseline.publicationId).toBeNull();
  });
  it("proves D1 CAS, atomic pointer/inventory updates, immutable receipts and replay", async () => {
    const record = freshRecord();
    const inventory = await getPublishedInventory(env.CONTENT_DB);
    const input = {
      contentSchemaVersion: 1 as const,
      record,
      source,
      revision: 1,
      operationId: crypto.randomUUID(),
      expectedPublicationId: null,
      expectedInventoryVersion: inventory.version,
      publishedAt: new Date().toISOString(),
    };
    expect((await publishDirect(env.CONTENT_DB, input)).status).toBe(
      "published",
    );
    expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(
      inventory.version + 1,
    );
    expect((await publishDirect(env.CONTENT_DB, input)).status).toBe(
      "replayed",
    );
    expect(
      (
        await publishDirect(env.CONTENT_DB, {
          ...input,
          source: source + "changed",
        })
      ).status,
    ).toBe("idempotency_conflict");
    const stale = {
      ...input,
      operationId: crypto.randomUUID(),
      expectedInventoryVersion: inventory.version + 1,
    };
    expect((await publishDirect(env.CONTENT_DB, stale)).status).toBe(
      "conflict",
    );
    expect(
      await getDirectReceipt(env.CONTENT_DB, stale.operationId),
    ).toBeNull();
    expect((await getPublished(env.CONTENT_DB, record))?.publicationId).toBe(
      input.operationId,
    );
    expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(
      inventory.version + 1,
    );
    await expect(
      env.CONTENT_DB.prepare(
        "UPDATE editorial_published_revisions SET source='changed' WHERE publication_id=?",
      )
        .bind(input.operationId)
        .run(),
    ).rejects.toThrow();
  });
  it("persists exact approval, survives eviction, activates then verifies without Git", async () => {
    const f = await fixture();
    expect((await f.store.startDirectPublication(f.input)).ok).toBe(true);
    await runInDurableObject(f.store, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
    });
    await evictDurableObject(f.store);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "commit",
    );
    await f.advance();
    const activated = await f.store.latestDirectPublication(f.record);
    expect(activated?.phase).toBe("verify");
    expect(activated?.publicationId).toBe(f.input.operationId);
    expect(activated?.verifiedAt).toBeNull();
    expect(JSON.stringify(activated)).not.toContain("Synthetic body");
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
    expect(
      (await f.store.latestDirectPublication(f.record))?.verifiedAt,
    ).toBeGreaterThan(0);
    expect((await f.store.startDirectPublication(f.input)).ok).toBe(true);
    expect((await getPublished(env.CONTENT_DB, f.record))?.publicationId).toBe(
      f.input.operationId,
    );
  });
  it("requires an exact revision/hash and retains cancelled identities while allowing a new intent", async () => {
    const f = await fixture();
    expect(
      await f.store.startDirectPublication({
        ...f.input,
        reviewedSourceSha256: "0".repeat(64),
      }),
    ).toEqual({ ok: false, code: "revision_conflict" });
    expect((await f.store.startDirectPublication(f.input)).ok).toBe(true);
    const initial = (await f.store.latestDirectPublication(f.record))!;
    expect(
      await f.store.cancelDirectPublication(
        f.record,
        initial.id,
        initial.version + 1,
      ),
    ).toEqual({ ok: false, code: "publication_conflict" });
    expect(
      await f.store.cancelDirectPublication(
        f.record,
        initial.id,
        initial.version,
      ),
    ).toEqual({ ok: true });
    expect(await f.store.startDirectPublication(f.input)).toMatchObject({
      ok: true,
      publication: { phase: "cancelled" },
    });
    expect(
      await f.store.startDirectPublication({
        ...f.input,
        reviewedSourceSha256: "0".repeat(64),
      }),
    ).toEqual({ ok: false, code: "idempotency_key_reused" });
    const next = await f.store.startDirectPublication({
      ...f.input,
      operationId: crypto.randomUUID(),
    });
    expect(next).toMatchObject({
      ok: true,
      publication: { phase: "validate" },
    });
    expect(await getPublished(env.CONTENT_DB, f.record)).toBeNull();
  });
  it("reconciles an activation that succeeded before its response was lost", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    let lost = false;
    const db: PublicationDatabase = {
      prepare: (sql) => env.CONTENT_DB.prepare(sql),
      batch: async <T>(statements: PublicationStatement[]) => {
        const result = await env.CONTENT_DB.batch<T>(
          statements as D1PreparedStatement[],
        );
        if (!lost && statements.length === 4) {
          lost = true;
          throw new Error("lost_response");
        }
        return result;
      },
    };
    await f.advance({ db });
    expect(lost).toBe(true);
    const version = (await getPublishedInventory(env.CONTENT_DB)).version;
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "commit",
    );
    await f.advance({
      transport: async () => {
        throw new Error("reader_down");
      },
    });
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "verify",
    );
    expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(version);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
  it("fails closed before activation when the public reader is old or unavailable", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    await f.advance({ transport: async () => Response.json({ runtime: 0 }) });
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "public_reader_not_ready",
    );
    expect(await getPublished(env.CONTENT_DB, f.record)).toBeNull();
    const blocked = (await f.store.latestDirectPublication(f.record))!;
    expect(
      await f.store.retryDirectPublication(
        f.record,
        blocked.id,
        blocked.version,
      ),
    ).toEqual({ ok: true });
    await f.advance();
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
  it("keeps an old activation superseded without reactivating it", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    await f.advance();
    const version = (await getPublishedInventory(env.CONTENT_DB)).version;
    const replacement = {
      contentSchemaVersion: 1 as const,
      record: f.record,
      source: source + "newer",
      revision: 2,
      operationId: crypto.randomUUID(),
      expectedPublicationId: f.input.operationId,
      expectedInventoryVersion: version,
      publishedAt: new Date().toISOString(),
    };
    expect((await publishDirect(env.CONTENT_DB, replacement)).status).toBe(
      "published",
    );
    await f.advance();
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "live",
      superseded: true,
      verifiedAt: null,
    });
    expect((await getPublished(env.CONTENT_DB, f.record))?.publicationId).toBe(
      replacement.operationId,
    );
  });
  it("does not route direct mode to Git and treats unknown mode as maintenance", async () => {
    expect(editorialPublishMode({})).toBe("legacy");
    expect(editorialPublishMode({ EDITORIAL_PUBLISH_MODE: "typo" })).toBe(
      "maintenance",
    );
    const f = await fixture();
    expect(
      await f.store.startPublication({
        record: f.record,
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
      }),
    ).toEqual({ ok: false, code: "invalid_request" });
    const hidden = await fixture(
      source.replace("status: published", "status: draft"),
    );
    expect(await hidden.store.startDirectPublication(hidden.input)).toEqual({
      ok: false,
      code: "unsupported_visibility_change",
    });
  });
  it("does not claim verified live when the metadata endpoint succeeds but a page fails or serves an old version", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    await f.advance();
    await f.advance({
      transport: async (url, init) =>
        new URL(String(url)).pathname.startsWith("/writing/")
          ? new Response("unavailable", { status: 503 })
          : publicTransport(url, init),
    });
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "verify",
      verifiedAt: null,
    });
    await f.advance({
      transport: async (url, init) =>
        new URL(String(url)).pathname === "/feed.xml"
          ? new Response("old", { headers: { "X-Content-Version": "0" } })
          : publicTransport(url, init),
    });
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "verify",
      verifiedAt: null,
    });
    // A current version header over a body validated for an older inventory.
    f.elapse(15_000);
    await f.advance({
      transport: async (url, init) => {
        if (new URL(String(url)).pathname !== "/writing") {
          return publicTransport(url, init);
        }
        const version = (await getPublishedInventory(env.CONTENT_DB)).version;
        return new Response("old copy", {
          headers: {
            "X-Content-Version": String(version),
            ETag: `"cms1-v${version - 1}-0123456789abcdef01234567"`,
          },
        });
      },
    });
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "verify",
      verifiedAt: null,
    });
    f.elapse(15_000);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
  it("preserves newer private edits when the real DO reconciles an activation", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    const next = source + "More private writing";
    await f.store.save(save(f.record, next, 1));
    const version = (await getPublishedInventory(env.CONTENT_DB)).version;
    await publishDirect(env.CONTENT_DB, {
      contentSchemaVersion: 1 as const,
      record: f.record,
      source,
      revision: 1,
      operationId: f.input.operationId,
      expectedPublicationId: null,
      expectedInventoryVersion: version,
      publishedAt: new Date().toISOString(),
    });
    // Reset only the synthetic clock's scheduled wake so the real adapter can
    // reconcile immediately; public verification is the following alarm.
    await runInDurableObject(f.store, async (_instance, state) => {
      state.storage.sql.exec("UPDATE direct_publication_intents SET dueAt=0");
      await state.storage.setAlarm(Date.now() + 1);
    });
    await runDurableObjectAlarm(f.store);
    const draft = (await f.store.get(f.record))!;
    expect(draft.source).toBe(next);
    expect(draft.revision).toBe(2);
    const bytes = Buffer.from(source);
    expect(draft.baseFileHash).toBe(
      createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex"),
    );
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "verify",
    );
  });
  it("blocks changed public baselines and does not activate a colliding candidate", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    const version = (await getPublishedInventory(env.CONTENT_DB)).version;
    await publishDirect(env.CONTENT_DB, {
      contentSchemaVersion: 1 as const,
      record: f.record,
      source: source + "external",
      revision: 1,
      operationId: crypto.randomUUID(),
      expectedPublicationId: null,
      expectedInventoryVersion: version,
      publishedAt: new Date().toISOString(),
    });
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "publication_base_changed",
    );
    const existing = bundledEditorialSources().find(
      (entry) =>
        entry.record.kind === "writing" &&
        (parseEditorialSource(entry.source).data as { status: string })
          .status === "published",
    )!;
    const data = parseEditorialSource(existing.source).data as {
      slug?: string;
    };
    const collision = await fixture(
      setEditorialField(source, ["slug"], data.slug ?? existing.record.id),
    );
    await collision.store.startDirectPublication(collision.input);
    await collision.advance();
    expect(
      (await collision.store.latestDirectPublication(collision.record))
        ?.blocked,
    ).toBe("invalid_snapshot");
    expect(await getPublished(env.CONTENT_DB, collision.record)).toBeNull();
  });
  it("rejects existing route renames until redirects are supported", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    await f.advance();
    await f.advance();
    const next = setEditorialField(source, ["slug"], "replacement-route");
    await f.store.save(save(f.record, next, 1));
    const base = await readPublishedBase(env.CONTENT_DB, f.record);
    await f.store.startDirectPublication({
      ...f.input,
      operationId: crypto.randomUUID(),
      expectedRevision: 2,
      reviewedSourceSha256: hash(next),
      expectedPublicationId: base.publicationId,
      expectedBaselineSha256: base.sourceSha256,
    });
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "unsupported_slug_change",
    );
  });
  it("stages immutable private media and verifies copied bytes before activation", async () => {
    const f = await fixture();
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const media = await f.store.saveMedia(bytes);
    expect(media.ok).toBe(true);
    if (!media.ok) throw new Error("fixture");
    const text =
      source + `![Synthetic pixel](/images/editorial/${media.media.id})`;
    await f.store.save(save(f.record, text, 1));
    await f.store.startDirectPublication({
      ...f.input,
      expectedRevision: 2,
      reviewedSourceSha256: hash(text),
    });
    await f.advance();
    const copied = await env.CONTENT_MEDIA.get(media.media.id);
    expect(copied).not.toBeNull();
    expect(new Uint8Array(await copied!.arrayBuffer())).toEqual(bytes);
    await f.advance();
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
  it("a missing or failed media copy cannot activate and does not block another record", async () => {
    const missingId = "a".repeat(64) + ".png";
    const f = await fixture(
      source + `![missing](/images/editorial/${missingId})`,
    );
    await f.store.startDirectPublication(f.input);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "publication_image_missing",
    );
    const other = freshRecord();
    await f.store.save(save(other));
    const next = await directInput(other);
    expect((await f.store.startDirectPublication(next)).ok).toBe(true);
    await f.advance();
    await f.advance();
    await f.advance();
    expect((await f.store.latestDirectPublication(other))?.phase).toBe("live");
    expect(await getPublished(env.CONTENT_DB, f.record)).toBeNull();
    const failed = await fixture(
      source + `![copy](/images/editorial/${missingId})`,
    );
    await failed.store.startDirectPublication(failed.input);
    await failed.advance({
      readMedia: async () => {
        throw new Error("private_storage_unavailable");
      },
    });
    expect(
      (await failed.store.latestDirectPublication(failed.record))?.phase,
    ).toBe("validate");
    expect(await getPublished(env.CONTENT_DB, failed.record)).toBeNull();
  });
  it("suspends untouched legacy work and refuses legacy work that may have external effects", async () => {
    const f = await fixture();
    await runInDurableObject(f.store, async (_instance, state) => {
      const jobs = new PublicationJobs(state.storage);
      jobs.enqueue("legacy-pending", Date.now());
    });
    expect((await f.store.startDirectPublication(f.input)).ok).toBe(true);
    await f.advance();
    await f.advance();
    await f.advance();
    await runInDurableObject(f.store, async (_instance, state) => {
      expect(
        new PublicationJobs(state.storage).get("legacy-pending")?.attempts,
      ).toBe(0);
      state.storage.sql.exec(
        "UPDATE publication_jobs SET attempts=1 WHERE id='legacy-pending'",
      );
    });
    expect(
      await f.store.startDirectPublication({
        ...f.input,
        operationId: crypto.randomUUID(),
      }),
    ).toEqual({
      ok: false,
      code: "legacy_publication_requires_reconciliation",
    });
  });
  it("stops preparation and verification retries at their windows and preserves explicit retry identity", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    f.elapse(31 * 60_000);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "publication_retry_required",
    );
    const status = (await f.store.latestDirectPublication(f.record))!;
    // Exercise engine clock for deterministic retry expiry without changing real clocks.
    await runInDurableObject(f.store, async (_instance, state) => {
      const engine = new DirectPublisher(state.storage, {
        db: env.CONTENT_DB,
        media: env.CONTENT_MEDIA,
        readDraft: () => null,
        readMedia: async () => null,
        acknowledge: () => {},
        now: () => Date.now() + 32 * 60_000,
      });
      expect(await engine.retry(f.record, status.id, status.version)).toBe(
        true,
      );
    });
    f.elapse(2 * 60_000);
    await f.advance();
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "verify",
    );
    f.elapse(25 * 60 * 60_000);
    await f.advance({
      transport: async () => new Response(null, { status: 503 }),
    });
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "verify",
      blocked: "verification_incomplete",
    });
    expect((await getPublished(env.CONTENT_DB, f.record))?.publicationId).toBe(
      f.input.operationId,
    );
  });
  it("rolls back every D1 effect when a later batch statement fails", async () => {
    const record = freshRecord();
    const operationId = crypto.randomUUID();
    const version = (await getPublishedInventory(env.CONTENT_DB)).version;
    await env.CONTENT_DB.prepare(
      "CREATE TRIGGER isolated_activation_fault BEFORE UPDATE ON editorial_published_inventory BEGIN SELECT RAISE(ABORT, 'synthetic interruption'); END",
    ).run();
    try {
      await expect(
        publishDirect(env.CONTENT_DB, {
          contentSchemaVersion: 1,
          record,
          source,
          revision: 1,
          operationId,
          expectedPublicationId: null,
          expectedInventoryVersion: version,
          publishedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow();
      expect(await getDirectReceipt(env.CONTENT_DB, operationId)).toBeNull();
      expect(await getPublished(env.CONTENT_DB, record)).toBeNull();
      expect((await getPublishedInventory(env.CONTENT_DB)).version).toBe(
        version,
      );
    } finally {
      await env.CONTENT_DB.prepare(
        "DROP TRIGGER isolated_activation_fault",
      ).run();
    }
  });
  it("keeps a durable wake when the publication database binding is temporarily absent", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await runInDurableObject(f.store, async (instance, state) => {
      const owner = instance as unknown as {
        env: Record<string, unknown>;
        alarm(): Promise<void>;
      };
      const original = owner.env;
      owner.env = { ...original, CONTENT_DB: undefined };
      try {
        await state.storage.deleteAlarm();
        await owner.alarm();
        expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now());
        expect(
          (await DirectPublisher.readStatus(state.storage, f.record))?.attempts,
        ).toBe(0);
      } finally {
        owner.env = original;
      }
    });
    await f.advance();
    await f.advance();
    await f.advance();
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      id: f.input.operationId,
      phase: "live",
    });
    const receipt = await getDirectReceipt(env.CONTENT_DB, f.input.operationId);
    expect(receipt?.publicationId).toBe(f.input.operationId);
  });
  it("maintenance without R2 retains readable status and schedules a wake for accepted work", async () => {
    const store = env.MAINTENANCE_EDITORIAL.getByName(crypto.randomUUID());
    const record = freshRecord();
    await store.save(save(record));
    const input = await directInput(record);
    expect(await store.startDirectPublication(input)).toEqual({
      ok: false,
      code: "publisher_not_configured",
    });
    await runInDurableObject(store, async (instance, state) => {
      const draft = await (instance as EditorialDraftStore).get(record);
      const engine = new DirectPublisher(state.storage, {
        db: env.CONTENT_DB,
        media: env.CONTENT_MEDIA,
        readDraft: () => draft,
        readMedia: async () => null,
        acknowledge: () => {},
      });
      expect((await engine.start(input)).ok).toBe(true);
      new PublicationJobs(state.storage).enqueue(
        "legacy-maintenance",
        Date.now(),
      );
    });
    await runDurableObjectAlarm(store);
    expect((await store.latestDirectPublication(record))?.attempts).toBe(0);
    expect((await store.latestDirectPublication(record))?.phase).toBe(
      "validate",
    );
    expect(await getPublished(env.CONTENT_DB, record)).toBeNull();
    await runInDurableObject(store, async (_instance, state) => {
      expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now());
      expect(
        new PublicationJobs(state.storage).get("legacy-maintenance")?.attempts,
      ).toBe(0);
    });
  });
  it("a corrupt copied object blocks activation and retry retains its original approval", async () => {
    const f = await fixture();
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const saved = await f.store.saveMedia(bytes);
    if (!saved.ok) throw new Error("fixture");
    const text = source + `![pixel](/images/editorial/${saved.media.id})`;
    await f.store.save(save(f.record, text, 1));
    const input = {
      ...f.input,
      expectedRevision: 2,
      reviewedSourceSha256: hash(text),
    };
    await f.store.startDirectPublication(input);
    await f.advance({
      media: {
        put: env.CONTENT_MEDIA.put.bind(env.CONTENT_MEDIA),
        get: (async () => null) as R2Bucket["get"],
      },
    });
    const blocked = (await f.store.latestDirectPublication(f.record))!;
    expect(blocked.blocked).toBe("publication_image_copy_failed");
    expect(await getPublished(env.CONTENT_DB, f.record)).toBeNull();
    expect(
      await f.store.retryDirectPublication(
        f.record,
        input.operationId,
        blocked.version,
      ),
    ).toEqual({ ok: true });
    await f.advance();
    await f.advance();
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
    expect((await getPublished(env.CONTENT_DB, f.record))?.sourceSha256).toBe(
      input.reviewedSourceSha256,
    );
  });
  it("returns the existing held intent rather than hiding it behind a permanently waiting new one", async () => {
    const f = await fixture(
      source + `![missing](/images/editorial/${"e".repeat(64)}.png)`,
    );
    await f.store.startDirectPublication(f.input);
    await f.advance();
    const held = (await f.store.latestDirectPublication(f.record))!;
    expect(held.blocked).toBe("publication_image_missing");
    await f.store.save(save(f.record, source, 1));
    const next = {
      ...f.input,
      expectedRevision: 2,
      reviewedSourceSha256: hash(source),
      operationId: crypto.randomUUID(),
    };
    expect(await f.store.startDirectPublication(next)).toMatchObject({
      ok: false,
      code: "publication_in_progress",
      publication: { id: held.id, blocked: held.blocked, canCancel: true },
    });
    expect((await f.store.latestDirectPublication(f.record))?.id).toBe(held.id);
    expect(
      await f.store.directPublicationStatus(f.record, next.operationId),
    ).toBeNull();
    await f.store.cancelDirectPublication(f.record, held.id, held.version);
    expect((await f.store.startDirectPublication(next)).ok).toBe(true);
    await f.advance();
    await f.advance();
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
  it("will not activate against different bundled public defaults even at the same inventory version", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    await f.advance({
      transport: async (url, init) => {
        const response = await publicTransport(url, init);
        const value = (await response.json()) as Record<string, unknown>;
        return Response.json({ ...value, bundledSourceSha256: "0".repeat(64) });
      },
    });
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "public_baseline_mismatch",
    );
    expect(await getPublished(env.CONTENT_DB, f.record)).toBeNull();
  });
  it("honors the kill switch before activation while keeping durable wake and receipt reconciliation", async () => {
    const f = await fixture();
    await f.store.startDirectPublication(f.input);
    await f.advance();
    await f.advance({ canActivate: () => false });
    expect((await f.store.latestDirectPublication(f.record))?.blocked).toBe(
      "publishing_disabled",
    );
    expect(await getPublished(env.CONTENT_DB, f.record)).toBeNull();
    await runInDurableObject(f.store, async (_instance, state) =>
      expect(await state.storage.getAlarm()).not.toBeNull(),
    );
    f.elapse(61_000);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "verify",
    );
    await f.advance({ canActivate: () => false });
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
  it("requires public image delivery and correct bytes before claiming verified live", async () => {
    const f = await fixture();
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const media = await f.store.saveMedia(bytes);
    if (!media.ok) throw new Error("fixture");
    const text =
      source + `![visible pixel](/images/editorial/${media.media.id})`;
    await f.store.save(save(f.record, text, 1));
    await f.store.startDirectPublication({
      ...f.input,
      expectedRevision: 2,
      reviewedSourceSha256: hash(text),
    });
    await f.advance();
    await f.advance();
    await f.advance({
      transport: (url, init) =>
        new URL(String(url)).pathname.startsWith("/images/")
          ? Promise.resolve(new Response(null, { status: 403 }))
          : publicTransport(url, init),
    });
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "verify",
      verifiedAt: null,
    });
    await f.advance({
      transport: (url, init) =>
        new URL(String(url)).pathname.startsWith("/images/")
          ? Promise.resolve(new Response("wrong bytes"))
          : publicTransport(url, init),
    });
    expect(await f.store.latestDirectPublication(f.record)).toMatchObject({
      phase: "verify",
      verifiedAt: null,
    });
    f.elapse(15_000);
    await f.advance();
    expect((await f.store.latestDirectPublication(f.record))?.phase).toBe(
      "live",
    );
  });
});

it("publishes a CMS-only project with structured sections through the durable engine", async () => {
  const record: EditorialRecord = {
    kind: "work",
    id: `project-${crypto.randomUUID()}`,
  };
  let text = setEditorialField(
    newProjectSource(record.id, "Synthetic CMS project"),
    ["public_state"],
    "listed",
  );
  text = setEditorialField(
    text,
    ["story"],
    [{ title: "Origin", paragraphs: ["Synthetic project story."] }],
  );
  expect(
    bundledEditorialSources().some(
      (entry) =>
        entry.record.kind === record.kind && entry.record.id === record.id,
    ),
  ).toBe(false);
  const f = await fixture(text, record);
  expect((await f.store.startDirectPublication(f.input)).ok).toBe(true);
  await evictDurableObject(f.store);
  await f.advance();
  await f.advance();
  const activated = await f.store.latestDirectPublication(record);
  expect(activated?.phase).toBe("verify");
  expect(activated?.verifiedAt).toBeNull();
  expect((await getPublished(env.CONTENT_DB, record))?.source).toBe(text);
  await f.advance();
  expect((await f.store.latestDirectPublication(record))?.phase).toBe("live");
});
