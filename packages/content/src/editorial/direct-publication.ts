import { z } from "zod";
import {
  editorialRecordSchema,
  validateEditorialSource,
  type EditorialRecord,
} from "./source.js";

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
const operationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const inputSchema = z
  .object({
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
    publishedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DirectPublicationInput = z.infer<typeof inputSchema>;
export type PublishedSnapshot = {
  publicationId: string;
  record: EditorialRecord;
  source: string;
  revision: number;
  sourceSha256: string;
  publishedAt: string;
};
type Row = {
  publication_id: string;
  record_kind: string;
  record_id: string;
  source: string;
  revision: number;
  source_sha256: string;
  published_at: string;
  expected_publication_id: string | null;
  expected_inventory_version: number;
};
function snapshot(row: Row): PublishedSnapshot {
  return {
    publicationId: row.publication_id,
    record: editorialRecordSchema.parse({
      kind: row.record_kind,
      id: row.record_id,
    }),
    source: row.source,
    revision: row.revision,
    sourceSha256: row.source_sha256,
    publishedAt: row.published_at,
  };
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
  const value = inputSchema.parse(input);
  if (!validateEditorialSource(value.record, value.source).success)
    throw new Error("invalid_publication_source");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value.source),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const { kind, id } = value.record;
  const results = await db.batch<Row>([
    db
      .prepare(
        `INSERT INTO editorial_published_revisions
      (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_publication_id,expected_inventory_version)
      SELECT ?,?,?,?,?,?,?,?,?
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
    publication: snapshot(row),
  };
}
export async function getPublished(
  db: Pick<PublicationDatabase, "prepare">,
  record: EditorialRecord,
): Promise<PublishedSnapshot | null> {
  const { kind, id } = editorialRecordSchema.parse(record);
  const row = await db
    .prepare(
      `SELECT r.* FROM editorial_published_active a JOIN editorial_published_revisions r ON r.publication_id = a.publication_id WHERE a.record_kind = ? AND a.record_id = ?`,
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
      `SELECT r.* FROM editorial_published_active a JOIN editorial_published_revisions r ON r.publication_id = a.publication_id ORDER BY a.record_kind, a.record_id`,
    )
    .all<Row>();
  if (!result.success) throw new Error("publication_read_failed");
  return result.results.map(snapshot);
}
export async function listPublicationHistory(
  db: Pick<PublicationDatabase, "prepare">,
  record: EditorialRecord,
): Promise<PublishedSnapshot[]> {
  const { kind, id } = editorialRecordSchema.parse(record);
  const result = await db
    .prepare(
      `SELECT * FROM editorial_published_revisions WHERE record_kind = ? AND record_id = ? ORDER BY published_at DESC, publication_id DESC`,
    )
    .bind(kind, id)
    .all<Row>();
  if (!result.success) throw new Error("publication_read_failed");
  return result.results.map(snapshot);
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
      "SELECT r.* FROM editorial_published_active a JOIN editorial_published_revisions r ON r.publication_id = a.publication_id ORDER BY a.record_kind, a.record_id",
    ),
  ]);
  const version = result[0]?.results[0]?.version;
  if (
    result.length !== 2 ||
    result.some((row) => !row.success) ||
    !Number.isSafeInteger(version)
  )
    throw new Error("publication_read_failed");
  return { version: version!, publications: result[1]!.results.map(snapshot) };
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
  return row
    ? {
        ...snapshot(row),
        expectedPublicationId: row.expected_publication_id,
        expectedInventoryVersion: row.expected_inventory_version,
      }
    : null;
}
