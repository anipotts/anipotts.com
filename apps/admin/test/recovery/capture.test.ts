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
import { RecoveryCoordinator } from "../../src/editorial/recovery-coordinator";

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
    env.RECOVERY_ARTIFACTS,
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
    expect(opened.evidence.objects[0]?.httpMetadata).toEqual({
      contentType: "image/png",
      cacheControl: "public, max-age=60",
    });
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
      "recovery_external_writers_unresolved",
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
    await failure(
      store,
      (instance) => instance.capture(),
      "offline_recovery_unsupported_kv_schema",
    );
    expect(
      await runInDurableObject(store, (_instance, state) => ({
        phase: state.storage.sql
          .exec<{ phase: string }>(
            "SELECT phase FROM editorial_recovery_control",
          )
          .one().phase,
        qualified: state.storage.sql
          .exec<{ n: number }>(
            "SELECT count(*) AS n FROM editorial_recovery_captures",
          )
          .one().n,
      })),
    ).toEqual({ phase: "blocked", qualified: 0 });
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
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

  it("captures and restores the actual supported pre-clientHash ALTER layout without changing legacy retries", async () => {
    const store = env.RECOVERY_LEGACY_SOURCE.getByName(crypto.randomUUID());
    const request = save();
    const first = await store.save(request);
    expect(first.ok).toBe(true);
    await runInDurableObject(store, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ name: string }>("PRAGMA table_info(save_request_identities)")
          .toArray()
          .at(-1)?.name,
      ).toBe("clientHash");
      // A genuine old receipt keeps its NULL clientHash after the ADD COLUMN.
      state.storage.sql.exec(
        "UPDATE save_request_identities SET clientHash=NULL WHERE id=?",
        request.requestId,
      );
    });
    const serialized = await store.capture();
    const opened = openRecoveryCapture(serialized);
    const restored = target();
    expect(await restored.installRecovery(serialized)).toMatchObject({
      mode: "isolated-suspended",
    });
    expect((await restored.get(record))?.source).toBe(source);
    expect(
      await runInDurableObject(restored, (_instance, state) =>
        state.storage.sql
          .exec(
            "SELECT clientHash FROM save_request_identities WHERE id=?",
            request.requestId,
          )
          .one(),
      ),
    ).toEqual({ clientHash: null });
    expect(await store.complete(serialized)).toEqual({
      state: "released",
      sha256: opened.sha256,
    });
    expect(await store.save(request)).toEqual(first);
  });

  it("explicit completion reopens both source stores while the artifact and suspended target retain their captured frontier", async () => {
    const store = fresh();
    expect((await store.save(save())).ok).toBe(true);
    const serialized = await store.capture(),
      opened = openRecoveryCapture(serialized);
    const restored = target();
    await restored.installRecovery(serialized);
    await failure(
      store,
      (instance) => instance.save(save(1)),
      "recovery_write_fenced",
    );
    expect(await store.complete(serialized)).toEqual({
      state: "released",
      sha256: opened.sha256,
    });
    expect((await store.save(save(1, source + "source continues"))).ok).toBe(
      true,
    );
    expect(
      (await publishDirect(env.RECOVERY_SOURCE_DB, publication)).status,
    ).toBe("published");
    expect((await restored.get(record))?.source).toBe(source);
    expect((await restored.get(record))?.revision).toBe(1);
    expect(
      (
        await env.RECOVERY_CONTENT_DB.prepare(
          "SELECT version FROM editorial_published_inventory",
        ).first()
      )?.version,
    ).toBe(0);
    expect(openRecoveryCapture(serialized)).toEqual(opened);
    const next = await store.capture();
    expect(openRecoveryCapture(next).evidence.control.captures).toEqual([
      {
        capture_id: opened.evidence.captureId,
        editorial_generation: opened.evidence.editorialGeneration,
        content_generation: opened.evidence.contentGeneration,
        sha256: opened.sha256,
        state: "released",
      },
    ]);
    // An old successful receipt cannot reopen a newer capture generation.
    await failure(
      store,
      (instance) => instance.complete(serialized),
      "recovery_fence_lost",
    );
    await failure(
      store,
      (instance) => instance.save(save(2)),
      "recovery_write_fenced",
    );
    expect((await store.complete(next)).state).toBe("released");
  });

  it("completion requires the exact qualified artifact and zero pending writer records", async () => {
    const store = fresh(),
      serialized = await store.capture();
    const corrupted = JSON.parse(serialized);
    corrupted.sha256 = "0".repeat(64);
    await failure(
      store,
      (instance) => instance.complete(JSON.stringify(corrupted)),
      "capture_checksum",
    );
    await runInDurableObject(store, (_instance, state) =>
      state.storage.sql
        .exec(
          "INSERT INTO editorial_recovery_writers VALUES ('synthetic-unresolved','interrupted')",
        )
        .toArray(),
    );
    await failure(
      store,
      (instance) => instance.complete(serialized),
      "recovery_writers_unresolved",
    );
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
    expect(
      (
        await env.RECOVERY_SOURCE_DB.prepare(
          "SELECT phase FROM editorial_recovery_control",
        ).first()
      )?.phase,
    ).toBe("draining");
  });

  it("a completion interrupted before external I/O cannot be resumed by eviction or a repeated request", async () => {
    const store = fresh(),
      serialized = await store.capture(),
      opened = openRecoveryCapture(serialized);
    await runInDurableObject(store, (_instance, state) =>
      new RecoveryCoordinator(state.storage).beginCompletion({
        captureId: opened.evidence.captureId,
        editorialGeneration: opened.evidence.editorialGeneration,
        contentGeneration: opened.evidence.contentGeneration,
        sha256: opened.sha256,
      }),
    );
    await evictDurableObject(store);
    await failure(
      store,
      (instance) => instance.complete(serialized),
      "recovery_completion_conflict",
    );
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
    expect(
      await runInDurableObject(store, (_instance, state) =>
        state.storage.sql
          .exec("SELECT state FROM editorial_recovery_captures")
          .one(),
      ),
    ).toEqual({ state: "releasing" });
  });

  it("an ambiguous D1 reopening leaves the DO blocked and never reports a cross-store atomic release", async () => {
    const store = fresh(),
      serialized = await store.capture();
    await failure(
      store,
      (instance) => instance.completeWithLostResponse(serialized),
      "synthetic_completion_response_lost",
    );
    expect(
      (
        await env.RECOVERY_SOURCE_DB.prepare(
          "SELECT phase FROM editorial_recovery_control",
        ).first()
      )?.phase,
    ).toBe("open");
    expect(
      await runInDurableObject(store, (_instance, state) => ({
        phase: state.storage.sql
          .exec<{ phase: string }>(
            "SELECT phase FROM editorial_recovery_control",
          )
          .one().phase,
        completion: state.storage.sql
          .exec<{ state: string }>(
            "SELECT state FROM editorial_recovery_captures",
          )
          .one().state,
      })),
    ).toEqual({ phase: "blocked", completion: "blocked" });
    await evictDurableObject(store);
    await failure(
      store,
      (instance) => instance.complete(serialized),
      "recovery_fence_lost",
    );
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
  });

  it("rejects normal-shaped unsupported bindings and an unmigrated D1 before closing source admission", async () => {
    const unsupported = fresh();
    await failure(
      unsupported,
      (instance) => instance.captureUnsupportedBindings(),
      "recovery_writer_cohort_unsupported",
    );
    expect((await unsupported.save(save())).ok).toBe(true);
    const store = fresh();
    await env.RECOVERY_SOURCE_DB.prepare(
      "DROP TABLE editorial_recovery_control",
    ).run();
    await failure(
      store,
      (instance) => instance.capture(),
      "recovery_fence_not_installed",
    );
    expect(
      await runInDurableObject(store, (_instance, state) =>
        state.storage.sql
          .exec("SELECT phase FROM editorial_recovery_control")
          .one(),
      ),
    ).toEqual({ phase: "open" });
    expect((await store.save(save())).ok).toBe(true);
  });

  it("keeps the source's future wake and permits its actual alarm after verified completion", async () => {
    const store = fresh(),
      alarmAt = Date.now() + 86_400_000;
    await runInDurableObject(store, (_instance, state) =>
      state.storage.setAlarm(alarmAt),
    );
    const serialized = await store.capture(),
      restored = target();
    await restored.installRecovery(serialized);
    await store.complete(serialized);
    expect(
      await runInDurableObject(store, (_instance, state) =>
        state.storage.getAlarm(),
      ),
    ).toBe(alarmAt);
    expect(await runDurableObjectAlarm(store)).toBe(true);
    expect(
      await runInDurableObject(store, (_instance, state) =>
        state.storage.sql
          .exec("SELECT count(*) AS n FROM editorial_recovery_writers")
          .one(),
      ),
    ).toEqual({ n: 0 });
    expect((await store.save(save())).ok).toBe(true);
    expect(await restored.recoveryStatus()).toMatchObject({
      phase: "complete",
      alarmAt: null,
    });
  });
  it("completion cannot reopen D1 while an unresolved external writer is present", async () => {
    const store = fresh(),
      serialized = await store.capture();
    await env.RECOVERY_SOURCE_DB.prepare(
      "INSERT INTO editorial_recovery_writers VALUES ('synthetic-late',1,'interrupted','active')",
    ).run();
    await failure(
      store,
      (instance) => instance.complete(serialized),
      "recovery_completion_unconfirmed",
    );
    expect(
      (
        await env.RECOVERY_SOURCE_DB.prepare(
          "SELECT phase FROM editorial_recovery_control",
        ).first()
      )?.phase,
    ).toBe("draining");
    expect(
      await runInDurableObject(store, (_instance, state) =>
        state.storage.sql
          .exec("SELECT phase FROM editorial_recovery_control")
          .one(),
      ),
    ).toEqual({ phase: "blocked" });
    await failure(
      store,
      (instance) => instance.save(save()),
      "recovery_write_fenced",
    );
  });
  it("rejects unsupported D1 application state during preflight while source editing stays available", async () => {
    const store = fresh();
    await env.RECOVERY_SOURCE_DB.prepare(
      "CREATE TABLE synthetic_future_public_state (value TEXT)",
    ).run();
    try {
      await failure(
        store,
        (instance) => instance.capture(),
        "capture_unknown_store:content:synthetic_future_public_state",
      );
      expect(
        await runInDurableObject(store, (_instance, state) =>
          state.storage.sql
            .exec("SELECT phase FROM editorial_recovery_control")
            .one(),
        ),
      ).toEqual({ phase: "open" });
      expect((await store.save(save())).ok).toBe(true);
    } finally {
      await env.RECOVERY_SOURCE_DB.prepare(
        "DROP TABLE synthetic_future_public_state",
      ).run();
    }
  });
});

// v3 artifact events are staged in a separate disposable object using existing
// local fixture bindings, never added to the captured source or target stores.
import {
  captureRecoveryV3,
  completeRecoveryV3,
} from "../../src/editorial/recovery-storage";
import {
  type RecoveryCaptureV3Event,
  type RecoveryCaptureV3Context,
} from "../../../../scripts/admin/recovery-capture-v3.mjs";

/** Native RPC adds a non-enumerable disposal capability to returned values.
 * Unwrap that transport resource into a strict bounded plain event, retaining
 * every format field and rejecting all other unknown keys. Codec rules stay exact. */
function copyArtifactEvent(
  event: RecoveryCaptureV3Event,
): RecoveryCaptureV3Event {
  const fields =
    event.kind === "header"
      ? ["kind", "serialized"]
      : [
          "kind",
          "role",
          "sequence",
          "objectIndex",
          "index",
          "length",
          "ciphertext",
          "tag",
        ];
  const keys = Reflect.ownKeys(event);
  try {
    if (event.kind !== "header" && event.kind !== "record")
      throw new Error("synthetic_artifact_schema");
    if (
      Object.getPrototypeOf(event) !== Object.prototype ||
      Object.keys(event).length !== fields.length ||
      !fields.every((field) =>
        Object.prototype.propertyIsEnumerable.call(event, field),
      ) ||
      keys.some(
        (key) => !fields.includes(String(key)) && key !== Symbol.dispose,
      )
    )
      throw new Error("synthetic_artifact_schema");
    if (event.kind === "header") {
      if (
        typeof event.serialized !== "string" ||
        Buffer.byteLength(event.serialized) > 8192
      )
        throw new Error("synthetic_artifact_header");
      return { kind: "header", serialized: event.serialized };
    }
    const length = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength",
    )!.get!;
    if (
      !(event.ciphertext instanceof Uint8Array) ||
      !(event.tag instanceof Uint8Array) ||
      length.call(event.ciphertext) > 65536 ||
      length.call(event.tag) !== 16
    )
      throw new Error("synthetic_artifact_frame");
    return {
      kind: "record",
      role: event.role,
      sequence: event.sequence,
      objectIndex: event.objectIndex,
      index: event.index,
      length: event.length,
      ciphertext: new Uint8Array(event.ciphertext),
      tag: new Uint8Array(event.tag),
    };
  } finally {
    if (Symbol.dispose in event) {
      const dispose = event[Symbol.dispose];
      if (typeof dispose !== "function")
        throw new Error("synthetic_artifact_disposal");
      dispose.call(event);
    }
  }
}
function artifactV3() {
  const spoolName = `synthetic-artifact-${crypto.randomUUID()}`;
  let records = 0,
    outstanding = 0,
    maximum = 0,
    complete = false;
  return {
    async write(event: RecoveryCaptureV3Event) {
      maximum = Math.max(maximum, ++outstanding);
      const index = records++;
      try {
        await env.RECOVERY_SOURCE.getByName(spoolName).putRecoveryArtifact(
          index,
          event,
        );
      } finally {
        outstanding--;
      }
    },
    complete() {
      complete = true;
    },
    abort() {
      complete = false;
    },
    source: async function* () {
      for (let index = 0; index < records; index++)
        yield copyArtifactEvent(
          await env.RECOVERY_SOURCE.getByName(spoolName).getRecoveryArtifact(
            index,
          ),
        );
    },
    stats() {
      return { records, maximum, complete };
    },
  };
}
async function seededV3(size: number, largeControl = false) {
  const store = fresh(),
    digest = createHash("sha256");
  for (let offset = 0; offset < size; offset += 65536)
    digest.update(new Uint8Array(Math.min(65536, size - offset)).fill(71));
  const id = `${digest.digest("hex")}.png`;
  const text =
    `/images/editorial/${id}\n` + "x".repeat(largeControl ? 509_900 : 64);
  await runInDurableObject(store, async (_instance, state) => {
    await new RecoveryCoordinator(state.storage).writer(
      "synthetic-v3-seed",
      async () => {
        const draft = {
          key: "content/public/writing/synthetic-recovery.md",
          source: text,
          baseCommit: "a".repeat(40),
          baseFileHash: null,
          revision: largeControl ? 7 : 1,
          updatedAt: 1,
          discardedAt: null,
        };
        for (let revision = 1; revision <= draft.revision; revision++)
          state.storage.sql.exec(
            "INSERT INTO revisions(key,revision,snapshot) VALUES(?,?,?)",
            draft.key,
            revision,
            JSON.stringify({ ...draft, revision }),
          );
        state.storage.sql.exec(
          "INSERT INTO drafts(key,source,baseCommit,baseFileHash,revision,updatedAt,discardedAt) VALUES(?,?,?,?,?,?,?)",
          draft.key,
          draft.source,
          draft.baseCommit,
          null,
          draft.revision,
          1,
          null,
        );
        await state.storage.put(`media:${id}`, { id, type: "image/png", size });
        for (let offset = 0, index = 0; offset < size; offset += 65536, index++)
          await state.storage.put(
            `media:${id}:${index}`,
            new Uint8Array(Math.min(65536, size - offset)).fill(71),
          );
      },
    );
  });
  await withRecoveryWriter(
    env.RECOVERY_SOURCE_DB,
    "synthetic-v3-public",
    async () => {
      const stream = new FixedLengthStream(size),
        writer = stream.writable.getWriter();
      const upload = env.RECOVERY_SOURCE_MEDIA.put(id, stream.readable, {
        httpMetadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=60",
        },
        customMetadata: { fixture: "v3-synthetic" },
      });
      void upload.catch(() => {});
      for (let offset = 0; offset < size; offset += 65536)
        await writer.write(
          new Uint8Array(Math.min(65536, size - offset)).fill(71),
        );
      await writer.close();
      await upload;
    },
  );
  return { store, id, text };
}
it("v3 captures 10 MiB in both planes with 4 MiB-class controls through encrypted export and suspended restore/readback", async () => {
  let disposed = 0;
  const transport = {
    kind: "header" as const,
    serialized: "opaque fixture label",
  };
  Object.defineProperty(transport, Symbol.dispose, {
    value: () => {
      disposed++;
    },
  });
  expect(copyArtifactEvent(transport)).toEqual({
    kind: "header",
    serialized: "opaque fixture label",
  });
  expect(disposed).toBe(1);
  Reflect.set(transport, "unknown", true);
  expect(() => copyArtifactEvent(transport)).toThrow(
    "synthetic_artifact_schema",
  );
  const oversized = {
    kind: "record" as const,
    role: "media" as const,
    sequence: 1,
    objectIndex: 0,
    index: 0,
    length: 65537,
    ciphertext: new Uint8Array(65537),
    tag: new Uint8Array(16),
  };
  expect(() => copyArtifactEvent(oversized)).toThrow(
    "synthetic_artifact_frame",
  );
  const { store, id, text } = await seededV3(10 * 1024 * 1024, true),
    artifact = artifactV3(),
    key = crypto.getRandomValues(new Uint8Array(32));
  const captured = await runInDurableObject(store, (_instance, state) =>
    captureRecoveryV3(
      state.storage,
      env.RECOVERY_SOURCE_DB,
      env.RECOVERY_SOURCE_MEDIA,
      env.RECOVERY_APPLICATION_REVISION,
      key,
      artifact,
    ),
  );
  expect(artifact.stats()).toMatchObject({ maximum: 1, complete: true });
  expect(captured.receipt.controlBytes).toBeGreaterThan(4_000_000);
  expect(captured.receipt.mediaBytes).toBe(20 * 1024 * 1024);
  const restored = target();
  const result = await runInDurableObject(restored, (instance) =>
    instance.installRecoveryV3(artifact.source, key, captured.context),
  );
  expect(result.sha256).toBe(captured.sha256);
  expect((await restored.get(record))?.source).toBe(text);
  expect(await restored.recoveryStatus()).toMatchObject({
    phase: "complete",
    alarmAt: null,
    mode: "isolated-suspended",
  });
  expect(await runDurableObjectAlarm(restored)).toBe(false);
  const privateHash = await runInDurableObject(
    restored,
    async (_instance, state) => {
      const digest = createHash("sha256");
      for (let index = 0; index < 160; index++) {
        const bytes = await state.storage.get<Uint8Array>(
          `media:${id}:${index}`,
        );
        expect(bytes?.byteLength).toBe(65536);
        digest.update(bytes!);
      }
      return digest.digest("hex");
    },
  );
  const publicDigest = createHash("sha256");
  for (let offset = 0; offset < 10 * 1024 * 1024; offset += 65536) {
    const part = await env.RECOVERY_CONTENT_MEDIA.get(id, {
      range: { offset, length: 65536 },
    });
    const bytes = new Uint8Array(await part!.arrayBuffer());
    expect(bytes.byteLength).toBe(65536);
    publicDigest.update(bytes);
  }
  expect(privateHash).toBe(id.split(".")[0]);
  expect(publicDigest.digest("hex")).toBe(privateHash);
  expect((await env.RECOVERY_CONTENT_MEDIA.head(id))?.customMetadata).toEqual({
    fixture: "v3-synthetic",
  });
  await failure(
    restored,
    (instance) => instance.save(save(7)),
    "recovery_write_fenced",
  );
  await failure(
    store,
    (instance) => instance.save(save(7)),
    "recovery_write_fenced",
  );
  expect(
    await runInDurableObject(store, (_instance, state) =>
      completeRecoveryV3(
        state.storage,
        env.RECOVERY_SOURCE_DB,
        artifact.source,
        key,
        captured.context,
      ),
    ),
  ).toEqual({ state: "released", sha256: captured.sha256 });
  key.fill(0);
}, 60_000);
it("v3 first-pass tag/truncation/context failures leave actual target empty and inaccessible", async () => {
  const { store } = await seededV3(70_001),
    artifact = artifactV3(),
    key = crypto.getRandomValues(new Uint8Array(32));
  const captured = await runInDurableObject(store, (_instance, state) =>
    captureRecoveryV3(
      state.storage,
      env.RECOVERY_SOURCE_DB,
      env.RECOVERY_SOURCE_MEDIA,
      env.RECOVERY_APPLICATION_REVISION,
      key,
      artifact,
    ),
  );
  for (const mode of ["tag", "truncated", "context"]) {
    const restored = target();
    let index = 0;
    const source = async function* () {
      for await (const event of artifact.source()) {
        if (
          mode === "truncated" &&
          event.kind === "record" &&
          event.role === "commit"
        )
          return;
        if (mode === "tag" && ++index === 2 && event.kind === "record")
          event.tag[0] = event.tag[0]! ^ 1;
        yield event;
      }
    };
    const identity: RecoveryCaptureV3Context =
      mode === "context"
        ? { ...captured.context, editorialGeneration: 999 }
        : captured.context;
    await failure(
      restored,
      (instance) => instance.installRecoveryV3(source, key, identity),
      "encrypted_recovery_media_",
    );
    expect(await restored.recoveryStatus()).toMatchObject({
      phase: "empty",
      alarmAt: null,
    });
    await failure(
      restored,
      (instance) => instance.get(record),
      "recovery_target_unavailable",
    );
  }
  key.fill(0);
}, 30_000);
it("v3 changed second pass leaves actual target failed and suspended", async () => {
  const { store } = await seededV3(70_001),
    artifact = artifactV3(),
    key = crypto.getRandomValues(new Uint8Array(32));
  const captured = await runInDurableObject(store, (_instance, state) =>
    captureRecoveryV3(
      state.storage,
      env.RECOVERY_SOURCE_DB,
      env.RECOVERY_SOURCE_MEDIA,
      env.RECOVERY_APPLICATION_REVISION,
      key,
      artifact,
    ),
  );
  let opens = 0;
  const source = async function* () {
    opens++;
    for await (const event of artifact.source()) {
      if (opens === 2 && event.kind === "record" && event.role === "commit")
        event.tag[0] = event.tag[0]! ^ 1;
      yield event;
    }
  };
  const restored = target();
  await failure(
    restored,
    (instance) => instance.installRecoveryV3(source, key, captured.context),
    "encrypted_recovery_media_",
  );
  expect(await restored.recoveryStatus()).toMatchObject({
    phase: "failed",
    alarmAt: null,
  });
  await failure(
    restored,
    (instance) => instance.get(record),
    "recovery_target_unavailable",
  );
  await failure(
    store,
    (instance) => instance.save(save(1)),
    "recovery_write_fenced",
  );
  key.fill(0);
}, 30_000);

// New supplied-R2 storage qualification. Only the separate local artifact bucket
// is touched; production has no import, route or artifact binding.
import {
  createR2RecoveryArtifact,
  openR2RecoveryArtifact,
  RECOVERY_ARTIFACT_R2_LIMITS,
  type RecoveryArtifactDescriptor,
  type RecoveryArtifactBucket,
} from "../../src/editorial/recovery-artifact-r2";

type R2Capture = {
  captured: {
    context: RecoveryCaptureV3Context;
    receipt: import("../../../../scripts/admin/recovery-capture-v3.mjs").RecoveryCaptureV3Receipt;
    sha256: string;
  };
  descriptor: RecoveryArtifactDescriptor;
};
it("R2 artifact: actual 10 MiB both planes and 4 MiB-class controls capture, reopen, restore and release", async () => {
  const { store, id, text } = await seededV3(10 * 1024 * 1024, true);
  const key = crypto.getRandomValues(new Uint8Array(32));
  try {
    const result: R2Capture = JSON.parse(
      await store.captureToR2(crypto.randomUUID(), key),
    );
    const serialized = JSON.stringify(result.descriptor);
    const page = await env.RECOVERY_ARTIFACTS.list();
    expect(page.truncated).toBe(false);
    expect(page.objects.length).toBeGreaterThan(320);
    for (const object of page.objects)
      expect(object.size).toBeLessThanOrEqual(
        RECOVERY_ARTIFACT_R2_LIMITS.shardBytes,
      );
    expect(result.captured.receipt.controlBytes).toBeGreaterThan(4_000_000);
    expect(result.captured.receipt.mediaBytes).toBe(20 * 1024 * 1024);
    expect(
      (await env.RECOVERY_SOURCE_MEDIA.list()).objects.map(
        (object) => object.key,
      ),
    ).toEqual([id]);
    const restored = target();
    expect(
      JSON.parse(
        await restored.installFromR2(serialized, key, result.captured.context),
      ).sha256,
    ).toBe(result.captured.sha256);
    expect((await restored.get(record))?.source).toBe(text);
    expect(await restored.recoveryStatus()).toMatchObject({
      phase: "complete",
      alarmAt: null,
      mode: "isolated-suspended",
    });
    expect(await runDurableObjectAlarm(restored)).toBe(false);
    const privateHash = await runInDurableObject(
      restored,
      async (_instance, state) => {
        const digest = createHash("sha256");
        for (let index = 0; index < 160; index++) {
          const bytes = await state.storage.get<Uint8Array>(
            `media:${id}:${index}`,
          );
          if (!bytes || bytes.byteLength !== 65536)
            throw new Error("synthetic_private_chunk");
          digest.update(bytes);
        }
        return digest.digest("hex");
      },
    );
    const publicHash = createHash("sha256");
    for (let offset = 0; offset < 10 * 1024 * 1024; offset += 65536) {
      const part = await env.RECOVERY_CONTENT_MEDIA.get(id, {
        range: { offset, length: 65536 },
      });
      if (!part) throw new Error("synthetic_public_chunk");
      const bytes = await part.arrayBuffer();
      expect(bytes.byteLength).toBe(65536);
      publicHash.update(new Uint8Array(bytes));
    }
    expect(privateHash).toBe(id.split(".")[0]);
    expect(publicHash.digest("hex")).toBe(privateHash);
    expect((await env.RECOVERY_CONTENT_MEDIA.head(id))?.customMetadata).toEqual(
      { fixture: "v3-synthetic" },
    );
    expect(
      await store.completeFromR2(serialized, key, result.captured.context),
    ).toEqual({ state: "released", sha256: result.captured.sha256 });
  } finally {
    key.fill(0);
  }
}, 60_000);

it("R2 artifact: actual crypto refuses wrong key/context and forged header/tag/order before target claim", async () => {
  const { store } = await seededV3(70_001);
  const key = crypto.getRandomValues(new Uint8Array(32));
  try {
    const result: R2Capture = JSON.parse(
      await store.captureToR2(crypto.randomUUID(), key),
    );
    for (const mode of ["key", "context", "header", "tag", "order"]) {
      let descriptor = result.descriptor;
      if (["header", "tag", "order"].includes(mode)) {
        const rewritten = createR2RecoveryArtifact(
          env.RECOVERY_ARTIFACTS,
          crypto.randomUUID(),
        );
        const signal = new AbortController().signal;
        for await (const event of openR2RecoveryArtifact(
          env.RECOVERY_ARTIFACTS,
          result.descriptor,
        )()) {
          if (mode === "header" && event.kind === "header") {
            const header: Record<string, unknown> = JSON.parse(
              event.serialized,
            );
            header.format = "synthetic-invalid-format";
            await rewritten.write(
              { kind: "header", serialized: JSON.stringify(header) },
              signal,
            );
          } else if (
            event.kind === "record" &&
            event.sequence === 2 &&
            ["tag", "order"].includes(mode)
          ) {
            if (mode === "tag") event.tag[0] = event.tag[0]! ^ 1;
            // Structurally legal transport ordering, wrong authenticated record identity.
            await rewritten.write(
              mode === "order" ? { ...event, index: event.index + 1 } : event,
              signal,
            );
          } else await rewritten.write(event, signal);
        }
        await rewritten.complete(result.captured.receipt, signal);
        descriptor = rewritten.descriptor();
      }
      const restored = target();
      await failure(
        restored,
        (instance) =>
          instance.installFromR2(
            JSON.stringify(descriptor),
            mode === "key" ? new Uint8Array(32) : key,
            mode === "context"
              ? {
                  ...result.captured.context,
                  contentGeneration:
                    result.captured.context.contentGeneration + 1,
                }
              : result.captured.context,
          ),
        "encrypted_recovery_media_",
      );
      expect(await restored.recoveryStatus()).toMatchObject({
        phase: "empty",
        alarmAt: null,
      });
      await failure(
        restored,
        (instance) => instance.get(record),
        "recovery_target_unavailable",
      );
    }
  } finally {
    key.fill(0);
  }
}, 60_000);

it("R2 artifact: real conditional collisions, missing/truncated data, changed second-pass input and late final ack fail closed", async () => {
  const { store } = await seededV3(70_001);
  const key = crypto.getRandomValues(new Uint8Array(32));
  try {
    const result: R2Capture = JSON.parse(
      await store.captureToR2(crypto.randomUUID(), key),
    );
    const id = result.descriptor.artifactId;
    const original = openR2RecoveryArtifact(
      env.RECOVERY_ARTIFACTS,
      result.descriptor,
    );
    // A real R2 GET with a deliberately stalled transport body. The native
    // ReadableStream cancellation acknowledgment also never resolves.
    const readController = new AbortController();
    let entered!: () => void,
      cancelled = 0;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let stalledBody: ReadableStream<Uint8Array> | undefined;
    const stalledBucket: RecoveryArtifactBucket = {
      put: env.RECOVERY_ARTIFACTS.put.bind(env.RECOVERY_ARTIFACTS),
      async get(name, options) {
        const value = await env.RECOVERY_ARTIFACTS.get(name, options);
        if (!value || !("body" in value) || !name.endsWith("/events/0"))
          return value;
        void value.body.cancel().catch(() => {});
        stalledBody = new ReadableStream<Uint8Array>(
          {
            pull() {
              entered();
              return new Promise<void>(() => {});
            },
            cancel() {
              cancelled++;
              return new Promise<void>(() => {});
            },
          },
          { highWaterMark: 0 },
        );
        return {
          size: value.size,
          etag: value.etag,
          version: value.version,
          body: stalledBody,
        };
      },
    };
    const stalledSource = openR2RecoveryArtifact(
      stalledBucket,
      result.descriptor,
      readController.signal,
    );
    const iterator = (async function* () {
      yield* stalledSource();
    })();
    const reading = iterator.next();
    await started;
    readController.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await expect(
        Promise.race([
          reading,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("synthetic_cancel_did_not_settle")),
              500,
            );
          }),
        ]),
      ).rejects.toThrow("recovery_artifact_aborted");
    } finally {
      clearTimeout(timer);
    }
    expect(cancelled).toBe(1);
    expect(stalledBody?.locked).toBe(false);

    const collision = createR2RecoveryArtifact(env.RECOVERY_ARTIFACTS, id);
    for await (const event of original()) {
      await expect(
        collision.write(event, new AbortController().signal),
      ).rejects.toThrow("collision");
      break;
    }
    for (const mode of ["missing", "truncated"]) {
      const rewritten = createR2RecoveryArtifact(
        env.RECOVERY_ARTIFACTS,
        crypto.randomUUID(),
      );
      for await (const event of original())
        await rewritten.write(event, new AbortController().signal);
      await rewritten.complete(
        result.captured.receipt,
        new AbortController().signal,
      );
      const descriptor = rewritten.descriptor();
      const name = `editorial-recovery-artifacts/v1/${descriptor.artifactId}/events/1`;
      if (mode === "missing") await env.RECOVERY_ARTIFACTS.delete(name);
      else await env.RECOVERY_ARTIFACTS.put(name, new Uint8Array([1]));
      const restored = target();
      await failure(
        restored,
        (instance) =>
          instance.installFromR2(
            JSON.stringify(descriptor),
            key,
            result.captured.context,
          ),
        "encrypted_recovery_media_transfer",
      );
      expect(await restored.recoveryStatus()).toMatchObject({
        phase: "empty",
        alarmAt: null,
      });
    }
    // Real binding with one deliberately delayed final acknowledgment. No mocked storage.
    let outstanding = 0,
      maximum = 0,
      finalStored = false;
    const controller = new AbortController();
    const bucket: RecoveryArtifactBucket = {
      get: env.RECOVERY_ARTIFACTS.get.bind(env.RECOVERY_ARTIFACTS),
      async put(name, value, options) {
        maximum = Math.max(maximum, ++outstanding);
        try {
          const stored = await env.RECOVERY_ARTIFACTS.put(name, value, options);
          if (name.endsWith("/index")) {
            finalStored = true;
            controller.abort();
          }
          return stored;
        } finally {
          outstanding--;
        }
      },
    };
    const partial = createR2RecoveryArtifact(bucket, crypto.randomUUID());
    for await (const event of original())
      await partial.write(event, controller.signal);
    await expect(
      partial.complete(result.captured.receipt, controller.signal),
    ).rejects.toThrow("aborted");
    expect(finalStored).toBe(true);
    expect(maximum).toBe(1);
    expect(() => partial.descriptor()).toThrow("incomplete");
    // The target acquires the bucket in its own DO context on both passes.
    const restored = target();
    await failure(
      restored,
      (instance) =>
        instance.installFromR2(
          JSON.stringify(result.descriptor),
          key,
          result.captured.context,
          true,
        ),
      "encrypted_recovery_media_transfer",
    );
    expect(await restored.recoveryStatus()).toMatchObject({
      phase: "failed",
      alarmAt: null,
    });
    await failure(
      restored,
      (instance) => instance.get(record),
      "recovery_target_unavailable",
    );
  } finally {
    key.fill(0);
  }
}, 60_000);
