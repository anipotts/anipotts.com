import { z } from "zod";
import { editorialRecordSchema, type EditorialRecord } from "./source.js";
import {
  assertContentSchemaVersion,
  contentSchemaVersionSchema,
  decodePublishedSnapshot,
  publicationOperationIdSchema as operationIdSchema,
  publicationSourceHash,
  publicationTimestampSchema,
  validatePublicationSource,
  PublicationContractError,
  type PublishedSnapshot,
} from "./publication-contract.js";
export type { PublishedSnapshot } from "./publication-contract.js";

export interface PublicationStatement {
  bind(...values: unknown[]): PublicationStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: boolean;
  }>;
}
export interface PublicationDatabase {
  prepare(sql: string): PublicationStatement;
  /** Must execute the statements as one serialized, rollback-on-error transaction (D1 batch). */
  batch<T = Record<string, unknown>>(
    statements: PublicationStatement[],
  ): Promise<{ results: T[]; success: boolean; meta?: { changes?: number } }[]>;
}
export const DIRECT_PUBLICATION_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS editorial_published_inventory (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version INTEGER NOT NULL CHECK(version >= 0))`,
  `INSERT OR IGNORE INTO editorial_published_inventory (singleton,version) VALUES (1,0)`,
  `CREATE TABLE IF NOT EXISTS editorial_published_revisions (
    publication_id TEXT PRIMARY KEY, record_kind TEXT NOT NULL, record_id TEXT NOT NULL,
    source TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
    source_sha256 TEXT NOT NULL, published_at TEXT NOT NULL, expected_publication_id TEXT, expected_inventory_version INTEGER NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS editorial_published_revisions_no_update
    BEFORE UPDATE ON editorial_published_revisions BEGIN
    SELECT RAISE(ABORT, 'published revisions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS editorial_published_revisions_no_delete
    BEFORE DELETE ON editorial_published_revisions BEGIN
    SELECT RAISE(ABORT, 'published revisions are immutable'); END`,
  `CREATE INDEX IF NOT EXISTS editorial_published_record_history ON editorial_published_revisions(record_kind, record_id, published_at)`,
  `CREATE TABLE IF NOT EXISTS editorial_published_active (
    record_kind TEXT NOT NULL, record_id TEXT NOT NULL, publication_id TEXT NOT NULL UNIQUE,
    PRIMARY KEY(record_kind, record_id),
    FOREIGN KEY(publication_id) REFERENCES editorial_published_revisions(publication_id)
  )`,
] as const;
/** Additive 0002. Applied once by the migration ledger, never during a request. */
export const DIRECT_PUBLICATION_CONTRACT_MIGRATION_SQL = [
  `ALTER TABLE editorial_published_revisions
    ADD COLUMN content_schema_version INTEGER NOT NULL DEFAULT 1
    CHECK(content_schema_version > 0)`,
] as const;
const inputSchema = z
  .object({
    contentSchemaVersion: contentSchemaVersionSchema,
    record: editorialRecordSchema,
    source: z.string(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    operationId: operationIdSchema,
    expectedPublicationId: operationIdSchema.nullable(),
    expectedInventoryVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    publishedAt: publicationTimestampSchema,
  })
  .strict();
export type DirectPublicationInput = z.infer<typeof inputSchema>;
type Row = {
  content_schema_version: number;
  publication_id: string;
  record_kind: string;
  record_id: string;
  source: string;
  revision: number;
  source_sha256: string;
  published_at: string;
  expected_publication_id: string | null;
  expected_inventory_version: number;
  active_record_kind?: string;
  active_record_id?: string;
};
async function snapshot(row: Row): Promise<PublishedSnapshot> {
  if (
    (row.active_record_kind !== undefined &&
      row.active_record_kind !== row.record_kind) ||
    (row.active_record_id !== undefined &&
      row.active_record_id !== row.record_id)
  )
    throw new PublicationContractError("invalid_published_snapshot");
  return decodePublishedSnapshot({
    contentSchemaVersion: row.content_schema_version,
    publicationId: row.publication_id,
    record: {
      kind: row.record_kind,
      id: row.record_id,
    },
    source: row.source,
    revision: row.revision,
    sourceSha256: row.source_sha256,
    publishedAt: row.published_at,
  });
}
export type DirectPublicationResult =
  | { status: "published" | "replayed"; publication: PublishedSnapshot }
  | { status: "conflict" | "idempotency_conflict" };

/** Only call after explicit publication approval. This DB must never receive draft-only source.
 * Rollback is a fresh approved publication of historical source, with a new operation ID and CAS.
 */
export async function publishDirect(
  db: PublicationDatabase,
  input: DirectPublicationInput,
): Promise<DirectPublicationResult> {
  assertContentSchemaVersion(input?.contentSchemaVersion);
  const value = inputSchema.parse(input);
  validatePublicationSource(
    value.record,
    value.source,
    value.contentSchemaVersion,
  );
  const hash = await publicationSourceHash(value.source);
  const { kind, id } = value.record;
  const results = await db.batch<Row>([
    db
      .prepare(
        `INSERT INTO editorial_published_revisions
      (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_publication_id,expected_inventory_version,content_schema_version)
      SELECT ?,?,?,?,?,?,?,?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM editorial_published_revisions WHERE publication_id = ?)
      AND (SELECT version FROM editorial_published_inventory WHERE singleton = 1) = ?
      AND (SELECT publication_id FROM editorial_published_active WHERE record_kind = ? AND record_id = ?) IS ?`,
      )
      .bind(
        value.operationId,
        kind,
        id,
        value.source,
        value.revision,
        hash,
        value.publishedAt,
        value.expectedPublicationId,
        value.expectedInventoryVersion,
        value.contentSchemaVersion,
        value.operationId,
        value.expectedInventoryVersion,
        kind,
        id,
        value.expectedPublicationId,
      ),
    db
      .prepare(
        `INSERT INTO editorial_published_active (record_kind,record_id,publication_id)
      SELECT ?,?,? WHERE changes() = 1
      ON CONFLICT(record_kind,record_id) DO UPDATE SET publication_id = excluded.publication_id`,
      )
      .bind(kind, id, value.operationId),
    db.prepare(
      "UPDATE editorial_published_inventory SET version = version + 1 WHERE singleton = 1 AND changes() = 1",
    ),
    db
      .prepare(
        "SELECT * FROM editorial_published_revisions WHERE publication_id = ?",
      )
      .bind(value.operationId),
  ]);
  if (results.length !== 4 || results.some((result) => !result.success))
    throw new Error("publication_transaction_failed");
  const row = results[3]!.results[0];
  if (!row) return { status: "conflict" };
  if (
    row.record_kind !== kind ||
    row.content_schema_version !== value.contentSchemaVersion ||
    row.record_id !== id ||
    row.source !== value.source ||
    row.revision !== value.revision ||
    row.source_sha256 !== hash ||
    row.expected_publication_id !== value.expectedPublicationId ||
    row.expected_inventory_version !== value.expectedInventoryVersion
  )
    return { status: "idempotency_conflict" };
  const changed = results[0]!.meta?.changes;
  if (changed !== 0 && changed !== 1)
    throw new Error("publication_transaction_unconfirmed");
  if (
    results[1]!.meta?.changes !== changed ||
    results[2]!.meta?.changes !== changed
  )
    throw new Error("publication_pointer_unconfirmed");
  return {
    status: changed === 1 ? "published" : "replayed",
    publication: await snapshot(row),
  };
}
export async function getPublished(
  db: Pick<PublicationDatabase, "prepare">,
  record: EditorialRecord,
): Promise<PublishedSnapshot | null> {
  const { kind, id } = editorialRecordSchema.parse(record);
  const row = await db
    .prepare(
      `SELECT r.*, a.record_kind AS active_record_kind, a.record_id AS active_record_id FROM editorial_published_active a LEFT JOIN editorial_published_revisions r ON r.publication_id = a.publication_id WHERE a.record_kind = ? AND a.record_id = ?`,
    )
    .bind(kind, id)
    .first<Row>();
  return row ? snapshot(row) : null;
}
export async function listPublished(
  db: Pick<PublicationDatabase, "prepare">,
): Promise<PublishedSnapshot[]> {
  const result = await db
    .prepare(
      `SELECT r.*, a.record_kind AS active_record_kind, a.record_id AS active_record_id FROM editorial_published_active a LEFT JOIN editorial_published_revisions r ON r.publication_id = a.publication_id ORDER BY a.record_kind, a.record_id`,
    )
    .all<Row>();
  if (!result.success) throw new Error("publication_read_failed");
  return Promise.all(result.results.map(snapshot));
}
export async function listPublicationHistory(
  db: Pick<PublicationDatabase, "prepare">,
  record: EditorialRecord,
): Promise<PublishedSnapshot[]> {
  const { kind, id } = editorialRecordSchema.parse(record);
  const result = await db
    .prepare(
      // Order by activation sequence, not by the timestamp text. published_at
      // accepts a UTC offset, so a textual sort can invert two publications
      // that are minutes apart, and equal timestamps would otherwise fall back
      // to an arbitrary operation id. Every committed publication consumes
      // exactly one inventory version, so expected_inventory_version is the
      // strictly increasing publication sequence for this database.
      `SELECT * FROM editorial_published_revisions WHERE record_kind = ? AND record_id = ? ORDER BY expected_inventory_version DESC, publication_id DESC`,
    )
    .bind(kind, id)
    .all<Row>();
  if (!result.success) throw new Error("publication_read_failed");
  return Promise.all(result.results.map(snapshot));
}

/** Authorized publisher retry lookup; does not mutate or reactivate an old publication. */
export async function getPublicationByOperation(
  db: Pick<PublicationDatabase, "prepare">,
  operationId: string,
): Promise<PublishedSnapshot | null> {
  operationIdSchema.parse(operationId);
  const row = await db
    .prepare(
      "SELECT * FROM editorial_published_revisions WHERE publication_id = ?",
    )
    .bind(operationId)
    .first<Row>();
  return row ? snapshot(row) : null;
}
/** One atomic read transaction pins version and public inventory for whole-snapshot validation. */
export async function getPublishedInventory(
  db: PublicationDatabase,
): Promise<{ version: number; publications: PublishedSnapshot[] }> {
  const result = await db.batch<Row & { version: number }>([
    db.prepare(
      "SELECT version FROM editorial_published_inventory WHERE singleton = 1",
    ),
    db.prepare(
      "SELECT r.*, a.record_kind AS active_record_kind, a.record_id AS active_record_id FROM editorial_published_active a LEFT JOIN editorial_published_revisions r ON r.publication_id = a.publication_id ORDER BY a.record_kind, a.record_id",
    ),
  ]);
  const version = result[0]?.results[0]?.version;
  if (
    result.length !== 2 ||
    result.some((row) => !row.success) ||
    !Number.isSafeInteger(version) ||
    version! < 0
  )
    throw new Error("publication_read_failed");
  return {
    version: version!,
    publications: await Promise.all(result[1]!.results.map(snapshot)),
  };
}

/** The inventory counter alone: one single-row read, no sources. Every
 * activation increments it, so a reader can answer a revalidation without
 * loading or rendering the publications behind it. */
export async function getPublishedInventoryVersion(
  db: Pick<PublicationDatabase, "prepare">,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT version FROM editorial_published_inventory WHERE singleton = 1",
    )
    .first<{ version: number }>();
  const version = row?.version;
  if (!Number.isSafeInteger(version) || version! < 0)
    throw new Error("publication_read_failed");
  return version!;
}

export async function getDirectReceipt(
  db: Pick<PublicationDatabase, "prepare">,
  operationId: string,
): Promise<
  | (PublishedSnapshot & {
      expectedPublicationId: string | null;
      expectedInventoryVersion: number;
    })
  | null
> {
  operationIdSchema.parse(operationId);
  const row = await db
    .prepare(
      "SELECT * FROM editorial_published_revisions WHERE publication_id = ?",
    )
    .bind(operationId)
    .first<Row>();
  if (
    row &&
    (!operationIdSchema.nullable().safeParse(row.expected_publication_id)
      .success ||
      !Number.isSafeInteger(row.expected_inventory_version) ||
      row.expected_inventory_version < 0 ||
      row.expected_inventory_version >= Number.MAX_SAFE_INTEGER)
  )
    throw new PublicationContractError("invalid_published_snapshot");
  return row
    ? {
        ...(await snapshot(row)),
        expectedPublicationId: row.expected_publication_id,
        expectedInventoryVersion: row.expected_inventory_version,
      }
    : null;
}
