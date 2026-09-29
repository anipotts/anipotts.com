import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DIRECT_PUBLICATION_SCHEMA_SQL,
  publishDirect,
  getPublished,
  listPublished,
  getPublishedInventory,
  listPublicationHistory,
  getDirectReceipt,
  type PublicationDatabase,
  type PublicationStatement,
  type DirectPublicationInput,
} from "./direct-publication.js";
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
