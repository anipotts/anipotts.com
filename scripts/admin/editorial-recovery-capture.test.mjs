import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  RECOVERY_SCHEMA,
  RECOVERY_TABLES,
  recoveryHash,
  exportOfflineRecovery,
} from "./editorial-recovery.mjs";
import {
  CAPTURE_BYTE_LIMIT,
  sealRecoveryCapture,
  openRecoveryCapture,
} from "./editorial-recovery-capture.mjs";
const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const captureId = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const snapshot = {
    schema: RECOVERY_SCHEMA,
    applicationRevision: "a".repeat(40),
    contentSchemaVersion: 1,
    editorial: {
      tables: Object.fromEntries(
        Object.keys(RECOVERY_TABLES.editorial).map((key) => [key, []]),
      ),
      kv: [],
      alarmAt: null,
    },
    content: {
      tables: Object.fromEntries(
        Object.keys(RECOVERY_TABLES.content).map((key) => [key, []]),
      ),
    },
    publicMedia: [],
  };
  snapshot.content.tables.editorial_published_inventory.push({
    singleton: 1,
    version: 0,
  });
  const control = {
    singleton: 1,
    generation: 1,
    phase: "draining",
    capture_id: captureId,
  };
  const evidence = {
    captureId,
    editorialGeneration: 1,
    contentGeneration: 1,
    schemas: { editorial: [], content: [] },
    control: {
      editorial: [structuredClone(control)],
      content: [structuredClone(control)],
      editorialWriters: [],
      contentWriters: [],
      migrationLedger: [
        {
          id: 1,
          name: "0003_recovery_fence.sql",
          applied_at: "2026-10-18T00:00:00Z",
        },
      ],
    },
    objects: [],
  };
  return { snapshot, evidence };
}
test("v2 keeps fence identities, schema and migration evidence separate from strict offline-v1 payload", () => {
  const { snapshot, evidence } = fixture();
  const result = openRecoveryCapture(sealRecoveryCapture(snapshot, evidence));
  assert.deepEqual(result.snapshot, snapshot);
  assert.deepEqual(result.evidence, evidence);
  assert.throws(
    () =>
      exportOfflineRecovery({
        ...snapshot,
        editorial: {
          ...snapshot.editorial,
          tables: {
            ...snapshot.editorial.tables,
            editorial_recovery_control: evidence.control.editorial,
          },
        },
      }),
    /schema/,
  );
  const forged = JSON.parse(sealRecoveryCapture(snapshot, evidence));
  forged.evidence.control.migrationLedger[0].name = "changed.sql";
  assert.throws(
    () => openRecoveryCapture(JSON.stringify(forged)),
    /capture_checksum/,
  );
});
test("v2 refuses outstanding writer rows, mismatched fences, unknown fields, corruption and excess bytes", () => {
  for (const mutate of [
    (evidence) =>
      evidence.control.editorialWriters.push({ token: "unfinished" }),
    (evidence) => evidence.control.contentWriters.push({ token: "unfinished" }),
    (evidence) => {
      evidence.control.editorial[0].phase = "open";
    },
    (evidence) => {
      evidence.control.content[0].generation++;
    },
    (evidence) => {
      evidence.unknown = true;
    },
  ]) {
    const { snapshot, evidence } = fixture();
    mutate(evidence);
    assert.throws(() => sealRecoveryCapture(snapshot, evidence), /capture_/);
  }
  const { snapshot, evidence } = fixture();
  const serialized = JSON.parse(sealRecoveryCapture(snapshot, evidence));
  serialized.extra = true;
  assert.throws(
    () => openRecoveryCapture(JSON.stringify(serialized)),
    /capture_schema/,
  );
  assert.throws(
    () => openRecoveryCapture(" ".repeat(CAPTURE_BYTE_LIMIT + 1)),
    /capture_byte_limit/,
  );
});
test("v2 binds every public object to type and full application/provider metadata", () => {
  const { snapshot, evidence } = fixture();
  const raw = Buffer.from("synthetic object bytes"),
    key = `${recoveryHash(raw)}.png`;
  snapshot.publicMedia.push({
    key,
    type: "image/png",
    base64: raw.toString("base64"),
  });
  const metadata = {
    key,
    etag: "synthetic-etag",
    version: "synthetic-version",
    uploaded: "2026-10-18T00:00:00Z",
    httpMetadata: {
      contentType: "image/png",
      cacheControl: "public, max-age=60",
    },
    customMetadata: { provenance: "synthetic" },
  };
  evidence.objects.push(metadata);
  assert.deepEqual(
    openRecoveryCapture(sealRecoveryCapture(snapshot, evidence)).evidence
      .objects,
    [metadata],
  );
  evidence.objects = [];
  assert.throws(
    () => sealRecoveryCapture(snapshot, evidence),
    /capture_object_metadata/,
  );
  evidence.objects = [
    {
      ...metadata,
      httpMetadata: { ...metadata.httpMetadata, unknown: "unsupported" },
    },
  ];
  assert.throws(
    () => sealRecoveryCapture(snapshot, evidence),
    /capture_object_metadata/,
  );
});
test("additive SQL fence rejects late writes inside SQLite transactions and rolls back a failed install batch", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      read(
        "apps/admin/migrations/content-publication/0001_published_snapshots.sql",
      ),
    );
    db.exec(
      read(
        "apps/admin/migrations/content-publication/0002_content_schema_version.sql",
      ),
    );
    db.exec(
      read("apps/admin/migrations/content-publication/0003_recovery_fence.sql"),
    );
    db.prepare(
      "INSERT INTO editorial_recovery_writers VALUES (?,0,'synthetic-late','active')",
    ).run("unfinished");
    db.prepare(
      "UPDATE editorial_recovery_control SET phase='draining',generation=1,capture_id=?",
    ).run(captureId);
    assert.throws(
      () => db.exec("UPDATE editorial_published_inventory SET version=1"),
      /recovery_write_fenced/,
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        "UPDATE editorial_recovery_control SET phase='open'; UPDATE editorial_published_inventory SET version=99; INSERT INTO editorial_published_inventory VALUES (1,999)",
      );
      assert.fail("invalid transaction accepted");
    } catch {
      db.exec("ROLLBACK");
    }
    assert.equal(
      db.prepare("SELECT phase FROM editorial_recovery_control").get().phase,
      "draining",
    );
    assert.equal(
      db.prepare("SELECT version FROM editorial_published_inventory").get()
        .version,
      0,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM editorial_recovery_writers").get()
        .n,
      1,
    );
  } finally {
    db.close();
  }
});

test("capture DDL fingerprints match the actual code-owned SQL, including guards and every control table", () => {
  const editorial = new DatabaseSync(":memory:"),
    content = new DatabaseSync(":memory:");
  try {
    for (const [path, marker] of [
      [
        "apps/admin/src/editorial/draft-store.ts",
        "CREATE TABLE IF NOT EXISTS direct_published_bases",
      ],
      [
        "apps/admin/src/editorial/direct-publisher.ts",
        "CREATE TABLE IF NOT EXISTS direct_publication_intents",
      ],
    ]) {
      const sql = [...read(path).matchAll(/sql\.exec\(`([\s\S]*?)`\)/gu)]
        .map((value) => value[1])
        .find((value) => value.includes(marker));
      assert.ok(sql && !sql.includes("${"));
      editorial.exec(sql);
    }
    editorial.exec(
      read("apps/admin/src/editorial/recovery-coordinator.ts").match(
        /EDITORIAL_RECOVERY_SQL = `([\s\S]*?)`;/u,
      )[1],
    );
    for (const file of [
      "0001_published_snapshots.sql",
      "0002_content_schema_version.sql",
      "0003_recovery_fence.sql",
    ])
      content.exec(read(`apps/admin/migrations/content-publication/${file}`));
    const actual = Object.fromEntries(
      Object.entries({ editorial, content }).map(([store, db]) => [
        store,
        Object.fromEntries(
          db
            .prepare(
              "SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
            )
            .all()
            .map((row) => [
              row.name,
              recoveryHash(String(row.sql).replace(/\s+/g, " ").trim()),
            ]),
        ),
      ]),
    );
    const expected = JSON.parse(
      read("apps/admin/src/editorial/recovery-schema.json"),
    );
    assert.deepEqual(actual, expected);
  } finally {
    editorial.close();
    content.close();
  }
});
