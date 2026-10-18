import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  RECOVERY_SCHEMA,
  RECOVERY_TABLES,
  RECOVERY_LIMITS,
  recoveryHash,
  exportOfflineRecovery,
  validateOfflineRecovery,
  OfflineRecoveryTarget,
  restoreOfflineRecovery,
  encryptOfflineRecovery,
  decryptOfflineRecovery,
} from "./editorial-recovery.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const clone = (value) => structuredClone(value);
const record = { kind: "writing", id: "synthetic-recovery" };
const key = `content/public/${record.kind}/${record.id}.md`;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const revisionSource = (revision, media) =>
  `\uFEFF---\r\nstatus: published\r\ntitle: Synthetic recovery\r\n---\r\nRevision ${revision}: café 🌱\r\n![fixture](/images/editorial/${media})\r\n`;
const publishedAt = "2026-10-10T00:00:00.000Z";
function schemas() {
  const editorial = new DatabaseSync(":memory:");
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
    // Canonical constructor SQL only; no provider module or executable TS import.
    const sql = [...read(path).matchAll(/sql\.exec\(`([\s\S]*?)`\)/gu)]
      .map((match) => match[1])
      .find((value) => value.includes(marker));
    assert.ok(sql, `canonical schema template missing in ${path}`);
    assert.ok(
      !sql.includes("${"),
      "schema template must not require interpolation",
    );
    editorial.exec(sql);
  }
  const content = new DatabaseSync(":memory:");
  content.exec(
    read(
      "apps/admin/migrations/content-publication/0001_published_snapshots.sql",
    ),
  );
  content.exec(
    read(
      "apps/admin/migrations/content-publication/0002_content_schema_version.sql",
    ),
  );
  return { editorial, content };
}
function relation(originalId, derivativeId) {
  const value = {
    version: 1,
    originalId,
    parentId: originalId,
    derivativeId,
    source: { width: 1, height: 1 },
    output: { width: 1, height: 1 },
    crop: null,
    orientation: "decoded-display",
    codec: "jsquash-jpeg-1.6.0/png-3.1.1/webp-1.5.0:rgba8-png-v1",
  };
  const id = recoveryHash(JSON.stringify(value));
  return {
    key: `media-relation:${derivativeId}:${id}`,
    encoding: "json",
    value: { ...value, id },
  };
}
function fixture() {
  // Deliberately synthetic binary, not a claim that an image decoder accepts it.
  const media = Buffer.alloc(70_000, 37),
    original = Buffer.from("synthetic original");
  const id = `${recoveryHash(media)}.png`,
    originalId = `${recoveryHash(original)}.png`;
  const kv = [];
  for (const [asset, bytes] of [
    [id, media],
    [originalId, original],
  ]) {
    kv.push({
      key: `media:${asset}`,
      encoding: "json",
      value: { id: asset, type: "image/png", size: bytes.length },
    });
    for (
      let offset = 0;
      offset < bytes.length;
      offset += RECOVERY_LIMITS.chunkBytes
    )
      kv.push({
        key: `media:${asset}:${offset / RECOVERY_LIMITS.chunkBytes}`,
        encoding: "base64",
        value: bytes
          .subarray(offset, offset + RECOVERY_LIMITS.chunkBytes)
          .toString("base64"),
      });
  }
  kv.push(relation(id, id), relation(originalId, id)); // self-edge and shared derivative
  const e = Object.fromEntries(
    Object.keys(RECOVERY_TABLES.editorial).map((table) => [table, []]),
  );
  const p = Object.fromEntries(
    Object.keys(RECOVERY_TABLES.content).map((table) => [table, []]),
  );
  for (let revision = 1; revision <= 105; revision++) {
    const draft = {
      key,
      source: revisionSource(revision, id),
      baseCommit: "a".repeat(40),
      baseFileHash: "b".repeat(40),
      revision,
      updatedAt: revision * 1000,
      discardedAt: null,
    };
    e.revisions.push({ key, revision, snapshot: JSON.stringify(draft) });
    const result = JSON.stringify({ ok: true, draft });
    e.save_request_identities.push({
      id: uuid(revision),
      key,
      payloadHash: recoveryHash(`request ${revision}`),
      clientHash: recoveryHash(`client ${revision}`),
      outcome: "saved",
      revision,
      legacyResult: null,
    });
    if (revision > 5)
      e.save_requests.push({
        id: uuid(revision),
        key,
        payloadHash: recoveryHash(`request ${revision}`),
        result,
      });
    if (revision === 105)
      e.drafts.push({ ...draft, baseFileHash: "c".repeat(40) }); // publication base ack only
  }
  e.save_request_identities[0].id = "00000000-0000-0000-0000-000000000000";
  e.conflicts.push({
    id: uuid(106),
    key,
    source: `Unsaved conflict 🌱\r\n/images/editorial/${originalId}`,
    expectedRevision: 104,
    createdAt: 106000,
  });
  const conflictResult = JSON.stringify({
    ok: false,
    code: "revision_conflict",
    current: JSON.parse(e.revisions.at(-1).snapshot),
    conflictId: uuid(106),
  });
  e.save_request_identities.push({
    id: uuid(106),
    key,
    payloadHash: recoveryHash("conflict"),
    clientHash: null,
    outcome: "conflict",
    revision: 105,
    legacyResult: conflictResult,
  });
  e.save_requests.push({
    id: uuid(106),
    key,
    payloadHash: recoveryHash("conflict"),
    result: conflictResult,
  });
  // Supported ancient reconciliation-only conflict: no cached or legacy result.
  e.conflicts.push({
    id: uuid(107),
    key,
    source: "Ancient conflict",
    expectedRevision: 0,
    createdAt: 1,
  });
  e.save_request_identities.push({
    id: uuid(107),
    key,
    payloadHash: recoveryHash("ancient conflict"),
    clientHash: null,
    outcome: "conflict",
    revision: null,
    legacyResult: null,
  });
  // Canonical migration retains an exact successful receipt for pruned history.
  const pruned = {
    ...JSON.parse(e.revisions[0].snapshot),
    revision: 1000,
    source: "Exact historically pruned receipt\r\n",
    updatedAt: 1000000,
  };
  const legacyResult = JSON.stringify({ ok: true, draft: pruned });
  e.save_request_identities.push({
    id: uuid(108),
    key,
    payloadHash: recoveryHash("legacy"),
    clientHash: null,
    outcome: "saved",
    revision: 1000,
    legacyResult,
  });
  e.save_requests.push({
    id: uuid(108),
    key,
    payloadHash: recoveryHash("legacy"),
    result: legacyResult,
  });
  const publicSource = revisionSource(100, id),
    hiddenSource = publicSource.replace("status: published", "status: draft");
  p.editorial_published_inventory.push({ singleton: 1, version: 2 });
  p.editorial_published_revisions.push(
    {
      publication_id: "synthetic.publish",
      record_kind: "writing",
      record_id: record.id,
      source: publicSource,
      revision: 100,
      source_sha256: recoveryHash(publicSource),
      published_at: publishedAt,
      expected_publication_id: null,
      expected_inventory_version: 0,
      content_schema_version: 1,
    },
    {
      publication_id: "synthetic.unpublish",
      record_kind: "writing",
      record_id: record.id,
      source: hiddenSource,
      revision: 105,
      source_sha256: recoveryHash(hiddenSource),
      published_at: publishedAt,
      expected_publication_id: "synthetic.publish",
      expected_inventory_version: 1,
      content_schema_version: 1,
    },
  );
  p.editorial_published_active.push({
    record_kind: "writing",
    record_id: record.id,
    publication_id: "synthetic.unpublish",
  });
  e.direct_published_bases.push({
    key,
    publicationId: "synthetic.unpublish",
    inventoryVersion: 2,
  });
  const intent = (
    operationId,
    source,
    expectedRevision,
    expectedPublicationId,
    expectedBaselineSha256,
    action,
  ) =>
    JSON.stringify({
      record,
      operationId,
      expectedRevision,
      reviewedSourceSha256: recoveryHash(source),
      expectedPublicationId,
      expectedBaselineSha256,
      action,
      source,
      createdAt: 1000,
    });
  const state = {
    key,
    phase: "live",
    version: 4,
    attempts: 2,
    failures: 0,
    dueAt: 1000,
    lease: null,
    leaseUntil: 0,
    blocked: null,
    inventoryVersion: 2,
    publishedAt,
    activatedAt: 2000,
    verifiedAt: 3000,
    retryStartedAt: 0,
    superseded: 0,
  };
  e.direct_publication_intents.push(
    {
      ...state,
      id: "synthetic.unpublish",
      intent: intent(
        "synthetic.unpublish",
        hiddenSource,
        105,
        "synthetic.publish",
        recoveryHash(publicSource),
        "unpublish",
      ),
    },
    {
      ...state,
      id: "synthetic.pending",
      intent: intent(
        "synthetic.pending",
        e.drafts[0].source,
        105,
        "synthetic.unpublish",
        recoveryHash(hiddenSource),
        "publish",
      ),
      phase: "commit",
      lease: "synthetic-lease",
      leaseUntil: 999999,
      inventoryVersion: 2,
      activatedAt: null,
      verifiedAt: null,
      publishedAt: null,
      dueAt: 0,
    },
  );
  e.direct_publication_diagnostics.push({
    id: "synthetic.pending",
    issues: JSON.stringify([
      { code: "synthetic", message: "Synthetic fixture diagnostic" },
    ]),
  });
  return {
    schema: RECOVERY_SCHEMA,
    applicationRevision: "d".repeat(40),
    contentSchemaVersion: 1,
    editorial: { tables: e, kv, alarmAt: 1000 },
    content: { tables: p },
    publicMedia: [
      { key: id, type: "image/png", base64: media.toString("base64") },
    ],
  };
}
function restoreSql(snapshot) {
  const stores = schemas();
  for (const [name, db] of Object.entries(stores)) {
    for (const table of Object.keys(RECOVERY_TABLES[name])) {
      const rows = snapshot[name].tables[table];
      if (table === "editorial_published_inventory")
        db.exec(`DELETE FROM ${table}`);
      const keys = Object.keys(RECOVERY_TABLES[name][table]);
      const insert = db.prepare(
        `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      );
      for (const row of rows) insert.run(...keys.map((column) => row[column]));
    }
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  }
  return stores;
}

test("offline fixture schema covers every canonical SQL table and exact named columns", () => {
  const stores = schemas();
  assert.throws(() => {
    RECOVERY_TABLES.editorial.drafts.source = "integer";
  }, TypeError);
  try {
    for (const [name, db] of Object.entries(stores)) {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name)
        .sort();
      assert.deepEqual(tables, Object.keys(RECOVERY_TABLES[name]).sort());
      for (const [table, definition] of Object.entries(RECOVERY_TABLES[name])) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all();
        assert.deepEqual(
          columns.map((row) => row.name).sort(),
          Object.keys(definition).sort(),
        );
        for (const row of columns)
          assert.equal(
            row.type.toLowerCase(),
            definition[row.name].replace("?", ""),
          );
      }
    }
  } finally {
    Object.values(stores).forEach((db) => db.close());
  }
});

test("full supplied fixture restores 105 revisions, conflicts, exact retries, hidden/public receipts and all media into suspended empty memory", () => {
  const snapshot = fixture(),
    serialized = exportOfflineRecovery(snapshot),
    target = new OfflineRecoveryTarget();
  const report = restoreOfflineRecovery(serialized, target);
  assert.equal(report.mode, "isolated-suspended");
  assert.equal(report.mediaRelations, 2);
  assert.equal(report.privateMedia, 2);
  assert.equal(report.publicMedia, 1);
  assert.deepEqual(report.legacyMissingHistory, [JSON.stringify([key, 1000])]);
  assert.deepEqual(report.reconciliationRequired, [uuid(107)]);
  assert.deepEqual(target.read(), snapshot);
  assert.equal(target.install, undefined);
  assert.equal(target.alarm, undefined);
  assert.equal(target.publish, undefined);
  const copy = target.read();
  copy.editorial.tables.drafts[0].source = "mutated";
  assert.equal(
    target.read().editorial.tables.drafts[0].source,
    snapshot.editorial.tables.drafts[0].source,
  );
  const stores = restoreSql(target.read());
  try {
    for (const [name, db] of Object.entries(stores)) {
      for (const table of Object.keys(RECOVERY_TABLES[name])) {
        assert.deepEqual(
          db
            .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
            .all()
            .map((row) => ({ ...row })),
          snapshot[name].tables[table],
          `${name}.${table} exact rows after canonical SQL restore`,
        );
      }
    }
    assert.equal(
      stores.editorial.prepare("SELECT COUNT(*) AS n FROM revisions").get().n,
      105,
    );
    assert.equal(
      stores.editorial
        .prepare("SELECT result FROM save_requests WHERE id=?")
        .get(uuid(108)).result,
      snapshot.editorial.tables.save_requests.at(-1).result,
    );
    assert.equal(
      stores.content
        .prepare(
          "SELECT source FROM editorial_published_revisions WHERE publication_id=?",
        )
        .get("synthetic.unpublish").source,
      snapshot.content.tables.editorial_published_revisions[1].source,
    );
    assert.equal(
      stores.editorial
        .prepare("SELECT lease FROM direct_publication_intents WHERE id=?")
        .get("synthetic.pending").lease,
      "synthetic-lease",
    );
    stores.editorial.exec("DELETE FROM revisions");
    assert.equal(
      stores.editorial.prepare("SELECT COUNT(*) AS n FROM revisions").get().n,
      105,
      "restored canonical retention trigger remains effective",
    );
  } finally {
    Object.values(stores).forEach((db) => db.close());
  }
  assert.throws(
    () => restoreOfflineRecovery(serialized, target),
    /target_not_empty/,
  );
  assert.deepEqual(target.read(), snapshot);
  let writes = 0;
  assert.throws(
    () =>
      restoreOfflineRecovery(serialized, {
        install() {
          writes++;
        },
      }),
    /unsupported_target/,
  );
  assert.equal(writes, 0);
});

test("offline validation rejects missing store planes, historical/media/publication/retry references and unknown schemas before restore", () => {
  const mutations = [
    (s) => delete s.editorial.tables.conflicts,
    (s) => (s.editorial.tables.extra_table = []),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].extra = "unmodeled"),
    (s) => s.editorial.tables.revisions.pop(),
    (s) => s.editorial.tables.conflicts.shift(),
    (s) =>
      (s.editorial.tables.save_request_identities[105].legacyResult =
        JSON.stringify({
          ...JSON.parse(
            s.editorial.tables.save_request_identities[105].legacyResult,
          ),
          conflictId: uuid(107),
        })),
    (s) => s.editorial.tables.save_request_identities.splice(5, 1),
    (s) =>
      (s.editorial.tables.save_requests.at(-1).result =
        s.editorial.tables.save_requests[0].result),
    (s) =>
      (s.editorial.tables.save_request_identities.at(-1).legacyResult = null),
    (s) => s.content.tables.editorial_published_revisions.shift(),
    (s) =>
      (s.content.tables.editorial_published_active[0].publication_id =
        "absent"),
    (s) => (s.editorial.tables.direct_published_bases[0].inventoryVersion = 1),
    (s) =>
      (s.editorial.tables.direct_publication_intents[0].inventoryVersion = 1),
    (s) =>
      (s.editorial.tables.direct_publication_intents[0].intent = JSON.stringify(
        {
          ...JSON.parse(
            s.editorial.tables.direct_publication_intents[0].intent,
          ),
          createdAt: "invalid",
        },
      )),
    (s) => (s.editorial.tables.direct_publication_intents[1].attempts = -1),
    (s) =>
      (s.editorial.tables.direct_publication_diagnostics[0].id = "missing"),
    (s) =>
      s.editorial.kv.splice(
        s.editorial.kv.findIndex((entry) => entry.key.endsWith(":1")),
        1,
      ),
    (s) =>
      (s.editorial.kv.find((entry) => entry.encoding === "base64").value =
        Buffer.alloc(65536, 38).toString("base64")),
    (s) => (s.publicMedia = []),
    (s) =>
      (s.publicMedia[0].base64 = Buffer.alloc(70000, 38).toString("base64")),
    (s) =>
      s.editorial.kv.push({
        key: "new-private-store",
        encoding: "json",
        value: {},
      }),
    (s) =>
      (s.editorial.kv.find((entry) =>
        entry.key.startsWith("media-relation:"),
      ).value.version = 2),
    (s) =>
      (s.editorial.kv.find((entry) =>
        entry.key.startsWith("media-relation:"),
      ).value.id = "0".repeat(64)),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].published_at =
        "2026-02-30T00:00:00.000Z"),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].published_at =
        "2026-10-10T24:00:00.000Z"),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].published_at =
        "2026-10-10T23:60:00.000Z"),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].published_at =
        "2026-10-10T23:59:60.000Z"),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].published_at =
        "2026-10-10T23:59:59.000+24:00"),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].published_at =
        "2026-10-10T23:59:59.000+00:60"),
    (s) => (s.contentSchemaVersion = 2),
    (s) =>
      (s.content.tables.editorial_published_revisions[0].content_schema_version = 2),
    (s) =>
      (s.editorial.tables.drafts[0].source = "x".repeat(
        RECOVERY_LIMITS.sourceBytes + 1,
      )),
    (s) => (s.editorial.alarmAt = -1),
  ];
  for (const mutation of mutations) {
    const snapshot = fixture();
    mutation(snapshot);
    assert.throws(
      () => exportOfflineRecovery(snapshot),
      /offline_recovery_/,
      String(mutation),
    );
  }
  const bundle = JSON.parse(exportOfflineRecovery(fixture()));
  bundle.snapshot.editorial.tables.drafts[0].source = "corrupt";
  const empty = new OfflineRecoveryTarget();
  assert.throws(
    () => restoreOfflineRecovery(JSON.stringify(bundle), empty),
    /checksum/,
  );
  assert.equal(empty.isEmpty, true);
  // A rehashed malformed envelope must still fail semantic checks.
  delete bundle.snapshot.editorial.tables.conflicts;
  bundle.sha256 = recoveryHash(JSON.stringify(bundle.snapshot));
  assert.throws(
    () => validateOfflineRecovery(JSON.stringify(bundle)),
    /offline_recovery_/,
  );
});

test("pending activation and canonical verify/live states retain receipts without executing leases", () => {
  const snapshot = fixture();
  const row = snapshot.editorial.tables.direct_publication_intents[0];
  row.phase = "verify";
  row.verifiedAt = null;
  assert.equal(
    validateOfflineRecovery(exportOfflineRecovery(snapshot)).report
      .inventoryVersion,
    2,
  );
  row.activatedAt = null;
  row.inventoryVersion = 1; // committed D1 receipt before DO acknowledgment
  assert.doesNotThrow(() => exportOfflineRecovery(snapshot));
  row.intent = JSON.stringify({
    ...JSON.parse(row.intent),
    source: "wrong",
    reviewedSourceSha256: recoveryHash("wrong"),
  });
  assert.throws(() => exportOfflineRecovery(snapshot), /intent_reference/);
});

test("authenticated encrypted fixture envelopes bind schema/application identity, reject tamper/wrong keys and restore exact plaintext", () => {
  const serialized = exportOfflineRecovery(fixture());
  const syntheticKey = Buffer.alloc(32, 42),
    wrongKey = Buffer.alloc(32, 43);
  const encrypted = encryptOfflineRecovery(serialized, syntheticKey);
  assert.ok(!encrypted.includes("café"));
  assert.equal(decryptOfflineRecovery(encrypted, syntheticKey), serialized);
  assert.notEqual(
    encryptOfflineRecovery(serialized, syntheticKey),
    encrypted,
    "fresh IV per envelope",
  );
  assert.throws(
    () => decryptOfflineRecovery(encrypted, wrongKey),
    /authentication/,
  );
  for (const field of ["applicationRevision", "iv", "tag", "ciphertext"]) {
    const envelope = JSON.parse(encrypted);
    if (field === "applicationRevision") envelope[field] = "e".repeat(40);
    else {
      const value = Buffer.from(envelope[field], "base64");
      value[0] ^= 1;
      envelope[field] = value.toString("base64");
    }
    assert.throws(
      () => decryptOfflineRecovery(JSON.stringify(envelope), syntheticKey),
      /authentication/,
    );
  }
  assert.throws(
    () => encryptOfflineRecovery(serialized, Buffer.alloc(31)),
    /encryption_key/,
  );
  assert.throws(
    () => decryptOfflineRecovery(encrypted, Buffer.alloc(31)),
    /encryption_key/,
  );
  const target = new OfflineRecoveryTarget();
  restoreOfflineRecovery(
    decryptOfflineRecovery(encrypted, syntheticKey),
    target,
  );
  assert.deepEqual(target.read(), fixture());
});

test("offline bounds reject excess bytes, entries and nesting, while maximum media and encrypted expansion roundtrip", () => {
  assert.throws(
    () => validateOfflineRecovery("x".repeat(RECOVERY_LIMITS.bytes + 1)),
    /byte_limit/,
  );
  const excess = fixture();
  excess.editorial.kv = Array(RECOVERY_LIMITS.entries + 1).fill({
    key: "media:fixture",
    encoding: "json",
    value: null,
  });
  assert.throws(() => exportOfflineRecovery(excess), /entry_limit/);
  const deep = fixture();
  let nested = {};
  for (let i = 0; i < 30; i++) nested = { nested };
  deep.editorial.kv.push({
    key: "unrecognized",
    encoding: "json",
    value: nested,
  });
  assert.throws(() => exportOfflineRecovery(deep), /depth/);
  assert.throws(() => {
    RECOVERY_TABLES.editorial.drafts.source = "integer";
  }, TypeError);
  const snapshot = fixture();
  const maximum = Buffer.alloc(RECOVERY_LIMITS.mediaBytes, 17),
    id = `${recoveryHash(maximum)}.png`;
  snapshot.publicMedia.push({
    key: id,
    type: "image/png",
    base64: maximum.toString("base64"),
  });
  const serialized = exportOfflineRecovery(snapshot);
  assert.equal(validateOfflineRecovery(serialized).report.publicMedia, 2);
  const fixtureKey = Buffer.alloc(32, 57);
  const encrypted = encryptOfflineRecovery(serialized, fixtureKey);
  assert.ok(Buffer.byteLength(encrypted) < RECOVERY_LIMITS.bytes * 2);
  assert.equal(decryptOfflineRecovery(encrypted, fixtureKey), serialized);
  snapshot.publicMedia.at(-1).base64 = Buffer.alloc(
    RECOVERY_LIMITS.mediaBytes + 1,
    17,
  ).toString("base64");
  assert.throws(() => exportOfflineRecovery(snapshot), /media_hash/);
});

test("offline publication timestamp compatibility retains canonical minute, leap-day and compact-offset formats", () => {
  for (const value of [
    "2026-10-10T12:00Z",
    "2026-10-10T12:00:00+0200",
    "2024-02-29T23:59:59.000+02:30",
  ]) {
    const snapshot = fixture();
    for (const receipt of snapshot.content.tables.editorial_published_revisions)
      receipt.published_at = value;
    snapshot.editorial.tables.direct_publication_intents[0].publishedAt = value;
    assert.doesNotThrow(() => exportOfflineRecovery(snapshot), value);
  }
});

test("version-one offline record paths match canonical identities without a production helper dependency", async () => {
  const identities = [
    { kind: "page", id: "home" },
    { kind: "work", id: "synthetic-work" },
    { kind: "writing", id: "synthetic-writing" },
  ];
  const expected = [
    "content/public/pages/home.md",
    "content/public/projects/synthetic-work.md",
    "content/public/writing/synthetic-writing.md",
  ];
  const helper = new URL("packages/content/src/editorial/layout.ts", root);
  if (existsSync(helper)) {
    const { editorialRecordPath } = await import(helper.href);
    assert.deepEqual(identities.map(editorialRecordPath), expected);
  } else {
    // Older supported source bases own the same mapping directly in source.ts.
    // Pin only that baseline's path expression; never import its provider graph.
    const canonicalSource = read(
      "packages/content/src/editorial/source.ts",
    ).replace(/\s+/gu, "");
    assert.ok(
      canonicalSource.includes(
        'record.kind==="page"?"pages":record.kind==="work"?"projects":"writing"',
      ),
    );
    assert.ok(
      canonicalSource.includes(
        "return`content/public/${directory}/${record.id}.md`;",
      ),
    );
  }
  const snapshot = {
    schema: RECOVERY_SCHEMA,
    applicationRevision: "d".repeat(40),
    contentSchemaVersion: 1,
    editorial: {
      tables: Object.fromEntries(
        Object.keys(RECOVERY_TABLES.editorial).map((table) => [table, []]),
      ),
      kv: [],
      alarmAt: null,
    },
    content: {
      tables: Object.fromEntries(
        Object.keys(RECOVERY_TABLES.content).map((table) => [table, []]),
      ),
    },
    publicMedia: [],
  };
  snapshot.content.tables.editorial_published_inventory.push({
    singleton: 1,
    version: 0,
  });
  for (const path of expected) {
    const draft = {
      key: path,
      source: "Synthetic format pin\r\n",
      baseCommit: "a".repeat(40),
      baseFileHash: null,
      revision: 1,
      updatedAt: 1,
      discardedAt: null,
    };
    snapshot.editorial.tables.drafts.push(draft);
    snapshot.editorial.tables.revisions.push({
      key: path,
      revision: 1,
      snapshot: JSON.stringify(draft),
    });
  }
  assert.doesNotThrow(() => exportOfflineRecovery(snapshot));
  for (const path of [
    "content/public/work/synthetic-work.md",
    "content/public/pages/arbitrary.md",
    "content/public/writing/../escaped.md",
  ]) {
    const invalid = clone(snapshot);
    invalid.editorial.tables.drafts[0].key = path;
    assert.throws(() => exportOfflineRecovery(invalid), /record/);
  }
  // Closure pin applies even on a combined tree where the newer helper exists.
  assert.doesNotMatch(
    read("scripts/admin/editorial-recovery.mjs"),
    /from\s+["'][^"']*packages\//u,
  );
});
