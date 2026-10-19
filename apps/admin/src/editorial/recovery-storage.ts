import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";
import {
  freezeRecoveryDatabase,
  assertRecoveryDatabaseFrozen,
} from "@anipotts/content/editorial/recovery-fence";
import {
  RECOVERY_SCHEMA,
  RECOVERY_TABLES,
} from "../../../../scripts/admin/editorial-recovery.mjs";
import {
  sealRecoveryCapture,
  CAPTURE_BYTE_LIMIT,
  type SqlRow,
  type RecoveryEvidence,
  type RecoverySnapshot,
} from "../../../../scripts/admin/editorial-recovery-capture.mjs";
import { RecoveryCoordinator } from "./recovery-coordinator";
import RECOVERY_SCHEMA_FINGERPRINTS from "./recovery-schema.json";

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
      ? ["_cf_KV", "editorial_recovery_restore"]
      : ["d1_migrations"]),
  ]);
  const expected: Readonly<Record<string, string>> =
    RECOVERY_SCHEMA_FINGERPRINTS[store];
  for (const name of Object.keys(expected))
    if (!schema.some((row) => row.name === name))
      throw new Error("capture_schema_drift");
  for (const row of schema) {
    const fingerprint = expected[String(row.name)];
    if (fingerprint) {
      const actual = createHash("sha256")
        .update(String(row.sql).replace(/\s+/g, " ").trim())
        .digest("hex");
      if (actual !== fingerprint) throw new Error("capture_schema_drift");
    } else if (row.type !== "table") throw new Error("capture_schema_drift");
    if (
      row.type === "table" &&
      !String(row.name).startsWith("sqlite_") &&
      !allowed.has(String(row.name))
    )
      throw new Error("capture_unknown_store");
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
): Promise<{
  snapshot: RecoverySnapshot;
  schemas: RecoveryEvidence["schemas"];
  objects: RecoveryEvidence["objects"];
  migrationLedger: SqlRow[];
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
  let after: string | undefined;
  for (;;) {
    const page = await storage.list<unknown>({
      limit: 8,
      ...(after ? { startAfter: after } : {}),
    });
    for (const [key, value] of page) {
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
      if (object.size > CAPTURE_BYTE_LIMIT / 2 - size)
        throw new Error("capture_byte_limit");
      const current = await bucket.get(object.key);
      if (
        !current ||
        current.etag !== object.etag ||
        current.size !== object.size
      )
        throw new Error("capture_object_changed");
      const raw = new Uint8Array(await current.arrayBuffer());
      if (
        raw.byteLength !== object.size ||
        createHash("sha256").update(raw).digest("hex") !==
          object.key.split(".")[0]
      )
        throw new Error("capture_media_hash");
      const httpMetadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(current.httpMetadata ?? {}))
        httpMetadata[key] =
          value instanceof Date ? value.toISOString() : String(value);
      const metadata = {
        key: object.key,
        etag: object.etag,
        version: current.version,
        uploaded: current.uploaded.toISOString(),
        httpMetadata,
        customMetadata: current.customMetadata ?? {},
      };
      const media = {
        key: object.key,
        type: current.httpMetadata?.contentType ?? "",
        base64: Buffer.from(raw).toString("base64"),
      };
      account(media);
      account(metadata);
      publicMedia.push(media);
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
  return {
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
  };
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
  const deadline = Date.now() + timeoutMs;
  const coordinator = new RecoveryCoordinator(storage),
    captureId = crypto.randomUUID();
  // A scheduled wake within the capture window cannot be called quiescent:
  // alarm delivery/retry metadata is provider-managed. Require a quiet window
  // instead of deleting or silently changing the source's wake.
  const alarmAt = await storage.getAlarm();
  if (alarmAt !== null && alarmAt <= deadline)
    throw new Error("capture_alarm_window");
  const editorialGeneration = await coordinator.drain(
    captureId,
    Math.min(timeoutMs, 10_000),
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
    return sealRecoveryCapture(collected.snapshot, {
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
      },
    });
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
