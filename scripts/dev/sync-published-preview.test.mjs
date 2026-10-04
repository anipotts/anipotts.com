import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mirrorSql } from "./sync-published-preview.mjs";
const source = "title: 'Ani'\nbody: hello";
const row = {
  publication_id: "op-1",
  record_kind: "home",
  record_id: "home",
  source,
  revision: 1,
  source_sha256: createHash("sha256").update(source).digest("hex"),
  published_at: "2026-10-04T00:00:00Z",
  expected_publication_id: null,
  expected_inventory_version: 11,
  content_schema_version: 1,
};
test("mirror escapes authored source and only changes published tables", () => {
  const sql = mirrorSql({ version: 12, publications: [row] });
  assert.match(sql, /title: ''Ani''/);
  assert.match(sql, /INSERT OR IGNORE INTO editorial_published_revisions/);
  assert.match(sql, /UPDATE editorial_published_inventory SET version=12/);
  assert.doesNotMatch(
    sql,
    /editorial_drafts|editorial_jobs|DELETE FROM editorial_published_revisions/,
  );
});
test("rejects corrupt source, duplicate identities and invalid counters before generating writes", () => {
  assert.throws(() =>
    mirrorSql({ version: 12, publications: [{ ...row, source: "corrupt" }] }),
  );
  assert.throws(() => mirrorSql({ version: 12, publications: [row, row] }));
  assert.throws(() => mirrorSql({ version: -1, publications: [row] }));
});
