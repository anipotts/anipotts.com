/// <reference types="@cloudflare/vitest-plugin/types" />
import { createHash } from "node:crypto";
import { env } from "cloudflare:workers";
import {
  applyD1Migrations,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { publishDirect } from "@anipotts/content/editorial/direct-publication";
import {
  acquireRecoveryWriter,
  freezeRecoveryDatabase,
  withRecoveryWriter,
} from "@anipotts/content/editorial/recovery-fence";
import { openRecoveryCapture } from "../../../../scripts/admin/editorial-recovery-capture.mjs";
import { exportOfflineRecovery } from "../../../../scripts/admin/editorial-recovery.mjs";

import type {
  CaptureFixture,
  SuspendedRecoveryTarget,
} from "../recovery-worker";
// Expected protocol failures are caught inside the real DO context and asserted
// as values. Positive paths still use RPC. This avoids detached server-side RPC
// rejections in the test transport; no global error handler or ignore flag.
async function failure<T extends CaptureFixture | SuspendedRecoveryTarget>(
  stub: DurableObjectStub<T>,
  work: (instance: T) => Promise<unknown>,
  code: string,
) {
  const result = await runInDurableObject(stub, async (instance) => {
    try {
      await work(instance);
      return { ok: true, error: "" };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain(code);
}

declare const __EDITORIAL_RECOVERY_MIGRATIONS__: import("cloudflare:test").D1Migration[];
const source =
  "---\ntitle: Synthetic recovery\nsummary: Fixture only\nstatus: published\npublished_at: 2026-10-10\n---\n\nExact synthetic bytes: café 🌱\n";
const record = { kind: "writing", id: "synthetic-recovery" } as const;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const key = `${createHash("sha256").update(png).digest("hex")}.png`;
const save = (revision = 0, text = source) => ({
  record,
  source: text,
  expectedRevision: revision,
  requestId: crypto.randomUUID(),
  baseCommit: "a".repeat(40),
  baseFileHash: null,
});
const publication = {
  contentSchemaVersion: 1 as const,
  record,
  source,
  revision: 1,
  operationId: "synthetic-publication",
  expectedPublicationId: null,
  expectedInventoryVersion: 0,
  publishedAt: "2026-10-10T00:00:00Z",
};
const fresh = () => env.RECOVERY_SOURCE.getByName(crypto.randomUUID());
const target = () => env.RECOVERY_TARGET.getByName(crypto.randomUUID());

beforeEach(async () => {
  // These bindings are distinct disposable local databases. No production config
  // or account is loaded, and remoteBindings is disabled by the fixture config.
  for (const db of [env.RECOVERY_SOURCE_DB, env.RECOVERY_CONTENT_DB]) {
    for (const name of [
      "editorial_published_active",
      "editorial_published_revisions",
      "editorial_published_inventory",
      "editorial_recovery_writers",
      "editorial_recovery_control",
      "d1_migrations",
    ])
      await db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
    await applyD1Migrations(db, __EDITORIAL_RECOVERY_MIGRATIONS__);
  }
  for (const bucket of [
    env.RECOVERY_SOURCE_MEDIA,
    env.RECOVERY_CONTENT_MEDIA,
  ]) {
    const page = await bucket.list();
    if (page.truncated) throw new Error("unexpected_synthetic_bucket_size");
    for (const object of page.objects) await bucket.delete(object.key);
  }
});

async function populated() {
  const store = fresh();
  for (let revision = 0; revision < 3; revision++)
    expect((await store.save(save(revision, source + revision))).ok).toBe(true);
  expect((await store.save(save(0, "conflicting synthetic bytes"))).ok).toBe(
    false,
  );
  expect(await store.saveMedia(png)).toMatchObject({
    ok: true,
    media: { id: key },
  });
  expect(
    (await publishDirect(env.RECOVERY_SOURCE_DB, publication)).status,
  ).toBe("published");
  await withRecoveryWriter(
    env.RECOVERY_SOURCE_DB,
    "synthetic-media",
    async () => {
      await env.RECOVERY_SOURCE_MEDIA.put(key, png, {
        httpMetadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=60",
        },
        customMetadata: { fixture: "synthetic" },
      });
    },
  );
  return store;
}

describe("actual local DO SQLite/D1/R2 recovery", () => {
  it("captures every enrolled plane, restores exact bytes/history, preserves R2 metadata and leaves alarms suspended", async () => {
    const store = await populated();
    const alarm = Date.now() + 86_400_000;
    await runInDurableObject(store, (_instance, state) =>
      state.storage.setAlarm(alarm),
    );
    const captured = await store.capture();
    const opened = openRecoveryCapture(captured);
    expect(opened.snapshot.editorial.alarmAt).toBe(alarm);
    expect(opened.evidence.control.editorialWriters).toEqual([]);
    expect(opened.evidence.control.contentWriters).toEqual([]);
    // The legacy formatter remains strict: new durable state is preserved only
    // in the versioned v2 envelope, never silently dropped into an offline-v1 row.
    expect(() =>
      exportOfflineRecovery({
        ...opened.snapshot,
        editorial: {
          ...opened.snapshot.editorial,
          tables: {
            ...opened.snapshot.editorial.tables,
            editorial_recovery_control: opened.evidence.control.editorial,
          },
        },
      }),
    ).toThrow();
    const restored = target();
    expect(await restored.installRecovery(captured)).toMatchObject({
      mode: "isolated-suspended",
      sha256: opened.sha256,
    });
    expect((await restored.get(record))?.source).toBe(source + "2");
    expect(await restored.history(record)).toHaveLength(3);
    expect(await restored.readMedia(key)).toMatchObject({
      bytes: new Uint8Array(png),
    });
    expect(await restored.recoveryStatus()).toMatchObject({
      phase: "complete",
      mode: "isolated-suspended",
      alarmAt: null,
    });
    expect(await runDurableObjectAlarm(restored)).toBe(false);
    await failure(
      restored,
      (instance) => instance.save(save(3)),
      "recovery_write_fenced",
    );
    await expect(
      env.RECOVERY_CONTENT_DB.prepare(
        "UPDATE editorial_published_inventory SET version=99",
      ).run(),
    ).rejects.toThrow("recovery_write_fenced");
    expect((await env.RECOVERY_CONTENT_MEDIA.get(key))?.customMetadata).toEqual(
      { fixture: "synthetic" },
    );
    await evictDurableObject(restored);
    expect(await restored.recoveryStatus()).toMatchObject({
      phase: "complete",
      alarmAt: null,
    });
    await failure(
      restored,
      (instance) => instance.save(save(3)),
      "recovery_write_fenced",
    );
    await failure(
      store,
      (instance) => instance.save(save(3)),
      "recovery_write_fenced",
    );
  });

  it("drains an actual admitted invocation and rejects new writers", async () => {
    const store = fresh();
    const held = store.holdWriter(75);
    // Observe the durable admission, rather than infer it from a delay.
    await expect
      .poll(() =>
        runInDurableObject(
          store,
          (_instance, state) =>
            state.storage.sql
              .exec<{ n: number }>(
                "SELECT count(*) AS n FROM editorial_recovery_writers",
              )
              .one().n,
        ),
      )
      .toBe(1);
    const capture = store.capture(1000).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    expect(await held).toBe("completed");
    const captured = await capture;
    if (!captured.ok) throw captured.error;
    expect(
      openRecoveryCapture(captured.value).evidence.control.editorialWriters,
    ).toEqual([]);
    await failure(
      store,
      (instance) => instance.holdWriter(1),
      "recovery_write_fenced",
    );
  });

  it("does not manufacture completion for a durable orphan after eviction", async () => {
    const store = fresh();
    await runInDurableObject(store, (_instance, state) =>
      state.storage.sql
        .exec(
          "INSERT INTO editorial_recovery_writers VALUES ('synthetic-orphan','interrupted')",
        )
        .toArray(),
    );
    await evictDurableObject(store);
    await failure(
      store,
      (instance) => instance.capture(30),
      "recovery_writers_unresolved",
    );
    const state = await runInDurableObject(store, (_instance, state) =>
      state.storage.sql
        .exec("SELECT phase FROM editorial_recovery_control")
        .one(),
    );
    expect(state.phase).toBe("blocked");
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
  });

  it("fences late D1 requests atomically and refuses unresolved external/R2 writes", async () => {
    expect(
      await acquireRecoveryWriter(env.RECOVERY_SOURCE_DB, "synthetic-late"),
    ).not.toBeNull();
    await expect(
      freezeRecoveryDatabase(env.RECOVERY_SOURCE_DB, crypto.randomUUID()),
    ).rejects.toThrow("recovery_external_writers_unresolved");
    await expect(
      publishDirect(env.RECOVERY_SOURCE_DB, publication),
    ).rejects.toThrow("recovery_write_fenced");
    await expect(
      env.RECOVERY_SOURCE_DB.prepare(
        "UPDATE editorial_published_inventory SET version=1",
      ).run(),
    ).rejects.toThrow("recovery_write_fenced");
    expect(
      (
        await env.RECOVERY_SOURCE_DB.prepare(
          "SELECT version FROM editorial_published_inventory",
        ).first()
      )?.version,
    ).toBe(0);
    await failure(
      fresh(),
      (instance) => instance.capture(),
      "recovery_fence_conflict",
    );
  });

  it("retains ambiguous R2 writer admission instead of expiring it", async () => {
    await expect(
      withRecoveryWriter(
        env.RECOVERY_SOURCE_DB,
        "synthetic-ambiguous",
        async () => {
          await env.RECOVERY_SOURCE_MEDIA.put(key, png, {
            httpMetadata: { contentType: "image/png" },
          });
          throw new Error("synthetic_lost_response");
        },
      ),
    ).rejects.toThrow("synthetic_lost_response");
    await failure(
      fresh(),
      (instance) => instance.capture(),
      "recovery_external_writers_unresolved",
    );
    expect(
      (
        await env.RECOVERY_SOURCE_DB.prepare(
          "SELECT count(*) AS n FROM editorial_recovery_writers",
        ).first()
      )?.n,
    ).toBe(1);
  });

  it("rejects near alarms and unknown stores without claiming a capture", async () => {
    const near = fresh();
    await runInDurableObject(near, (_instance, state) =>
      state.storage.setAlarm(Date.now() + 60_000),
    );
    // A short capture window fits safely before this wake; move it into-window.
    await runInDurableObject(near, (_instance, state) =>
      state.storage.setAlarm(Date.now() + 5000),
    );
    await failure(
      near,
      (instance) => instance.capture(),
      "capture_alarm_window",
    );
    const unknown = fresh();
    await runInDurableObject(unknown, (_instance, state) =>
      state.storage.sql
        .exec("CREATE TABLE future_private_store (value TEXT)")
        .toArray(),
    );
    await failure(
      unknown,
      (instance) => instance.capture(),
      "capture_unknown_store",
    );
  });

  it("fails closed on actual column drift, before returning an envelope", async () => {
    const store = fresh();
    await runInDurableObject(store, (_instance, state) =>
      state.storage.sql
        .exec("ALTER TABLE drafts ADD COLUMN future_authored_state TEXT")
        .toArray(),
    );
    await failure(
      store,
      (instance) => instance.capture(),
      "capture_schema_drift",
    );
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
  });
  it("does not silently omit unsupported KV", async () => {
    const store = fresh();
    await runInDurableObject(store, (_instance, state) =>
      state.storage.put("future-authored-state", { fixture: "synthetic" }),
    );
    await failure(store, (instance) => instance.capture(), "kv_key");
  });
  it("rejects a capture that exceeds the bounded row inventory", async () => {
    const store = fresh();
    await runInDurableObject(store, (_instance, state) =>
      state.storage.sql
        .exec(
          "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<5001) INSERT INTO revisions SELECT 'content/public/writing/synthetic.md',n,'{}' FROM seq",
        )
        .toArray(),
    );
    await failure(
      store,
      (instance) => instance.capture(),
      "capture_entry_limit",
    );
  });
  it("blocks a stalled capture and rejects late success after its deadline", async () => {
    const store = fresh();
    await failure(
      store,
      (instance) => instance.captureWithDelayedInventory(100, 250),
      "capture_timeout",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      await runInDurableObject(store, (instance, state) => ({
        phase: state.storage.sql
          .exec<{ phase: string }>(
            "SELECT phase FROM editorial_recovery_control",
          )
          .one().phase,
        exposedSaveHelper: "saveDraft" in instance,
        exposedReadHelper: "read" in instance,
      })),
    ).toEqual({
      phase: "blocked",
      exposedSaveHelper: false,
      exposedReadHelper: false,
    });
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
  });

  it("rejects integrity errors and nonempty targets before writes; concurrent installs admit one caller", async () => {
    const captured = await (await populated()).capture();
    const changed = JSON.parse(captured);
    changed.sha256 = "0".repeat(64);
    const invalid = target();
    await failure(
      invalid,
      (instance) => instance.installRecovery(JSON.stringify(changed)),
      "capture_checksum",
    );
    expect(await invalid.recoveryStatus()).toMatchObject({ phase: "empty" });
    const nonempty = target();
    await runInDurableObject(nonempty, (_instance, state) =>
      state.storage.put("unknown-private", "synthetic"),
    );
    await failure(
      nonempty,
      (instance) => instance.installRecovery(captured),
      "recovery_target_not_empty",
    );
    expect(await nonempty.recoveryStatus()).toMatchObject({ phase: "empty" });
    const installed = target();
    const results = await runInDurableObject(installed, async (instance) => {
      const results = await Promise.allSettled([
        instance.installRecovery(captured),
        instance.installRecovery(captured),
      ]);
      return results.map((result) => ({ status: result.status }));
    });
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await installed.recoveryStatus()).toMatchObject({
      phase: "complete",
    });
  });

  it("leaves a real partial R2 installation inaccessible and fenced after failure/restart", async () => {
    const captured = await (await populated()).capture();
    const interrupted = env.RECOVERY_INTERRUPTED_TARGET.getByName(
      crypto.randomUUID(),
    );
    await failure(
      interrupted,
      (instance) => instance.installRecovery(captured),
      "synthetic_transport_interruption",
    );
    expect(
      (await env.RECOVERY_CONTENT_MEDIA.list()).objects.map(
        (object) => object.key,
      ),
    ).toEqual([key]);
    expect(await interrupted.recoveryStatus()).toMatchObject({
      phase: "failed",
      alarmAt: null,
    });
    await failure(
      interrupted,
      (instance) => instance.get(record),
      "recovery_target_unavailable",
    );
    await failure(
      interrupted,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
    await evictDurableObject(interrupted);
    expect(await interrupted.recoveryStatus()).toMatchObject({
      phase: "failed",
      alarmAt: null,
    });
    await failure(
      interrupted,
      (instance) => instance.installRecovery(captured),
      "recovery_target_not_empty",
    );
    expect(
      (
        await env.RECOVERY_CONTENT_DB.prepare(
          "SELECT phase FROM editorial_recovery_control",
        ).first()
      )?.phase,
    ).toBe("suspended");
  });
});
