/** Local SQLite proof for the content D1 seed. Never connects to a provider.
 * Requires a built @anipotts/content (pnpm turbo build --filter=@anipotts/content...). */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectGitSeed,
  loadContentContract,
  planSeed,
  seedSql,
  seedStatements,
  STATE_SQL,
} from "../content/content-d1-seed.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const at = "2026-09-21T00:00:00.000Z";
const migrations = [
  "0001_published_snapshots.sql",
  "0002_content_schema_version.sql",
]
  .map((name) =>
    readFileSync(
      join(root, "apps/admin/migrations/content-publication", name),
      "utf8",
    ),
  )
  .join("\n");
const seed = await collectGitSeed(root);
const contract = await loadContentContract(root);

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(migrations);
  return db;
}
const state = (db) => ({
  version: db.prepare(STATE_SQL[0]).get()?.version,
  active: db.prepare(STATE_SQL[1]).all(),
  revisions: db.prepare(STATE_SQL[2]).all(),
});
const count = (db, table) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test("record count equals the public Git inventory, by kind", () => {
  const dirs = { pages: "page", projects: "work", writing: "writing" };
  const expected = { page: 0, work: 0, writing: 0 };
  for (const [dir, kind] of Object.entries(dirs))
    for (const file of readdirSync(join(root, "content/public", dir))) {
      if (!file.endsWith(".md")) continue;
      const record = contract.editorialRecordSchema.safeParse({
        kind,
        id: file.slice(0, -3),
      });
      if (!record.success) continue;
      const data = contract.parseEditorialSource(
        readFileSync(join(root, "content/public", dir, file), "utf8"),
      ).data;
      const visible =
        kind === "writing"
          ? contract.isPublishedWriting(data)
          : kind === "work"
            ? contract.isPublicProject(data)
            : record.data.id !== "newsletter";
      if (visible) expected[kind] += 1;
    }
  assert.deepEqual(seed.counts, expected);
  assert.equal(
    seed.records.length + seed.excluded.length,
    Object.keys(dirs).reduce(
      (n, dir) =>
        n +
        readdirSync(join(root, "content/public", dir)).filter((f) =>
          f.endsWith(".md"),
        ).length,
      0,
    ),
  );
  for (const page of ["home", "work", "writing", "systems"])
    assert.ok(
      seed.records.some((r) => r.publicationId === `git-seed.page.${page}`),
    );
});

test("seeded rows decode exactly like direct publications", async () => {
  const db = database();
  db.exec(seedSql(seed.records, at));
  assert.equal(state(db).version, 1);
  assert.equal(count(db, "editorial_published_active"), seed.records.length);
  const rows = db
    .prepare(
      "SELECT r.* FROM editorial_published_active a JOIN editorial_published_revisions r USING (publication_id)",
    )
    .all();
  for (const row of rows) {
    const snapshot = await contract.decodePublishedSnapshot({
      contentSchemaVersion: row.content_schema_version,
      publicationId: row.publication_id,
      record: { kind: row.record_kind, id: row.record_id },
      source: row.source,
      revision: row.revision,
      sourceSha256: row.source_sha256,
      publishedAt: row.published_at,
    });
    const git = seed.records.find(
      (r) => r.publicationId === row.publication_id,
    );
    assert.equal(snapshot.source, git.source);
    assert.equal(row.expected_publication_id, null);
    assert.equal(row.expected_inventory_version, 0);
  }
});

test("idempotent: a second plan is a no-op and rerunning SQL changes nothing", () => {
  const db = database();
  assert.equal(planSeed(state(db), seed.records).action, "apply");
  db.exec(seedSql(seed.records, at));
  assert.equal(planSeed(state(db), seed.records).action, "noop");
  db.exec(seedSql(seed.records, "2026-09-22T00:00:00.000Z"));
  assert.equal(state(db).version, 1);
  assert.equal(count(db, "editorial_published_revisions"), seed.records.length);
});

test("a partially applied seed resumes and converges with one version bump", () => {
  const db = database();
  // Interrupted after three revision rows: no pointer, no version bump yet.
  for (const statement of seedStatements(seed.records, at).slice(0, 3))
    db.exec(statement);
  assert.equal(state(db).version, 0);
  const plan = planSeed(state(db), seed.records);
  assert.deepEqual(plan, { action: "apply", resume: true });
  db.exec(seedSql(seed.records, at));
  assert.equal(state(db).version, 1);
  assert.equal(planSeed(state(db), seed.records).action, "noop");
});

test("refuses any foreign or mismatched publication", () => {
  const db = database();
  const first = seed.records[0];
  db.prepare(
    "INSERT INTO editorial_published_revisions (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_inventory_version) VALUES (?,?,?,?,?,?,?,0)",
  ).run(
    "real-operation",
    first.record.kind,
    first.record.id,
    first.source,
    1,
    first.sourceSha256,
    at,
  );
  db.prepare("INSERT INTO editorial_published_active VALUES (?,?,?)").run(
    first.record.kind,
    first.record.id,
    "real-operation",
  );
  db.exec("UPDATE editorial_published_inventory SET version = 1");
  assert.equal(planSeed(state(db), seed.records).action, "refuse");
  // The guarded SQL cannot overwrite it even if run blindly.
  db.exec(seedSql(seed.records, at));
  assert.equal(count(db, "editorial_published_revisions"), 1);
  assert.equal(state(db).version, 1);

  const changed = seed.records.map((r, i) =>
    i === 0 ? { ...r, sourceSha256: "0".repeat(64) } : r,
  );
  const seeded = database();
  seeded.exec(seedSql(seed.records, at));
  assert.match(
    planSeed(state(seeded), changed).reason,
    /^revision_mismatch:git-seed\./,
  );
  assert.equal(
    planSeed({ version: 2, active: [], revisions: [] }, seed.records).action,
    "refuse",
  );
});

test("no draft, hidden or newsletter source is ever seeded", () => {
  const reasons = seed.excluded.map((e) => e.reason);
  for (const record of seed.records) {
    const data = contract.parseEditorialSource(record.source).data;
    if (record.record.kind === "writing")
      assert.equal(data.status, "published");
    if (record.record.kind === "work")
      assert.ok(["featured", "listed"].includes(data.public_state));
    assert.notEqual(record.publicationId, "git-seed.page.newsletter");
  }
  assert.ok(reasons.includes("newsletter_page_unpublished"));
});
