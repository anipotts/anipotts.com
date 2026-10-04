import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { readPublicE2EMigrations } from "./public-e2e-migrations.mjs";

test("a new 0003 migration joins the ordered public browser database replay", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "public-e2e-migrations-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "README.md"), "Not SQL");
  // Create out of order: replay order must follow filenames, not creation.
  writeFileSync(
    join(directory, "0002_add_schema.sql"),
    "ALTER TABLE publications ADD COLUMN schema_version INTEGER;",
  );
  writeFileSync(
    join(directory, "0001_publications.sql"),
    "CREATE TABLE publications (id TEXT PRIMARY KEY);",
  );
  const initial = readPublicE2EMigrations(directory);
  writeFileSync(
    join(directory, "0003_seed_publication.sql"),
    "INSERT INTO publications (id, schema_version) VALUES ('synthetic', 3);",
  );
  const updated = readPublicE2EMigrations(directory);
  assert.notEqual(updated, initial);
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec(updated);
  assert.equal(
    database.prepare("SELECT schema_version FROM publications").get()
      .schema_version,
    3,
  );
});

test("an empty migration inventory fails before starting the browser server", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "public-e2e-migrations-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(
    () => readPublicE2EMigrations(directory),
    /migrations are missing/,
  );
});
