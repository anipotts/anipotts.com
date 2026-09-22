import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// A synthetic SQLite stand-in for the CONTENT_DB binding, with the reviewed
// content-publication migrations applied. It proves read, query and render
// integration against the emitted Worker, not provider D1 transactions.
const root = fileURLToPath(new URL("../../../", import.meta.url));
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const defaultWriting = readFileSync(
  join(root, "content/public/writing/awareness-is-alpha.md"),
  "utf8",
);

/** An empty inventory at version 0 renders exactly the bundled Git defaults. */
export function contentDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of [
    "0001_published_snapshots.sql",
    "0002_content_schema_version.sql",
  ])
    sqlite.exec(
      readFileSync(
        join(root, "apps/admin/migrations/content-publication", name),
        "utf8",
      ),
    );
  let reads = 0;
  let versionReads = 0;
  const db = {
    /** Full inventory reads (the one atomic batch that loads publications). */
    get reads() {
      return reads;
    },
    /** Single-row inventory counter reads used for revalidation. */
    get versionReads() {
      return versionReads;
    },
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          if (/FROM editorial_published_inventory/u.test(sql)) versionReads++;
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...values) };
        },
      };
      return statement;
    },
    async batch(statements) {
      reads++;
      sqlite.exec("BEGIN");
      try {
        const result = await Promise.all(
          statements.map((statement) => statement.all()),
        );
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    publish({
      kind = "writing",
      id = "awareness-is-alpha",
      text = defaultWriting,
      schema = 1,
      digest = sha256(text),
      operation = `synthetic-${kind}-${id}-${sqlite.prepare("SELECT version FROM editorial_published_inventory").get().version}`,
    } = {}) {
      const version = sqlite
        .prepare(
          "SELECT version FROM editorial_published_inventory WHERE singleton=1",
        )
        .get().version;
      sqlite
        .prepare(
          `INSERT INTO editorial_published_revisions (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_publication_id,expected_inventory_version,content_schema_version) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          operation,
          kind,
          id,
          text,
          1,
          digest,
          "2026-09-20T12:00:00.000Z",
          null,
          version,
          schema,
        );
      sqlite
        .prepare(
          "INSERT INTO editorial_published_active VALUES (?,?,?) ON CONFLICT(record_kind,record_id) DO UPDATE SET publication_id=excluded.publication_id",
        )
        .run(kind, id, operation);
      sqlite.exec(
        "UPDATE editorial_published_inventory SET version=version+1 WHERE singleton=1",
      );
      return { operation, digest, version: version + 1 };
    },
    close() {
      sqlite.close();
    },
  };
  return db;
}

/** The deployed runtime var and a content binding (which may be absent),
 * plus any overrides. */
export const contentEnv = (db, other = {}) => ({
  CONTENT_RUNTIME: "cms",
  CONTENT_DB: db,
  ...other,
});
