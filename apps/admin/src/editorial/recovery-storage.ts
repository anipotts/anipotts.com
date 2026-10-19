import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";
import {
  freezeRecoveryDatabase,
  assertRecoveryDatabaseFrozen,
  releaseRecoveryDatabase,
  recoveryEnrolled,
} from "@anipotts/content/editorial/recovery-fence";
import {
  RECOVERY_SCHEMA,
  RECOVERY_TABLES,
} from "../../../../scripts/admin/editorial-recovery.mjs";
import {
  sealRecoveryCapture,
  openRecoveryCapture,
  serializeRecoveryR2HttpMetadata,
  CAPTURE_BYTE_LIMIT,
  type SqlRow,
  type RecoveryEvidence,
  type RecoverySnapshot,
} from "../../../../scripts/admin/editorial-recovery-capture.mjs";
import {
  RECOVERY_CAPTURE_V3_FORMAT,
  copyRecoveryCaptureKey,
  sealRecoveryCaptureV3,
  openRecoveryCaptureV3,
  type RecoveryCaptureV3Document,
  type RecoveryCaptureV3Context,
  type RecoveryCaptureV3Sink,
  type RecoveryCaptureV3Source,
} from "../../../../scripts/admin/recovery-capture-v3.mjs";
import type { RecoveryMediaObject } from "../../../../scripts/admin/recovery-media-container.mjs";
import { RecoveryCoordinator } from "./recovery-coordinator";
import { assertRecoveryWriterCohort } from "./recovery-eligibility";
import RECOVERY_SCHEMA_FINGERPRINTS from "./recovery-schema.json";
import { recoveryApplicationSchema } from "./recovery-application-schema";
import { isRecoveryProviderSchema } from "./recovery-provider-schema";

const maxEntries = 5000;
const controlTables = [
  "editorial_recovery_control",
  "editorial_recovery_writers",
];
function count(value: number) {
  if (value > maxEntries) throw new Error("capture_entry_limit");
}
function columns(rows: SqlRow[], definition: Readonly<Record<string, string>>) {
  if (
    rows
      .map((row) => row.name)
      .sort()
      .join("|") !== Object.keys(definition).sort().join("|")
  )
    throw new Error("capture_schema_drift");
  for (const row of rows)
    if (
      String(row.type).toLowerCase() !==
      definition[String(row.name)]!.replace("?", "")
    )
      throw new Error("capture_schema_drift");
}
function checkTables(schema: SqlRow[], store: "editorial" | "content") {
  const allowed = new Set([
    ...Object.keys(RECOVERY_TABLES[store]),
    ...controlTables,
    ...(store === "editorial"
      ? ["editorial_recovery_restore", "editorial_recovery_captures"]
      : ["d1_migrations"]),
  ]);
  const expected: Readonly<Record<string, string>> =
    RECOVERY_SCHEMA_FINGERPRINTS[store];
  for (const name of Object.keys(expected))
    if (!schema.some((row) => row.name === name))
      throw new Error("capture_schema_drift");
  for (const row of schema) {
    if (isRecoveryProviderSchema(row, store)) continue;
    const fingerprint = recoveryApplicationSchema(row, store);
    if (!fingerprint && row.type !== "table")
      throw new Error("capture_schema_drift");
    if (
      row.type === "table" &&
      !String(row.name).startsWith("sqlite_") &&
      !allowed.has(String(row.name))
    )
      throw new Error(`capture_unknown_store:${store}:${String(row.name)}`);
  }
  for (const table of Object.keys(RECOVERY_TABLES[store]))
    if (!schema.some((row) => row.name === table && row.type === "table"))
      throw new Error("capture_missing_store");
}

/** Collectors read actual binding interfaces, never fabricated completeness flags.
 * Call only under the admission/drain protocol below or a dedicated suspended target. */
export async function collectRecoveryStores(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  bucket: R2Bucket,
  applicationRevision: string,
  streamed = false,
): Promise<{
  media: RecoveryMediaObject[];
  snapshot: RecoverySnapshot;
  schemas: RecoveryEvidence["schemas"];
  objects: RecoveryEvidence["objects"];
  migrationLedger: SqlRow[];
  captures: SqlRow[];
}> {
  let size = 0,
    entries = 0;
  const account = (value: unknown) => {
    size += Buffer.byteLength(JSON.stringify(value));
    if (size > CAPTURE_BYTE_LIMIT / 2) throw new Error("capture_byte_limit");
  };
  // Bound result allocation before SELECT *. Limits apply to the entire
  // captured store, not merely each materialized page.
  let estimated = 0,
    totalRows = 0;
  for (const [store, definitions] of Object.entries(RECOVERY_TABLES))
    for (const [table, definition] of Object.entries(definitions)) {
      const width = Object.entries(definition)
        .map(([column, type]) =>
          type.startsWith("text")
            ? `coalesce(length(CAST(${column} AS BLOB)),0)+64`
            : "24",
        )
        .join("+");
      const sql = `SELECT count(*) AS n,coalesce(sum(${width}),0) AS bytes FROM ${table}`;
      const value =
        store === "editorial"
          ? storage.sql.exec<{ n: number; bytes: number }>(sql).one()
          : await db.prepare(sql).first<{ n: number; bytes: number }>();
      if (!value) throw new Error("capture_database_read");
      totalRows += value.n;
      estimated += value.bytes;
      count(totalRows);
      if (estimated > CAPTURE_BYTE_LIMIT / 2)
        throw new Error("capture_byte_limit");
    }
  for (const store of ["editorial", "content"] as const) {
    const sql =
      "SELECT count(*) AS n,coalesce(sum(length(CAST(sql AS BLOB))),0) AS bytes FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'";
    const value =
      store === "editorial"
        ? storage.sql.exec<{ n: number; bytes: number }>(sql).one()
        : await db.prepare(sql).first<{ n: number; bytes: number }>();
    if (!value || value.n > 128 || value.bytes > CAPTURE_BYTE_LIMIT / 4)
      throw new Error("capture_schema_limit");
  }
  const editorialSchema = storage.sql
    .exec<SqlRow>(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .toArray();
  const queries = [
    db.prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    ),
    ...Object.keys(RECOVERY_TABLES.content).flatMap((table) => [
      db.prepare(`PRAGMA table_info(${table})`),
      db.prepare(
        `SELECT * FROM ${table} ORDER BY rowid LIMIT ${maxEntries + 1}`,
      ),
    ]),
  ];
  const result = await db.batch<SqlRow>(queries);
  if (result.some((row) => !row.success))
    throw new Error("capture_database_read");
  const contentSchema = result[0]!.results;
  checkTables(editorialSchema, "editorial");
  checkTables(contentSchema, "content");
  const editorialTables: Record<string, SqlRow[]> = {},
    contentTables: Record<string, SqlRow[]> = {};
  for (const [table, definition] of Object.entries(RECOVERY_TABLES.editorial)) {
    columns(
      storage.sql.exec<SqlRow>(`PRAGMA table_info(${table})`).toArray(),
      definition,
    );
    const rows = storage.sql
      .exec<SqlRow>(
        `SELECT * FROM ${table} ORDER BY rowid LIMIT ${maxEntries + 1}`,
      )
      .toArray();
    entries += rows.length;
    count(entries);
    account(rows);
    editorialTables[table] = rows;
  }
  Object.entries(RECOVERY_TABLES.content).forEach(
    ([table, definition], index) => {
      columns(result[index * 2 + 1]!.results, definition);
      const rows = result[index * 2 + 2]!.results;
      entries += rows.length;
      count(entries);
      account(rows);
      contentTables[table] = rows;
    },
  );
  const kv: RecoverySnapshot["editorial"]["kv"] = [];
  const media: RecoveryMediaObject[] = [],
    binary = new Map<string, number>();
  let after: string | undefined;
  for (;;) {
    const page = await storage.list<unknown>({
      limit: 8,
      ...(after ? { startAfter: after } : {}),
    });
    for (const [key, value] of page) {
      if (
        streamed &&
        (value instanceof Uint8Array || value instanceof ArrayBuffer)
      ) {
        if (value.byteLength < 1 || value.byteLength > 65536 || binary.has(key))
          throw new Error("capture_media_chunk");
        binary.set(key, value.byteLength);
        count(++entries);
        account(key);
        continue;
      }
      const entry =
        value instanceof Uint8Array || value instanceof ArrayBuffer
          ? {
              key,
              encoding: "base64",
              value: Buffer.from(
                value instanceof Uint8Array ? value : new Uint8Array(value),
              ).toString("base64"),
            }
          : { key, encoding: "json", value };
      kv.push(entry);
      account(entry);
      count(++entries);
    }
    if (page.size < 8) break;
    const next = [...page.keys()].at(-1)!;
    if (next === after) throw new Error("capture_cursor");
    after = next;
  }
  if (streamed) {
    for (const entry of kv)
      if (/^media:[a-f0-9]{64}\.(jpg|png|webp)$/u.test(entry.key)) {
        const metadata = entry.value as {
          id: string;
          type: "image/jpeg" | "image/png" | "image/webp";
          size: number;
        };
        if (
          !metadata ||
          !Number.isSafeInteger(metadata.size) ||
          metadata.size < 1 ||
          metadata.size > 10 * 1024 * 1024
        )
          throw new Error("capture_media_metadata");
        media.push({
          plane: "private",
          id: metadata.id,
          type: metadata.type,
          size: metadata.size,
        });
        for (
          let offset = 0, index = 0;
          offset < metadata.size;
          offset += 65536, index++
        ) {
          const key = `${entry.key}:${index}`;
          if (binary.get(key) !== Math.min(65536, metadata.size - offset))
            throw new Error("capture_media_chunk");
          binary.delete(key);
        }
      }
    if (binary.size) throw new Error("capture_unknown_binary");
  }
  const publicMedia: RecoverySnapshot["publicMedia"] = [],
    objects: RecoveryEvidence["objects"] = [];
  const cursors = new Set<string>(),
    ids = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await bucket.list({
      limit: 128,
      ...(cursor ? { cursor } : {}),
    });
    for (const object of page.objects) {
      if (
        !/^[a-f0-9]{64}\.(jpg|png|webp)$/u.test(object.key) ||
        ids.has(object.key)
      )
        throw new Error("capture_unknown_object");
      ids.add(object.key);
      count(++entries);
      if (
        object.size >
        (streamed ? 10 * 1024 * 1024 : CAPTURE_BYTE_LIMIT / 2 - size)
      )
        throw new Error("capture_byte_limit");
      const current = streamed
        ? await bucket.head(object.key)
        : await bucket.get(object.key);
      if (
        !current ||
        current.etag !== object.etag ||
        current.size !== object.size
      )
        throw new Error("capture_object_changed");
      const raw = streamed
        ? null
        : new Uint8Array(await (current as R2ObjectBody).arrayBuffer());
      if (
        raw &&
        (raw.byteLength !== object.size ||
          createHash("sha256").update(raw).digest("hex") !==
            object.key.split(".")[0])
      )
        throw new Error("capture_media_hash");
      const httpMetadata = serializeRecoveryR2HttpMetadata(
        current.httpMetadata ?? {},
      );
      const metadata = {
        key: object.key,
        etag: object.etag,
        version: current.version,
        uploaded: current.uploaded.toISOString(),
        httpMetadata,
        customMetadata: current.customMetadata ?? {},
      };
      const published = {
        key: object.key,
        type: current.httpMetadata?.contentType ?? "",
        base64: raw ? Buffer.from(raw).toString("base64") : "",
      };
      if (streamed)
        media.push({
          plane: "public",
          id: object.key,
          type: published.type as "image/jpeg" | "image/png" | "image/webp",
          size: object.size,
          r2: {
            etag: metadata.etag,
            version: metadata.version,
            uploaded: metadata.uploaded,
            httpMetadata: metadata.httpMetadata,
            customMetadata: metadata.customMetadata,
          },
        });
      else {
        account(published);
        publicMedia.push(published);
      }
      account(metadata);
      objects.push(metadata);
    }
    if (!page.truncated) break;
    if (!page.cursor || cursors.has(page.cursor))
      throw new Error("capture_cursor");
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  let migrationLedger: SqlRow[] = [];
  if (contentSchema.some((row) => row.name === "d1_migrations")) {
    const ledger = await db
      .prepare(
        `SELECT * FROM d1_migrations ORDER BY rowid LIMIT ${maxEntries + 1}`,
      )
      .all<SqlRow>();
    if (!ledger.success) throw new Error("capture_database_read");
    migrationLedger = ledger.results;
    entries += migrationLedger.length;
    count(entries);
    account(migrationLedger);
  }
  const captureInventory = storage.sql
    .exec<{ n: number; bytes: number }>(
      "SELECT count(*) AS n,coalesce(sum(length(capture_id)+length(sha256)+length(state)+64),0) AS bytes FROM editorial_recovery_captures",
    )
    .one();
  count(entries + captureInventory.n);
  if (captureInventory.bytes > CAPTURE_BYTE_LIMIT / 4)
    throw new Error("capture_byte_limit");
  const captures = storage.sql
    .exec<SqlRow>("SELECT * FROM editorial_recovery_captures ORDER BY rowid")
    .toArray();
  account(captures);
  return {
    media,
    snapshot: {
      schema: RECOVERY_SCHEMA,
      applicationRevision,
      contentSchemaVersion: 1,
      editorial: {
        tables: editorialTables,
        kv,
        alarmAt: await storage.getAlarm(),
      },
      content: { tables: contentTables },
      publicMedia,
    },
    schemas: { editorial: editorialSchema, content: contentSchema },
    objects,
    migrationLedger,
    captures,
  };
}

/** Eligibility/schema preflight is deliberately before source admission closes.
 * These reads do not prove quiescence; the later durable drain/freeze does. */
async function preflightRecoveryDatabase(
  db: PublicationDatabase,
): Promise<void> {
  if (!(await recoveryEnrolled(db)))
    throw new Error("recovery_fence_not_installed");
  const bounds = await db
    .prepare(
      "SELECT count(*) AS n,coalesce(sum(length(CAST(sql AS BLOB))),0) AS bytes FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
    )
    .first<{ n: number; bytes: number }>();
  if (!bounds || bounds.n > 128 || bounds.bytes > CAPTURE_BYTE_LIMIT / 4)
    throw new Error("capture_schema_limit");
  const schema = await db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all<SqlRow>();
  if (!schema.success) throw new Error("capture_database_read");
  checkTables(schema.results, "content");
  const pending = await db
    .prepare("SELECT count(*) AS n FROM editorial_recovery_writers")
    .first<{ n: number }>();
  if (!pending || pending.n !== 0)
    throw new Error("recovery_external_writers_unresolved");
}

export async function captureRecovery(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  bucket: R2Bucket,
  applicationRevision: string,
  timeoutMs = 20_000,
): Promise<string> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000)
    throw new Error("capture_timeout_range");
  assertRecoveryWriterCohort(db, bucket, applicationRevision);
  const deadline = Date.now() + timeoutMs;
  let preflightTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      preflightRecoveryDatabase(db),
      new Promise<never>((_resolve, reject) => {
        preflightTimer = setTimeout(
          () => reject(new Error("capture_timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(preflightTimer);
  }
  const coordinator = new RecoveryCoordinator(storage),
    captureId = crypto.randomUUID();
  // A scheduled wake within the capture window cannot be called quiescent:
  // alarm delivery/retry metadata is provider-managed. Require a quiet window
  // instead of deleting or silently changing the source's wake.
  const alarmAt = await storage.getAlarm();
  if (alarmAt !== null && alarmAt <= deadline)
    throw new Error("capture_alarm_window");
  if (Date.now() >= deadline) throw new Error("capture_timeout");
  const editorialGeneration = await coordinator.drain(
    captureId,
    Math.min(deadline - Date.now(), 10_000),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const contentGeneration = await freezeRecoveryDatabase(db, captureId);
    // No writer is admitted after either fence, and unresolved external writes
    // prevented freeze. Paginated object inventory therefore has a stable set.
    const collected = await collectRecoveryStores(
      storage,
      db,
      bucket,
      applicationRevision,
    );
    if (collected.snapshot.editorial.alarmAt !== alarmAt)
      throw new Error("capture_alarm_changed");
    coordinator.assertFrozen(captureId, editorialGeneration);
    await assertRecoveryDatabaseFrozen(db, captureId, contentGeneration);
    const editorial = storage.sql
      .exec<SqlRow>("SELECT * FROM editorial_recovery_control")
      .toArray();
    const content = await db
      .prepare("SELECT * FROM editorial_recovery_control")
      .all<SqlRow>();
    const editorialWriters = storage.sql
      .exec<SqlRow>("SELECT * FROM editorial_recovery_writers")
      .toArray();
    const contentWriters = await db
      .prepare("SELECT * FROM editorial_recovery_writers")
      .all<SqlRow>();
    if (
      editorialWriters.length ||
      !contentWriters.success ||
      contentWriters.results.length
    )
      throw new Error("capture_writers_unresolved");
    if (!content.success) throw new Error("capture_database_read");
    if (Date.now() >= deadline) throw new Error("capture_timeout");
    coordinator.assertFrozen(captureId, editorialGeneration);
    const serialized = sealRecoveryCapture(collected.snapshot, {
      captureId,
      editorialGeneration,
      contentGeneration,
      schemas: collected.schemas,
      objects: collected.objects,
      control: {
        editorial,
        content: content.results,
        editorialWriters,
        contentWriters: contentWriters.results,
        migrationLedger: collected.migrationLedger,
        captures: collected.captures,
      },
    });
    const verified = openRecoveryCapture(serialized);
    if (Date.now() >= deadline) throw new Error("capture_timeout");
    // This receipt is created after the sealed snapshot frontier. Prior journal
    // rows are already preserved in evidence; a new receipt cannot contain its
    // own artifact hash inside that same artifact.
    coordinator.qualify({
      captureId,
      editorialGeneration,
      contentGeneration,
      sha256: verified.sha256,
    });
    return serialized;
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("capture_timeout")),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } catch (error) {
    coordinator.block(captureId, editorialGeneration);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Explicit post-capture completion. No application snapshot is read here.
 * Each store verifies its own durable fence before reopening. D1 opens first;
 * an ambiguous response or crash leaves the DO unavailable, never auto-resumed.
 * The already validated artifact keeps its original frontier as edits resume. */
export async function completeRecovery(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  serialized: string,
  timeoutMs = 20_000,
): Promise<{ state: "released"; sha256: string }> {
  const opened = openRecoveryCapture(serialized);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000)
    throw new Error("recovery_timeout_range");
  const receipt = {
    captureId: opened.evidence.captureId,
    editorialGeneration: opened.evidence.editorialGeneration,
    contentGeneration: opened.evidence.contentGeneration,
    sha256: opened.sha256,
  };
  const coordinator = new RecoveryCoordinator(storage);
  coordinator.beginCompletion(receipt);
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await releaseRecoveryDatabase(
          db,
          receipt.captureId,
          receipt.contentGeneration,
        );
        if (Date.now() >= deadline)
          throw new Error("recovery_completion_timeout");
        coordinator.finishCompletion(receipt);
        return { state: "released" as const, sha256: receipt.sha256 };
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("recovery_completion_timeout")),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    coordinator.block(receipt.captureId, receipt.editorialGeneration);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Additive inactive collector: controls stay JSON-only; media are read again as
 * canonical bounded chunks under the existing durable source fence. */
export async function collectRecoveryStoresV3(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  bucket: R2Bucket,
  applicationRevision: string,
) {
  const collected = await collectRecoveryStores(
    storage,
    db,
    bucket,
    applicationRevision,
    true,
  );
  const { publicMedia: _legacy, ...snapshot } = collected.snapshot;
  return { ...collected, snapshot, media: collected.media };
}
export async function* readRecoveryMediaV3(
  storage: DurableObjectStorage,
  bucket: R2Bucket,
  object: RecoveryMediaObject,
) {
  for (
    let offset = 0, index = 0;
    offset < object.size;
    offset += 65536, index++
  ) {
    const length = Math.min(65536, object.size - offset);
    let bytes: Uint8Array;
    if (object.plane === "private") {
      const raw = await storage.get<Uint8Array | ArrayBuffer>(
        `media:${object.id}:${index}`,
      );
      if (
        !(raw instanceof Uint8Array || raw instanceof ArrayBuffer) ||
        raw.byteLength !== length
      )
        throw new Error("capture_media_chunk");
      bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    } else {
      const current = await bucket.get(object.id, {
        range: { offset, length },
        onlyIf: { etagMatches: object.r2.etag },
      });
      if (
        !current ||
        !("arrayBuffer" in current) ||
        current.etag !== object.r2.etag ||
        current.version !== object.r2.version ||
        current.size !== object.size ||
        !current.range ||
        !("length" in current.range) ||
        current.range.length !== length
      )
        throw new Error("capture_object_changed");
      bytes = new Uint8Array(await current.arrayBuffer());
      if (bytes.byteLength !== length) throw new Error("capture_media_chunk");
    }
    yield { index, bytes };
  }
}

/** No live enrollment is enabled. The same always-reject cohort gate runs before
 * source reads/fence changes. A caller supplies isolated artifact storage only. */
export async function captureRecoveryV3(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  bucket: R2Bucket,
  applicationRevision: string,
  key: Uint8Array,
  artifact: RecoveryCaptureV3Sink & { source: RecoveryCaptureV3Source },
  timeoutMs = 20_000,
) {
  const owned = copyRecoveryCaptureKey(key);
  try {
    return await captureRecoveryV3Owned(
      storage,
      db,
      bucket,
      applicationRevision,
      owned,
      artifact,
      timeoutMs,
    );
  } finally {
    owned.fill(0);
  }
}
async function captureRecoveryV3Owned(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  bucket: R2Bucket,
  applicationRevision: string,
  key: Uint8Array,
  artifact: RecoveryCaptureV3Sink & { source: RecoveryCaptureV3Source },
  timeoutMs = 20_000,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000)
    throw new Error("capture_timeout_range");
  assertRecoveryWriterCohort(db, bucket, applicationRevision);
  const deadline = Date.now() + timeoutMs;
  let preflightTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      preflightRecoveryDatabase(db),
      new Promise<never>((_resolve, reject) => {
        preflightTimer = setTimeout(
          () => reject(new Error("capture_timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(preflightTimer);
  }
  const coordinator = new RecoveryCoordinator(storage),
    captureId = crypto.randomUUID();
  // A scheduled wake within the capture window cannot be called quiescent:
  // alarm delivery/retry metadata is provider-managed. Require a quiet window
  // instead of deleting or silently changing the source's wake.
  const alarmAt = await storage.getAlarm();
  if (alarmAt !== null && alarmAt <= deadline)
    throw new Error("capture_alarm_window");
  if (Date.now() >= deadline) throw new Error("capture_timeout");
  const editorialGeneration = await coordinator.drain(
    captureId,
    Math.min(deadline - Date.now(), 10_000),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const revocation = new AbortController();
  const work = async () => {
    const contentGeneration = await freezeRecoveryDatabase(db, captureId);
    // No writer is admitted after either fence, and unresolved external writes
    // prevented freeze. Paginated object inventory therefore has a stable set.
    const collected = await collectRecoveryStoresV3(
      storage,
      db,
      bucket,
      applicationRevision,
    );
    if (collected.snapshot.editorial.alarmAt !== alarmAt)
      throw new Error("capture_alarm_changed");
    coordinator.assertFrozen(captureId, editorialGeneration);
    await assertRecoveryDatabaseFrozen(db, captureId, contentGeneration);
    const editorial = storage.sql
      .exec<SqlRow>("SELECT * FROM editorial_recovery_control")
      .toArray();
    const content = await db
      .prepare("SELECT * FROM editorial_recovery_control")
      .all<SqlRow>();
    const editorialWriters = storage.sql
      .exec<SqlRow>("SELECT * FROM editorial_recovery_writers")
      .toArray();
    const contentWriters = await db
      .prepare("SELECT * FROM editorial_recovery_writers")
      .all<SqlRow>();
    if (
      editorialWriters.length ||
      !contentWriters.success ||
      contentWriters.results.length
    )
      throw new Error("capture_writers_unresolved");
    if (!content.success) throw new Error("capture_database_read");
    if (Date.now() >= deadline) throw new Error("capture_timeout");
    coordinator.assertFrozen(captureId, editorialGeneration);
    const context: RecoveryCaptureV3Context = {
      captureId,
      applicationRevision,
      contentSchemaVersion: 1,
      editorialGeneration,
      contentGeneration,
    };
    const document: RecoveryCaptureV3Document = {
      format: RECOVERY_CAPTURE_V3_FORMAT,
      snapshot: collected.snapshot,
      objects: collected.media,
      evidence: {
        captureId,
        editorialGeneration,
        contentGeneration,
        schemas: collected.schemas,
        objects: collected.objects,
        control: {
          editorial,
          content: content.results,
          editorialWriters,
          contentWriters: contentWriters.results,
          migrationLedger: collected.migrationLedger,
          captures: collected.captures,
        },
      },
    };
    await sealRecoveryCaptureV3(
      document,
      (object) => readRecoveryMediaV3(storage, bucket, object),
      key,
      context,
      artifact,
      {
        timeoutMs: Math.max(1, deadline - Date.now()),
        signal: revocation.signal,
      },
    );
    const verified = await openRecoveryCaptureV3(
      artifact.source,
      key,
      context,
      { begin() {}, writeFrame() {}, complete() {}, abort() {} },
      {
        timeoutMs: Math.max(1, deadline - Date.now()),
        signal: revocation.signal,
      },
    );
    if (Date.now() >= deadline) throw new Error("capture_timeout");
    coordinator.assertFrozen(captureId, editorialGeneration);
    await assertRecoveryDatabaseFrozen(db, captureId, contentGeneration);
    if (Date.now() >= deadline) throw new Error("capture_timeout");
    // This receipt is created after the sealed snapshot frontier. Prior journal
    // rows are already preserved in evidence; a new receipt cannot contain its
    // own artifact hash inside that same artifact.
    coordinator.qualify({
      captureId,
      editorialGeneration,
      contentGeneration,
      sha256: verified.sha256,
    });
    return { context, receipt: verified.receipt, sha256: verified.sha256 };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            revocation.abort();
            reject(new Error("capture_timeout"));
          },
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } catch (error) {
    revocation.abort();
    coordinator.block(captureId, editorialGeneration);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function completeRecoveryV3(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  source: RecoveryCaptureV3Source,
  key: Uint8Array,
  context: RecoveryCaptureV3Context,
  timeoutMs = 20_000,
) {
  const owned = copyRecoveryCaptureKey(key);
  const identity = { ...context };
  try {
    return await completeRecoveryV3Owned(
      storage,
      db,
      source,
      owned,
      identity,
      timeoutMs,
    );
  } finally {
    owned.fill(0);
  }
}
async function completeRecoveryV3Owned(
  storage: DurableObjectStorage,
  db: PublicationDatabase,
  source: RecoveryCaptureV3Source,
  key: Uint8Array,
  context: RecoveryCaptureV3Context,
  timeoutMs = 20_000,
): Promise<{ state: "released"; sha256: string }> {
  const started = Date.now();
  const opened = await openRecoveryCaptureV3(
    source,
    key,
    context,
    { begin() {}, writeFrame() {}, complete() {}, abort() {} },
    { timeoutMs },
  );
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000)
    throw new Error("recovery_timeout_range");
  const receipt = {
    captureId: opened.document.evidence.captureId,
    editorialGeneration: opened.document.evidence.editorialGeneration,
    contentGeneration: opened.document.evidence.contentGeneration,
    sha256: opened.sha256,
  };
  const coordinator = new RecoveryCoordinator(storage);
  if (Date.now() >= started + timeoutMs)
    throw new Error("recovery_completion_timeout");
  coordinator.beginCompletion(receipt);
  const deadline = started + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await releaseRecoveryDatabase(
          db,
          receipt.captureId,
          receipt.contentGeneration,
        );
        if (Date.now() >= deadline)
          throw new Error("recovery_completion_timeout");
        coordinator.finishCompletion(receipt);
        return { state: "released" as const, sha256: receipt.sha256 };
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("recovery_completion_timeout")),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } catch (error) {
    coordinator.block(receipt.captureId, receipt.editorialGeneration);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
