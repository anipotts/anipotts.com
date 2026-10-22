import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";
import {
  RECOVERY_TABLES,
  exportOfflineRecovery,
} from "../../../../scripts/admin/editorial-recovery.mjs";
import {
  openRecoveryCapture,
  type SqlRow,
} from "../../../../scripts/admin/editorial-recovery-capture.mjs";
import { EditorialDraftStore } from "./draft-store";
import { DirectPublisher } from "./direct-publisher";
import {
  collectRecoveryStores,
  collectRecoveryStoresV3,
  readRecoveryMediaV3,
} from "./recovery-storage";
import {
  canonicalRecoveryMetadata,
  writeRecoveryMediaContainer,
  type RecoveryMediaObject,
} from "../../../../scripts/admin/recovery-media-container.mjs";
import {
  openRecoveryCaptureV3,
  equalRecoverySchemasV3,
  copyRecoveryCaptureKey,
  type RecoveryCaptureV3Document,
  type RecoveryCaptureV3Context,
  type RecoveryCaptureV3Source,
} from "../../../../scripts/admin/recovery-capture-v3.mjs";
import { isRecoveryProviderSchema } from "./recovery-provider-schema";
import { recoveryApplicationSchema } from "./recovery-application-schema";

/** Not exported by the production Worker and never bound by production config.
 * A dedicated restore namespace stays suspended for its entire lifetime. */
export class SuspendedRecoveryTarget extends EditorialDraftStore {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    new DirectPublisher(ctx.storage, null);
    ctx.storage.sql.exec(
      "UPDATE editorial_recovery_control SET phase='suspended' WHERE singleton=1",
    );
    ctx.storage.sql
      .exec(`CREATE TABLE IF NOT EXISTS editorial_recovery_restore (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), phase TEXT NOT NULL,
      bundle_hash TEXT, evidence TEXT
    ); INSERT OR IGNORE INTO editorial_recovery_restore VALUES (1,'empty',NULL,NULL)`);
  }
  #phase(): string {
    return this.ctx.storage.sql
      .exec<{ phase: string }>(
        "SELECT phase FROM editorial_recovery_restore WHERE singleton=1",
      )
      .one().phase;
  }
  #ready(): void {
    if (this.#phase() !== "complete")
      throw new Error("recovery_target_unavailable");
  }
  override async alarm(): Promise<void> {
    // No reconciliation, retry, publication, or imported wake is executed.
    await this.ctx.storage.deleteAlarm();
  }
  override async get(...args: Parameters<EditorialDraftStore["get"]>) {
    this.#ready();
    return super.get(...args);
  }
  override async readMedia(
    ...args: Parameters<EditorialDraftStore["readMedia"]>
  ) {
    this.#ready();
    return super.readMedia(...args);
  }
  override async listWritingDrafts() {
    this.#ready();
    return super.listWritingDrafts();
  }
  override async listProjectDrafts() {
    this.#ready();
    return super.listProjectDrafts();
  }
  override async history(...args: Parameters<EditorialDraftStore["history"]>) {
    this.#ready();
    return super.history(...args);
  }
  override async historyPage(
    ...args: Parameters<EditorialDraftStore["historyPage"]>
  ) {
    this.#ready();
    return super.historyPage(...args);
  }
  override async conflict(
    ...args: Parameters<EditorialDraftStore["conflict"]>
  ) {
    this.#ready();
    return super.conflict(...args);
  }
  override async latestDirectPublication(
    ...args: Parameters<EditorialDraftStore["latestDirectPublication"]>
  ) {
    this.#ready();
    return super.latestDirectPublication(...args);
  }
  override async directPublicationStatus(
    ...args: Parameters<EditorialDraftStore["directPublicationStatus"]>
  ) {
    this.#ready();
    return super.directPublicationStatus(...args);
  }

  async recoveryStatus() {
    const row = this.ctx.storage.sql
      .exec<{ phase: string; bundle_hash: string | null }>(
        "SELECT phase,bundle_hash FROM editorial_recovery_restore WHERE singleton=1",
      )
      .one();
    return {
      ...row,
      mode: "isolated-suspended",
      alarmAt: await this.ctx.storage.getAlarm(),
    };
  }
  async installRecovery(serialized: string, timeoutMs = 20_000) {
    openRecoveryCapture(serialized);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000)
      throw new Error("recovery_timeout_range");
    const deadline = Date.now() + timeoutMs;
    let claimed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.#installRecovery(serialized, deadline, () => {
          claimed = true;
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("recovery_restore_timeout")),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      if (claimed)
        this.ctx.storage.sql.exec(
          "UPDATE editorial_recovery_restore SET phase='failed' WHERE singleton=1 AND phase='installing'",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async #installRecovery(
    serialized: string,
    deadline: number,
    claim: () => void,
  ) {
    // Complete format, integrity, reference, source and byte validation precedes
    // even the target's staged-install marker.
    const opened = openRecoveryCapture(serialized),
      snapshot = opened.snapshot;
    const bindings = this.env as {
      RECOVERY_CONTENT_DB?: PublicationDatabase;
      RECOVERY_CONTENT_MEDIA?: R2Bucket;
      RECOVERY_APPLICATION_REVISION?: string;
    };
    const db = bindings.RECOVERY_CONTENT_DB,
      bucket = bindings.RECOVERY_CONTENT_MEDIA;
    if (
      !db ||
      !bucket ||
      snapshot.applicationRevision !== bindings.RECOVERY_APPLICATION_REVISION
    )
      throw new Error("recovery_target_identity");
    if (
      this.#phase() !== "empty" ||
      (await this.ctx.storage.getAlarm()) !== null
    )
      throw new Error("recovery_target_not_empty");
    for (const table of Object.keys(RECOVERY_TABLES.editorial))
      if (
        this.ctx.storage.sql
          .exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)
          .one().n !== 0
      )
        throw new Error("recovery_target_not_empty");
    if (
      (await this.ctx.storage.list({ limit: 1 })).size ||
      (await bucket.list({ limit: 1 })).objects.length
    )
      throw new Error("recovery_target_not_empty");
    const before = await collectRecoveryStores(
      this.ctx.storage,
      db,
      bucket,
      snapshot.applicationRevision,
    );
    for (const [table, rows] of Object.entries(
      before.snapshot.content.tables,
    )) {
      if (
        table === "editorial_published_inventory"
          ? rows.length !== 1 ||
            rows[0]!.singleton !== 1 ||
            rows[0]!.version !== 0
          : rows.length !== 0
      )
        throw new Error("recovery_target_not_empty");
    }
    // Install only into code-owned schemas, never execute SQL from an export.
    const canonical = (rows: SqlRow[], store: "editorial" | "content") =>
      JSON.stringify(
        rows
          .filter(
            (row) =>
              row.name !== "editorial_recovery_restore" &&
              !isRecoveryProviderSchema(row, store),
          )
          .map((row) => ({
            ...row,
            sql: recoveryApplicationSchema(row, store) ?? row.sql,
          })),
      );
    if (
      canonical(before.schemas.editorial, "editorial") !==
        canonical(opened.evidence.schemas.editorial, "editorial") ||
      canonical(before.schemas.content, "content") !==
        canonical(opened.evidence.schemas.content, "content")
    )
      throw new Error("recovery_target_schema");
    this.ctx.storage.transactionSync(() => {
      // Async preflight can interleave with another install. Exactly one caller
      // claims the empty target before any provider writes.
      if (Date.now() >= deadline) throw new Error("recovery_restore_timeout");
      if (this.#phase() !== "empty")
        throw new Error("recovery_target_not_empty");
      this.ctx.storage.sql.exec(
        "UPDATE editorial_recovery_restore SET phase='installing',bundle_hash=?,evidence=? WHERE singleton=1",
        opened.sha256,
        JSON.stringify({
          evidence: opened.evidence,
          applicationRevision: snapshot.applicationRevision,
          contentSchemaVersion: snapshot.contentSchemaVersion,
          originalAlarmAt: snapshot.editorial.alarmAt,
        }),
      );
      claim();
    });
    const token = crypto.randomUUID();
    try {
      const frozen = await db.batch<SqlRow>([
        db
          .prepare(
            "UPDATE editorial_recovery_control SET phase='suspended',capture_id=? WHERE singleton=1 AND phase='open' AND NOT EXISTS(SELECT 1 FROM editorial_recovery_writers)",
          )
          .bind(token),
        db.prepare(
          "SELECT phase,capture_id FROM editorial_recovery_control WHERE singleton=1",
        ),
      ]);
      if (
        frozen.some((row) => !row.success) ||
        frozen[0]?.meta?.changes !== 1 ||
        frozen[1]?.results[0]?.capture_id !== token
      )
        throw new Error("recovery_target_fence");
      for (const media of snapshot.publicMedia) {
        if (Date.now() >= deadline || this.#phase() !== "installing")
          throw new Error("recovery_restore_timeout");
        const metadata = opened.evidence.objects.find(
          (object) => object.key === media.key,
        );
        if (!metadata) throw new Error("recovery_object_metadata");
        const httpMetadata: R2HTTPMetadata = {};
        for (const [key, value] of Object.entries(metadata.httpMetadata)) {
          if (key === "cacheExpiry") httpMetadata.cacheExpiry = new Date(value);
          else if (
            [
              "contentType",
              "contentLanguage",
              "contentDisposition",
              "contentEncoding",
              "cacheControl",
            ].includes(key)
          )
            Object.assign(httpMetadata, { [key]: value });
          else throw new Error("recovery_object_metadata");
        }
        const raw = Buffer.from(media.base64, "base64");
        await bucket.put(media.key, raw, {
          sha256: createHash("sha256").update(raw).digest("hex"),
          httpMetadata,
          customMetadata: metadata.customMetadata,
        });
        const saved = await bucket.get(media.key);
        if (
          !saved ||
          saved.size !== raw.length ||
          createHash("sha256")
            .update(new Uint8Array(await saved.arrayBuffer()))
            .digest("hex") !== media.key.split(".")[0]
        )
          throw new Error("recovery_object_write_unconfirmed");
      }
      this.ctx.storage.transactionSync(() => {
        for (const [table, definition] of Object.entries(
          RECOVERY_TABLES.editorial,
        )) {
          const names = Object.keys(definition);
          for (const row of snapshot.editorial.tables[table]!)
            this.ctx.storage.sql.exec(
              `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
              ...names.map((name) => row[name]!),
            );
        }
      });
      for (const entry of snapshot.editorial.kv)
        await this.ctx.storage.put(
          entry.key,
          entry.encoding === "base64"
            ? new Uint8Array(Buffer.from(String(entry.value), "base64"))
            : entry.value,
        );
      // Opening the D1 write guard happens only inside this single transaction.
      // No normal writer can be admitted between open, imports and suspension.
      const statements = [
        db
          .prepare(
            "UPDATE editorial_recovery_control SET phase='open' WHERE singleton=1 AND phase='suspended' AND capture_id=?",
          )
          .bind(token),
        // SQL error inside D1.batch rolls the whole transaction back if the
        // suspension CAS did not succeed. An after-the-batch JS check cannot.
        db.prepare(
          "SELECT CASE WHEN changes()=1 THEN 1 ELSE json('recovery_restore_fence_lost') END AS fence_asserted",
        ),
        db.prepare("DELETE FROM editorial_published_inventory"),
      ];
      for (const [table, definition] of Object.entries(
        RECOVERY_TABLES.content,
      )) {
        const names = Object.keys(definition);
        for (const row of snapshot.content.tables[table]!)
          statements.push(
            db
              .prepare(
                `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
              )
              .bind(...names.map((name) => row[name]!)),
          );
      }
      statements.push(
        db
          .prepare(
            "UPDATE editorial_recovery_control SET phase='suspended' WHERE singleton=1 AND capture_id=?",
          )
          .bind(token),
      );
      const result = await db.batch(statements);
      if (result.some((row) => !row.success) || result[0]?.meta?.changes !== 1)
        throw new Error("recovery_database_write_unconfirmed");
      const restored = await collectRecoveryStores(
        this.ctx.storage,
        db,
        bucket,
        snapshot.applicationRevision,
      );
      // Original alarm is preserved in integrity-checked evidence, never armed.
      restored.snapshot.editorial.alarmAt = snapshot.editorial.alarmAt;
      if (
        exportOfflineRecovery(restored.snapshot) !==
        exportOfflineRecovery(snapshot)
      )
        throw new Error("recovery_restore_comparison");
      const applicationMetadata = (objects: typeof restored.objects) =>
        JSON.stringify(
          objects
            .map((object) => ({
              key: object.key,
              http: Object.entries(object.httpMetadata).sort(),
              custom: Object.entries(object.customMetadata).sort(),
            }))
            .sort((a, b) => a.key.localeCompare(b.key)),
        );
      if (
        applicationMetadata(restored.objects) !==
        applicationMetadata(opened.evidence.objects)
      )
        throw new Error("recovery_restore_metadata");
      if (Date.now() >= deadline || this.#phase() !== "installing")
        throw new Error("recovery_restore_timeout");
      this.ctx.storage.sql.exec(
        "UPDATE editorial_recovery_restore SET phase='complete' WHERE singleton=1",
      );
      return {
        mode: "isolated-suspended",
        sha256: opened.sha256,
        report: opened.report,
      };
    } catch (error) {
      this.ctx.storage.sql.exec(
        "UPDATE editorial_recovery_restore SET phase='failed' WHERE singleton=1",
      );
      throw error;
    }
  }
  /** Additive inactive restore. Complete first-pass validation occurs before
   * begin claims this dedicated namespace; it stays suspended on all failures. */
  async installRecoveryV3(
    source: RecoveryCaptureV3Source,
    key: Uint8Array,
    context: RecoveryCaptureV3Context,
    timeoutMs = 20_000,
  ) {
    const owned = copyRecoveryCaptureKey(key),
      identity = { ...context };
    const deadline = Date.now() + timeoutMs;
    let claimed = false;
    let document!: RecoveryCaptureV3Document;
    let db: PublicationDatabase | undefined, bucket: R2Bucket | undefined;
    let signal: AbortSignal;
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    let upload: Promise<R2Object | null> | undefined;
    let offset = 0;
    const check = () => {
      if (
        !signal ||
        signal.aborted ||
        Date.now() >= deadline ||
        this.#phase() !== "installing"
      )
        throw new Error("recovery_restore_timeout");
    };
    const http = (
      object: Extract<RecoveryMediaObject, { plane: "public" }>,
    ): R2HTTPMetadata => {
      const result: R2HTTPMetadata = {};
      for (const [name, value] of Object.entries(object.r2.httpMetadata))
        if (name === "cacheExpiry") result.cacheExpiry = new Date(value);
        else Object.assign(result, { [name]: value });
      return result;
    };
    try {
      const opened = await openRecoveryCaptureV3(
        source,
        owned,
        identity,
        {
          begin: async (value, receipt, currentSignal) => {
            document = value;
            signal = currentSignal;
            const snapshot = document.snapshot;
            const bundleHash = createHash("sha256")
              .update(canonicalRecoveryMetadata(receipt, 4096))
              .digest("hex");
            const bindings = this.env as {
              RECOVERY_CONTENT_DB?: PublicationDatabase;
              RECOVERY_CONTENT_MEDIA?: R2Bucket;
              RECOVERY_APPLICATION_REVISION?: string;
            };
            db = bindings.RECOVERY_CONTENT_DB;
            bucket = bindings.RECOVERY_CONTENT_MEDIA;
            if (
              !db ||
              !bucket ||
              snapshot.applicationRevision !==
                bindings.RECOVERY_APPLICATION_REVISION
            )
              throw new Error("recovery_target_identity");
            if (
              this.#phase() !== "empty" ||
              (await this.ctx.storage.getAlarm()) !== null
            )
              throw new Error("recovery_target_not_empty");
            for (const table of Object.keys(RECOVERY_TABLES.editorial))
              if (
                this.ctx.storage.sql
                  .exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)
                  .one().n !== 0
              )
                throw new Error("recovery_target_not_empty");
            if (
              (await this.ctx.storage.list({ limit: 1 })).size ||
              (await bucket.list({ limit: 1 })).objects.length
            )
              throw new Error("recovery_target_not_empty");
            const before = await collectRecoveryStoresV3(
              this.ctx.storage,
              db,
              bucket,
              snapshot.applicationRevision,
            );
            for (const [table, rows] of Object.entries(
              before.snapshot.content.tables,
            )) {
              if (
                table === "editorial_published_inventory"
                  ? rows.length !== 1 ||
                    rows[0]!.singleton !== 1 ||
                    rows[0]!.version !== 0
                  : rows.length !== 0
              )
                throw new Error("recovery_target_not_empty");
            }
            // Install only into code-owned schemas, never execute SQL from an export.
            const schemaRows = (
              rows: SqlRow[],
              store: "editorial" | "content",
            ) =>
              rows
                .filter(
                  (row) =>
                    row.name !== "editorial_recovery_restore" &&
                    !isRecoveryProviderSchema(row, store),
                )
                .map((row) => ({
                  ...row,
                  sql: recoveryApplicationSchema(row, store) ?? row.sql,
                }));
            if (
              !equalRecoverySchemasV3(
                schemaRows(before.schemas.editorial, "editorial"),
                schemaRows(document.evidence.schemas.editorial, "editorial"),
              ) ||
              !equalRecoverySchemasV3(
                schemaRows(before.schemas.content, "content"),
                schemaRows(document.evidence.schemas.content, "content"),
              )
            )
              throw new Error("recovery_target_schema");
            this.ctx.storage.transactionSync(() => {
              // Async preflight can interleave with another install. Exactly one caller
              // claims the empty target before any provider writes.
              if (signal.aborted || Date.now() >= deadline)
                throw new Error("recovery_restore_timeout");
              if (this.#phase() !== "empty")
                throw new Error("recovery_target_not_empty");
              this.ctx.storage.sql.exec(
                "UPDATE editorial_recovery_restore SET phase='installing',bundle_hash=?,evidence=? WHERE singleton=1",
                bundleHash,
                JSON.stringify({
                  evidence: document.evidence,
                  applicationRevision: snapshot.applicationRevision,
                  contentSchemaVersion: snapshot.contentSchemaVersion,
                  originalAlarmAt: snapshot.editorial.alarmAt,
                }),
              );
              claimed = true;
            });
            const token = crypto.randomUUID();
            const frozen = await db.batch<SqlRow>([
              db
                .prepare(
                  "UPDATE editorial_recovery_control SET phase='suspended',capture_id=? WHERE singleton=1 AND phase='open' AND NOT EXISTS(SELECT 1 FROM editorial_recovery_writers)",
                )
                .bind(token),
              db.prepare(
                "SELECT phase,capture_id FROM editorial_recovery_control WHERE singleton=1",
              ),
            ]);
            if (
              frozen.some((row) => !row.success) ||
              frozen[0]?.meta?.changes !== 1 ||
              frozen[1]?.results[0]?.capture_id !== token
            )
              throw new Error("recovery_target_fence");
            check();
            this.ctx.storage.transactionSync(() => {
              for (const [table, definition] of Object.entries(
                RECOVERY_TABLES.editorial,
              )) {
                const names = Object.keys(definition);
                for (const row of snapshot.editorial.tables[table]!)
                  this.ctx.storage.sql.exec(
                    `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
                    ...names.map((name) => row[name]!),
                  );
              }
            });
            for (const entry of snapshot.editorial.kv) {
              check();
              await this.ctx.storage.put(
                entry.key,
                entry.encoding === "base64"
                  ? new Uint8Array(Buffer.from(String(entry.value), "base64"))
                  : entry.value,
              );
            }
            check();
            // Opening the D1 write guard happens only inside this single transaction.
            // No normal writer can be admitted between open, imports and suspension.
            const statements = [
              db
                .prepare(
                  "UPDATE editorial_recovery_control SET phase='open' WHERE singleton=1 AND phase='suspended' AND capture_id=?",
                )
                .bind(token),
              // SQL error inside D1.batch rolls the whole transaction back if the
              // suspension CAS did not succeed. An after-the-batch JS check cannot.
              db.prepare(
                "SELECT CASE WHEN changes()=1 THEN 1 ELSE json('recovery_restore_fence_lost') END AS fence_asserted",
              ),
              db.prepare("DELETE FROM editorial_published_inventory"),
            ];
            for (const [table, definition] of Object.entries(
              RECOVERY_TABLES.content,
            )) {
              const names = Object.keys(definition);
              for (const row of snapshot.content.tables[table]!)
                statements.push(
                  db
                    .prepare(
                      `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
                    )
                    .bind(...names.map((name) => row[name]!)),
                );
            }
            statements.push(
              db
                .prepare(
                  "UPDATE editorial_recovery_control SET phase='suspended' WHERE singleton=1 AND capture_id=?",
                )
                .bind(token),
            );
            check();
            const result = await db.batch(statements);
            if (
              result.some((row) => !row.success) ||
              result[0]?.meta?.changes !== 1
            )
              throw new Error("recovery_database_write_unconfirmed");
          },
          writeFrame: async (frame, currentSignal) => {
            signal = currentSignal;
            check();
            const object = document.objects[frame.objectIndex]!;
            if (object.plane === "private") {
              await this.ctx.storage.put(
                `media:${object.id}:${frame.index}`,
                frame.bytes,
              );
            } else {
              if (frame.index === 0) {
                if (writer) throw new Error("recovery_media_order");
                const stream = new FixedLengthStream(object.size);
                writer = stream.writable.getWriter();
                upload = bucket!.put(object.id, stream.readable, {
                  sha256: object.id.split(".")[0],
                  httpMetadata: http(object),
                  customMetadata: object.r2.customMetadata,
                });
                void upload.catch(() => {});
                offset = 0;
              }
              await writer!.write(frame.bytes);
              check();
              offset += frame.bytes.byteLength;
              if (offset === object.size) {
                await writer!.close();
                check();
                await upload;
                check();
                writer!.releaseLock();
                writer = undefined;
                upload = undefined;
              }
            }
            check();
          },
          complete: async (currentSignal) => {
            signal = currentSignal;
            check();
            if (writer) throw new Error("recovery_media_truncated");
            const restored = await collectRecoveryStoresV3(
              this.ctx.storage,
              db!,
              bucket!,
              document.snapshot.applicationRevision,
            );
            check();
            restored.snapshot.editorial.alarmAt =
              document.snapshot.editorial.alarmAt;
            const canonical = (value: unknown) =>
              canonicalRecoveryMetadata(value, 4 * 1024 * 1024);
            if (canonical(restored.snapshot) !== canonical(document.snapshot))
              throw new Error("recovery_restore_comparison");
            const applicationInventory = (
              objects: readonly RecoveryMediaObject[],
            ) =>
              objects.map((object) => ({
                plane: object.plane,
                id: object.id,
                type: object.type,
                size: object.size,
                ...(object.plane === "public"
                  ? {
                      httpMetadata: object.r2.httpMetadata,
                      customMetadata: object.r2.customMetadata,
                    }
                  : {}),
              }));
            if (
              canonical(applicationInventory(restored.media)) !==
              canonical(applicationInventory(document.objects))
            )
              throw new Error("recovery_restore_metadata");
            await writeRecoveryMediaContainer(
              { objects: restored.media, evidence: null },
              (object) =>
                readRecoveryMediaV3(this.ctx.storage, bucket!, object),
              {
                writeFrame() {
                  check();
                },
                writeManifest() {
                  check();
                },
                abort() {},
              },
            );
            check();
            // The visibility marker follows successful codec return, including
            // its post-ack revocation/deadline check.
          },
          abort: () => {
            if (writer) void writer.abort().catch(() => {});
            if (claimed)
              this.ctx.storage.sql.exec(
                "UPDATE editorial_recovery_restore SET phase='failed' WHERE singleton=1 AND phase='installing'",
              );
          },
        },
        { timeoutMs },
      );
      check();
      this.ctx.storage.sql.exec(
        "UPDATE editorial_recovery_restore SET phase='complete' WHERE singleton=1 AND phase='installing'",
      );
      return {
        mode: "isolated-suspended" as const,
        sha256: opened.sha256,
        report: opened.report,
      };
    } catch (error) {
      if (claimed)
        this.ctx.storage.sql.exec(
          "UPDATE editorial_recovery_restore SET phase='failed' WHERE singleton=1 AND phase='installing'",
        );
      throw error;
    } finally {
      owned.fill(0);
    }
  }
}
