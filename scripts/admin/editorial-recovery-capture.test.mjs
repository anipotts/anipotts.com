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
  serializeRecoveryR2HttpMetadata,
} from "./editorial-recovery-capture.mjs";
import { recoveryApplicationSchema } from "../../apps/admin/src/editorial/recovery-application-schema.ts";
import { assertRecoveryWriterCohort } from "../../apps/admin/src/editorial/recovery-eligibility.ts";
import { isRecoveryProviderSchema } from "../../apps/admin/src/editorial/recovery-provider-schema.ts";
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
      captures: [],
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

test("only exact native KV/alarm metadata schemas are recognized; application lookalikes remain unknown", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE _cf_KV (key TEXT PRIMARY KEY,value BLOB) WITHOUT ROWID; CREATE TABLE _cf_METADATA (key INTEGER PRIMARY KEY,value BLOB); CREATE TABLE _cf_authored_state (value TEXT);",
    );
    const rows = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
      )
      .all();
    for (const store of ["editorial", "content"]) {
      assert.equal(
        isRecoveryProviderSchema(
          rows.find((row) => row.name === "_cf_KV"),
          store,
        ),
        true,
      );
      assert.equal(
        isRecoveryProviderSchema(
          rows.find((row) => row.name === "_cf_METADATA"),
          store,
        ),
        true,
      );
      assert.equal(
        isRecoveryProviderSchema(
          rows.find((row) => row.name === "_cf_authored_state"),
          store,
        ),
        false,
      );
    }
    const altered = {
      ...rows.find((row) => row.name === "_cf_METADATA"),
      sql: "CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB,private_source TEXT)",
    };
    assert.throws(
      () => isRecoveryProviderSchema(altered, "editorial"),
      /capture_provider_schema_drift/,
    );
    assert.equal(
      isRecoveryProviderSchema(
        {
          type: "table",
          name: "_cf_EXTERNALS",
          tbl_name: "_cf_EXTERNALS",
          sql: "CREATE TABLE _cf_EXTERNALS(value BLOB)",
        },
        "editorial",
      ),
      false,
    );
  } finally {
    db.close();
  }
});

test("the exact supported historical ADD COLUMN schema maps to current named-column restoration and unrelated layouts fail", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(read("apps/admin/test/recovery/pre-client-hash.sql"));
    assert.ok(
      !db
        .prepare("PRAGMA table_info(save_request_identities)")
        .all()
        .some((column) => column.name === "clientHash"),
    );
    db.exec("ALTER TABLE save_request_identities ADD COLUMN clientHash TEXT");
    const row = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name='save_request_identities'",
      )
      .get();
    const canonical = JSON.parse(
      read("apps/admin/src/editorial/recovery-schema.json"),
    ).editorial.save_request_identities;
    assert.notEqual(
      recoveryHash(row.sql.replace(/\s+/gu, " ").trim()),
      canonical,
    );
    assert.equal(recoveryApplicationSchema(row, "editorial"), canonical);
    db.exec(
      "ALTER TABLE save_request_identities ADD COLUMN unsupported_authored_field TEXT",
    );
    assert.throws(
      () =>
        recoveryApplicationSchema(
          db
            .prepare(
              "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name='save_request_identities'",
            )
            .get(),
          "editorial",
        ),
      /capture_schema_drift/,
    );
  } finally {
    db.close();
  }
});

test("the normal capture eligibility adapter refuses operational-shaped callers before reading any provider", () => {
  let reads = 0;
  const database = {
    prepare() {
      reads++;
      throw new Error("unexpected_provider_read");
    },
    batch() {
      reads++;
      throw new Error("unexpected_provider_write");
    },
  };
  const bucket = {
    list() {
      reads++;
      throw new Error("unexpected_provider_read");
    },
  };
  assert.throws(
    () => assertRecoveryWriterCohort(database, bucket, "a".repeat(40)),
    /recovery_operational_cohort_unsupported/,
  );
  assert.equal(reads, 0);
});

test("v2 retains prior durable completion receipts and refuses to hide them in offline-v1", () => {
  const { snapshot, evidence } = fixture();
  evidence.editorialGeneration = evidence.contentGeneration = 2;
  evidence.control.editorial[0].generation =
    evidence.control.content[0].generation = 2;
  evidence.control.captures.push({
    capture_id: "00000000-0000-4000-8000-000000000002",
    editorial_generation: 1,
    content_generation: 1,
    sha256: "a".repeat(64),
    state: "released",
  });
  assert.deepEqual(
    openRecoveryCapture(sealRecoveryCapture(snapshot, evidence)).evidence
      .control.captures,
    evidence.control.captures,
  );
  assert.throws(
    () =>
      exportOfflineRecovery({
        ...snapshot,
        editorial: {
          ...snapshot.editorial,
          tables: {
            ...snapshot.editorial.tables,
            editorial_recovery_captures: evidence.control.captures,
          },
        },
      }),
    /schema/,
  );
  evidence.control.captures[0].unknown = true;
  assert.throws(
    () => sealRecoveryCapture(snapshot, evidence),
    /capture_schema/,
  );
});

test("R2 serialization omits absent optional native fields and preserves strict strings and Date values", () => {
  const metadata = {
    contentType: "image/png",
    contentLanguage: undefined,
    contentDisposition: undefined,
    contentEncoding: undefined,
    cacheControl: "public, max-age=60",
    cacheExpiry: undefined,
  };
  assert.deepEqual(serializeRecoveryR2HttpMetadata(metadata), {
    contentType: "image/png",
    cacheControl: "public, max-age=60",
  });
  const expiry = new Date("2027-01-01T00:00:00Z");
  assert.deepEqual(
    serializeRecoveryR2HttpMetadata({ ...metadata, cacheExpiry: expiry }),
    {
      contentType: "image/png",
      cacheControl: "public, max-age=60",
      cacheExpiry: expiry.toISOString(),
    },
  );
  for (const invalid of [
    { ...metadata, cacheExpiry: "undefined" },
    { ...metadata, cacheExpiry: new Date(NaN) },
    { ...metadata, contentType: null },
    { ...metadata, cacheControl: 60 },
    { ...metadata, unsupported: "new state" },
    { ...metadata, unsupported: undefined },
  ])
    assert.throws(
      () => serializeRecoveryR2HttpMetadata(invalid),
      /capture_object_metadata/,
    );
  const { snapshot, evidence } = fixture();
  const raw = Buffer.from("synthetic object bytes"),
    key = `${recoveryHash(raw)}.png`;
  snapshot.publicMedia.push({
    key,
    type: "image/png",
    base64: raw.toString("base64"),
  });
  evidence.objects.push({
    key,
    etag: "synthetic-etag",
    version: "synthetic-version",
    uploaded: "2026-10-18T00:00:00Z",
    httpMetadata: serializeRecoveryR2HttpMetadata(metadata),
    customMetadata: { fixture: "synthetic" },
  });
  assert.deepEqual(
    openRecoveryCapture(sealRecoveryCapture(snapshot, evidence)).evidence
      .objects[0].httpMetadata,
    { contentType: "image/png", cacheControl: "public, max-age=60" },
  );
});
