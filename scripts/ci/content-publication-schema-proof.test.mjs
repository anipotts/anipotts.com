import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { verifyContentPublicationSchema } from "./content-publication-schema-proof.mjs";
const db = new DatabaseSync(":memory:");
try {
  const result = (rows) => [
    { success: true, results: rows, meta: { changes: 0 } },
  ];
  assert.equal(verifyContentPublicationSchema(result([]), "before"), "empty");
  assert.throws(() => verifyContentPublicationSchema(result([]), "after"));
  db.exec(
    readFileSync(
      new URL(
        "../../apps/admin/migrations/content-publication/0001_published_snapshots.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const rows = db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
    )
    .all();
  assert.equal(verifyContentPublicationSchema(result(rows), "after"), "exact");
  assert.equal(
    verifyContentPublicationSchema(
      result([...rows, { name: "d1_migrations" }]),
      "before",
    ),
    "exact",
  );
  assert.throws(() =>
    verifyContentPublicationSchema(
      result([
        ...rows,
        {
          name: "private_drafts",
          type: "table",
          tbl_name: "private_drafts",
          sql: "CREATE TABLE private_drafts(source TEXT)",
        },
      ]),
      "before",
    ),
  );
  assert.throws(() =>
    verifyContentPublicationSchema([{ success: false, results: [] }], "before"),
  );
  assert.throws(() =>
    verifyContentPublicationSchema(
      [{ success: true, results: rows, meta: { changes: 1 } }],
      "after",
    ),
  );
  console.log("CONTENT_DB remote-result schema proof tests passed");
} finally {
  db.close();
}

const adminConfig = readFileSync("apps/admin/wrangler.toml", "utf8");
const contentBinding = adminConfig
  .split("[[d1_databases]]")
  .find((block) => /^binding = "CONTENT_DB"$/m.test(block));
assert.ok(contentBinding, "migration workflow requires the CONTENT_DB binding");
assert.match(
  contentBinding,
  /migrations_dir = "\.\/migrations\/content-publication"/,
);
assert.match(contentBinding, /database_name = "anipotts-content"/);
