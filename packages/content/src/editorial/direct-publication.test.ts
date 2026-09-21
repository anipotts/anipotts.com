import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DIRECT_PUBLICATION_SCHEMA_SQL,
  DIRECT_PUBLICATION_CONTRACT_MIGRATION_SQL,
  publishDirect,
  getPublished,
  listPublished,
  getPublishedInventory,
  getPublishedInventoryVersion,
  listPublicationHistory,
  getDirectReceipt,
  type PublicationDatabase,
  type PublicationStatement,
  type DirectPublicationInput,
} from "./direct-publication.js";
import { publicationSourceHash } from "./publication-contract.js";
let sqlite: DatabaseSync;
class Statement implements PublicationStatement {
  values: SQLInputValue[] = [];
  constructor(readonly sql: string) {}
  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
  }
  async first<T>() {
    return (
      (sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null
    );
  }
  async all<T>() {
    return {
      success: true,
      results: sqlite.prepare(this.sql).all(...this.values) as T[],
    };
  }
}
const db: PublicationDatabase = {
  prepare(sql) {
    return new Statement(sql);
  },
  async batch<T>(statements: PublicationStatement[]) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        const item = statement as Statement;
        const prepared = sqlite.prepare(item.sql);
        if (/^\s*SELECT/.test(item.sql))
          return {
            success: true,
            results: prepared.all(...item.values) as T[],
            meta: { changes: 0 },
          };
        return {
          success: true,
          results: [] as T[],
          meta: { changes: Number(prepared.run(...item.values).changes) },
        };
      });
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
const initial: DirectPublicationInput = {
  contentSchemaVersion: 1,
  record: { kind: "writing", id: "hello" },
  source:
    "---\ntitle: Hello\nsummary: A note\nstatus: published\npublished_at: 2026-09-12\n---\n\nOriginal body\n",
  revision: 1,
  operationId: "operation-1",
  expectedPublicationId: null,
  expectedInventoryVersion: 0,
  publishedAt: "2026-09-12T12:00:00Z",
};
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const sql of DIRECT_PUBLICATION_SCHEMA_SQL) sqlite.exec(sql);
  for (const sql of DIRECT_PUBLICATION_CONTRACT_MIGRATION_SQL) sqlite.exec(sql);
});
afterEach(() => sqlite.close());
it("publishes exact validated bytes and reads only active snapshots", async () => {
  expect(await getPublishedInventory(db)).toEqual({
    version: 0,
    publications: [],
  });
  const first = await publishDirect(db, initial);
  expect(first.status).toBe("published");
  const published = await getPublished(db, initial.record);
  expect(published?.source).toBe(initial.source);
  expect(published?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  const next = {
    ...initial,
    operationId: "operation-2",
    revision: 2,
    expectedPublicationId: "operation-1",
    expectedInventoryVersion: 1,
    source: initial.source.replace("Original body", "Updated body"),
  };
  expect((await publishDirect(db, next)).status).toBe("published");
  expect((await listPublished(db)).map((row) => row.publicationId)).toEqual([
    "operation-2",
  ]);
  expect(await listPublicationHistory(db, initial.record)).toHaveLength(2);
  expect((await getPublishedInventory(db)).version).toBe(2);
  expect(await getPublishedInventoryVersion(db)).toBe(2);
});
it("reads the inventory version alone and rejects an unreadable counter", async () => {
  expect(await getPublishedInventoryVersion(db)).toBe(0);
  await publishDirect(db, initial);
  expect(await getPublishedInventoryVersion(db)).toBe(1);
  sqlite.exec("DELETE FROM editorial_published_inventory");
  await expect(getPublishedInventoryVersion(db)).rejects.toThrow(
    "publication_read_failed",
  );
});
it("orders history by activation sequence, not by timestamp text", async () => {
  // operation-2 activates second and is chronologically later
  // ("2026-09-12T11:00:00-05:00" is 16:00Z, four hours after 12:00Z), but its
  // timestamp text starts "11" and so sorts BELOW "12" in a textual DESC.
  // Activation order must win over the string comparison.
  await publishDirect(db, initial);
  const second = {
    ...initial,
    operationId: "operation-2",
    revision: 2,
    expectedPublicationId: "operation-1",
    expectedInventoryVersion: 1,
    source: initial.source.replace("Original body", "Second body"),
    publishedAt: "2026-09-12T11:00:00-05:00",
  };
  expect((await publishDirect(db, second)).status).toBe("published");
  expect(
    (await listPublicationHistory(db, initial.record)).map(
      (row) => row.publicationId,
    ),
  ).toEqual(["operation-2", "operation-1"]);
});
it("replays without changing an active pointer, version, timestamp or history", async () => {
  await publishDirect(db, initial);
  await publishDirect(db, {
    ...initial,
    operationId: "operation-2",
    expectedPublicationId: "operation-1",
    expectedInventoryVersion: 1,
    revision: 2,
  });
  const replay = await publishDirect(db, {
    ...initial,
    publishedAt: "2026-09-13T12:00:00Z",
  });
  expect(replay.status).toBe("replayed");
  if (replay.status === "replayed")
    expect(replay.publication.publishedAt).toBe(initial.publishedAt);
  expect((await getPublished(db, initial.record))?.publicationId).toBe(
    "operation-2",
  );
  expect((await getPublishedInventory(db)).version).toBe(2);
  expect(await listPublicationHistory(db, initial.record)).toHaveLength(2);
  expect(await getDirectReceipt(db, initial.operationId)).toMatchObject({
    expectedPublicationId: null,
    expectedInventoryVersion: 0,
    revision: 1,
  });
});
it("rejects stale record or inventory CAS without leaving partial revisions", async () => {
  await publishDirect(db, initial);
  expect(
    await publishDirect(db, {
      ...initial,
      operationId: "stale-record",
      expectedInventoryVersion: 1,
    }),
  ).toEqual({ status: "conflict" });
  expect(
    await publishDirect(db, {
      ...initial,
      record: { kind: "writing", id: "another" },
      operationId: "stale-inventory",
    }),
  ).toEqual({ status: "conflict" });
  expect(await getDirectReceipt(db, "stale-record")).toBeNull();
  expect(await getDirectReceipt(db, "stale-inventory")).toBeNull();
  expect((await getPublishedInventory(db)).version).toBe(1);
});
it("rejects operation reuse for a different payload or record", async () => {
  await publishDirect(db, initial);
  for (const changed of [
    { source: initial.source + "changed" },
    { revision: 2 },
    { record: { kind: "writing" as const, id: "another" } },
    { expectedInventoryVersion: 1 },
  ]) {
    expect(await publishDirect(db, { ...initial, ...changed })).toEqual({
      status: "idempotency_conflict",
    });
  }
  expect((await getPublished(db, initial.record))?.source).toBe(initial.source);
});
it("rolls back snapshot and inventory if pointer mutation fails", async () => {
  sqlite.exec(
    "CREATE TRIGGER reject_pointer BEFORE INSERT ON editorial_published_active BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END",
  );
  await expect(publishDirect(db, initial)).rejects.toThrow(
    "simulated storage failure",
  );
  expect(await getDirectReceipt(db, initial.operationId)).toBeNull();
  expect(await getPublishedInventory(db)).toEqual({
    version: 0,
    publications: [],
  });
});
it("rejects invalid identities, revisions and source before storing anything", async () => {
  for (const changed of [
    { operationId: "../bad" },
    { revision: 0 },
    { source: "invalid source" },
    { expectedInventoryVersion: -1 },
  ])
    await expect(
      publishDirect(db, { ...initial, ...changed }),
    ).rejects.toThrow();
  expect(await listPublished(db)).toEqual([]);
});
it("restores a historical source through a new approved revision without erasing history", async () => {
  await publishDirect(db, initial);
  await publishDirect(db, {
    ...initial,
    operationId: "operation-2",
    expectedPublicationId: "operation-1",
    expectedInventoryVersion: 1,
    revision: 2,
    source: initial.source + "new text",
  });
  await publishDirect(db, {
    ...initial,
    operationId: "rollback-3",
    expectedPublicationId: "operation-2",
    expectedInventoryVersion: 2,
    revision: 3,
  });
  expect((await getPublished(db, initial.record))?.source).toBe(initial.source);
  expect(await listPublicationHistory(db, initial.record)).toHaveLength(3);
});

it("enforces immutable revision history at the SQL boundary", async () => {
  await publishDirect(db, initial);
  expect(() =>
    sqlite.exec("UPDATE editorial_published_revisions SET source = 'changed'"),
  ).toThrow("published revisions are immutable");
  expect(() =>
    sqlite.exec("DELETE FROM editorial_published_revisions"),
  ).toThrow("published revisions are immutable");
  expect((await getPublished(db, initial.record))?.source).toBe(initial.source);
});

it("rejects an unsupported content schema before calling the database", async () => {
  const untouched = {
    prepare() {
      throw new Error("database called");
    },
    batch() {
      throw new Error("database called");
    },
  } as unknown as PublicationDatabase;
  await expect(
    publishDirect(untouched, {
      ...initial,
      contentSchemaVersion: 2,
    } as unknown as DirectPublicationInput),
  ).rejects.toThrow("unsupported_content_schema");
  expect(await listPublished(db)).toEqual([]);
});

it("rejects unsupported or invalid stored content across public reads and replay lookups", async () => {
  await publishDirect(db, initial);
  // Model an import/future writer, not mutation by an ordinary publication.
  sqlite.exec("DROP TRIGGER editorial_published_revisions_no_update");
  for (const [assignment, value, error] of [
    ["content_schema_version", 2, "unsupported_content_schema"],
    ["source_sha256", "b".repeat(64), "publication_hash_mismatch"],
    ["published_at", "not-a-date", "invalid_published_snapshot"],
    ["record_kind", "unknown", "invalid_published_snapshot"],
  ] as const) {
    sqlite
      .prepare(`UPDATE editorial_published_revisions SET ${assignment} = ?`)
      .run(value);
    await expect(getPublished(db, initial.record)).rejects.toThrow(error);
    await expect(listPublished(db)).rejects.toThrow(error);
    await expect(getPublishedInventory(db)).rejects.toThrow(error);
    await expect(getDirectReceipt(db, initial.operationId)).rejects.toThrow(
      error,
    );
    sqlite
      .prepare(
        "UPDATE editorial_published_revisions SET content_schema_version = 1, source_sha256 = ?, published_at = ?, record_kind = 'writing'",
      )
      .run(await publicationSourceHash(initial.source), initial.publishedAt);
  }
});

it("rejects a mismatched active identity rather than dropping or moving the publication", async () => {
  await publishDirect(db, initial);
  sqlite.exec("UPDATE editorial_published_active SET record_id = 'different'");
  await expect(
    getPublished(db, { kind: "writing", id: "different" }),
  ).rejects.toThrow("invalid_published_snapshot");
  await expect(getPublishedInventory(db)).rejects.toThrow(
    "invalid_published_snapshot",
  );
});

/** Exact named-column/CAS SQL from the unversioned bootstrap writer. */
async function bootstrapPublish(input: DirectPublicationInput) {
  return db.batch([
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
        input.operationId,
        input.record.kind,
        input.record.id,
        input.source,
        input.revision,
        await publicationSourceHash(input.source),
        input.publishedAt,
        input.expectedPublicationId,
        input.expectedInventoryVersion,
        input.operationId,
        input.expectedInventoryVersion,
        input.record.kind,
        input.record.id,
        input.expectedPublicationId,
      ),
    db
      .prepare(
        `INSERT INTO editorial_published_active (record_kind,record_id,publication_id)
      SELECT ?,?,? WHERE changes() = 1
      ON CONFLICT(record_kind,record_id) DO UPDATE SET publication_id = excluded.publication_id`,
      )
      .bind(input.record.kind, input.record.id, input.operationId),
    db.prepare(
      "UPDATE editorial_published_inventory SET version = version + 1 WHERE singleton = 1 AND changes() = 1",
    ),
    db
      .prepare(
        "SELECT * FROM editorial_published_revisions WHERE publication_id = ?",
      )
      .bind(input.operationId),
  ]);
}
it("adds v1 metadata to populated bootstrap storage and supports the previous writer without changing receipts", async () => {
  sqlite.close();
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const sql of DIRECT_PUBLICATION_SCHEMA_SQL) sqlite.exec(sql);
  await bootstrapPublish(initial);
  const original = sqlite
    .prepare("SELECT * FROM editorial_published_revisions")
    .get();
  for (const sql of DIRECT_PUBLICATION_CONTRACT_MIGRATION_SQL) sqlite.exec(sql);
  expect(
    sqlite.prepare("SELECT * FROM editorial_published_revisions").get(),
  ).toEqual({ ...original, content_schema_version: 1 });
  expect(await getPublished(db, initial.record)).toMatchObject({
    contentSchemaVersion: 1,
    source: initial.source,
    publicationId: initial.operationId,
  });
  const next = {
    ...initial,
    operationId: "old-writer-2",
    revision: 2,
    source: initial.source + "After migration\n",
    expectedPublicationId: initial.operationId,
    expectedInventoryVersion: 1,
  };
  const written = await bootstrapPublish(next);
  expect(written.slice(0, 3).map((result) => result.meta?.changes)).toEqual([
    1, 1, 1,
  ]);
  const beforeReplay = await getPublishedInventory(db);
  await bootstrapPublish(initial);
  expect(await getPublishedInventory(db)).toEqual(beforeReplay);
  expect(beforeReplay.version).toBe(2);
  expect(beforeReplay.publications[0]).toMatchObject({
    contentSchemaVersion: 1,
    source: next.source,
  });
  expect((await publishDirect(db, initial)).status).toBe("replayed");
});

it("runs the checked-in empty and populated migration proof during package tests", () => {
  const script = fileURLToPath(
    new URL(
      "../../../../scripts/ci/content-publication-migration-proof.mjs",
      import.meta.url,
    ),
  );
  expect(
    execFileSync(process.execPath, [script], { encoding: "utf8" }),
  ).toContain("CONTENT_DB migration proof passed");
});
