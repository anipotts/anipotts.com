#!/usr/bin/env node
/** Local-only SQLite proof. Never connects to a provider or reads user content. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const migration = readFileSync(
  new URL(
    "../../apps/admin/migrations/content-publication/0001_published_snapshots.sql",
    import.meta.url,
  ),
  "utf8",
);
const repository = readFileSync(
  new URL(
    "../../packages/content/src/editorial/direct-publication.ts",
    import.meta.url,
  ),
  "utf8",
);
const schemaBlock = repository
  .split("export const DIRECT_PUBLICATION_SCHEMA_SQL = [")[1]
  .split("] as const;")[0];
const schema =
  [...schemaBlock.matchAll(/`([^`]+)`/g)].map((match) => match[1]).join(";\n") +
  ";";
const normalize = (value) =>
  value
    .replace(/^--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
assert.equal(
  normalize(migration),
  normalize(schema),
  "migration must match exported repository schema",
);
const db = new DatabaseSync(":memory:");
try {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(migration);
  const originalSchema = db
    .prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all();
  db.exec(migration);
  assert.equal(
    db.prepare("SELECT version FROM editorial_published_inventory").get()
      .version,
    0,
  );
  db.prepare(
    "INSERT INTO editorial_published_revisions VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(
    "proof-op",
    "writing",
    "fixture",
    "synthetic public source",
    1,
    "a".repeat(64),
    "2026-09-12T00:00:00Z",
    null,
    0,
  );
  db.prepare("INSERT INTO editorial_published_active VALUES (?,?,?)").run(
    "writing",
    "fixture",
    "proof-op",
  );
  db.exec(
    "UPDATE editorial_published_inventory SET version = 1 WHERE singleton = 1",
  );
  const before = db
    .prepare("SELECT * FROM editorial_published_revisions")
    .all();
  for (let rerun = 0; rerun < 3; rerun++) db.exec(migration);
  assert.deepEqual(
    db.prepare("SELECT * FROM editorial_published_revisions").all(),
    before,
  );
  assert.equal(
    db.prepare("SELECT version FROM editorial_published_inventory").get()
      .version,
    1,
  );
  assert.equal(
    db.prepare("SELECT publication_id FROM editorial_published_active").get()
      .publication_id,
    "proof-op",
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all(),
    originalSchema,
  );
  assert.throws(
    () =>
      db.exec(
        "UPDATE editorial_published_revisions SET source = 'replacement'",
      ),
    /immutable/,
  );
  assert.throws(
    () => db.exec("DELETE FROM editorial_published_revisions"),
    /immutable/,
  );
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO editorial_published_revisions VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          "proof-op",
          "writing",
          "fixture",
          "duplicate",
          2,
          "b".repeat(64),
          "2026-09-12T00:00:00Z",
          null,
          0,
        ),
    /UNIQUE/,
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log(
    "CONTENT_DB migration proof passed: schema parity, empty/populated reruns, revision and pointer preservation, singleton version preservation, immutable history, unique operation IDs, foreign keys. Local SQLite only.",
  );
} finally {
  db.close();
}
