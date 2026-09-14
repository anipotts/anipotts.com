#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalSchema,
  parseD1SchemaResult,
} from "./d1-schema-fingerprint.mjs";

/** Read-only remote-result validation; no provider credentials or requests here. */
export function verifyContentPublicationSchema(payload, phase = "after") {
  if (!["before", "after"].includes(phase))
    throw new Error("invalid schema proof phase");
  const rows = parseD1SchemaResult(payload).filter(
    (row) => !["d1_migrations", "_cf_KV"].includes(row.name),
  );
  if (phase === "before" && rows.length === 0) return "empty";
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      readFileSync(
        new URL(
          "../../apps/admin/migrations/content-publication/0001_published_snapshots.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const expected = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all();
    assert.deepEqual(
      canonicalSchema(rows),
      canonicalSchema(expected),
      "CONTENT_DB schema must be exactly the reviewed public store, never private application tables",
    );
    return "exact";
  } finally {
    db.close();
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, phase] = process.argv.slice(2);
  if (!file)
    throw new Error(
      "usage: content-publication-schema-proof.mjs <wrangler-schema-json> <before|after>",
    );
  console.log(
    `content_db_schema=${verifyContentPublicationSchema(JSON.parse(readFileSync(file, "utf8")), phase)}`,
  );
}
