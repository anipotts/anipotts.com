/** Pure seed planning for the dedicated content D1. No provider access here.
 * Records come from the same Git files, record identities, schemas and
 * visibility rules the public bundle and the direct publisher use. Requires
 * a built `@anipotts/content` (pnpm turbo build --filter=@anipotts/content...). */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dist = (root, path) =>
  pathToFileURL(join(root, "packages/content/dist", path)).href;

export async function loadContentContract(root) {
  const [source, contract, snapshot, visibility] = await Promise.all([
    import(dist(root, "editorial/source.js")),
    import(dist(root, "editorial/publication-contract.js")),
    import(dist(root, "editorial/snapshot.js")),
    import(dist(root, "public/visibility.js")),
  ]);
  return { ...source, ...contract, ...snapshot, ...visibility };
}

export const SEED_ID_PREFIX = "git-seed";
export const seedPublicationId = (record) =>
  `${SEED_ID_PREFIX}.${record.kind}.${record.id}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const directories = { pages: "page", projects: "work", writing: "writing" };
const mediaPattern = /\/images\/editorial\/([a-f0-9]{64}\.(?:jpg|png|webp))/gu;

/** Mirrors apps/www/src/lib/bundled-sources.ts and the admin baseline glob. */
export function bundledEntries(root, contract) {
  const entries = [];
  const skipped = [];
  for (const [directory, kind] of Object.entries(directories)) {
    const base = join(root, "content/public", directory);
    for (const file of readdirSync(base).sort()) {
      if (!file.endsWith(".md")) continue;
      const path = `content/public/${directory}/${file}`;
      const record = contract.editorialRecordSchema.safeParse({
        kind,
        id: file.slice(0, -3),
      });
      if (!record.success) {
        skipped.push({ path, reason: "not_an_editorial_record" });
        continue;
      }
      entries.push({
        path,
        record: record.data,
        source: readFileSync(join(base, file), "utf8"),
      });
    }
  }
  return { entries, skipped };
}

/** The exact visibility gate the publisher enforces at start() and the reader
 * applies in publicationIsVisible(). Non-public source never enters this DB. */
function publicReason(entry, contract) {
  const data = contract.parseEditorialSource(entry.source).data;
  if (entry.record.kind === "writing")
    return contract.isPublishedWriting(data) ? null : `writing_${data.status}`;
  if (entry.record.kind === "work")
    return contract.isPublicProject(data) ? null : `work_${data.public_state}`;
  return entry.record.id === "newsletter"
    ? "newsletter_page_unpublished"
    : null;
}

export async function collectGitSeed(root) {
  const contract = await loadContentContract(root);
  const { entries, skipped } = bundledEntries(root, contract);
  const issues = contract.validateEditorialSnapshot(entries);
  if (issues.length)
    throw new Error(`bundled_snapshot_invalid: ${JSON.stringify(issues)}`);
  const records = [];
  const excluded = [...skipped];
  for (const entry of entries) {
    const reason = publicReason(entry, contract);
    if (reason) {
      excluded.push({ path: entry.path, record: entry.record, reason });
      continue;
    }
    contract.validatePublicationSource(
      entry.record,
      entry.source,
      contract.CONTENT_SCHEMA_VERSION,
    );
    const sourceSha256 = await contract.publicationSourceHash(entry.source);
    if (sourceSha256 !== sha256(entry.source))
      throw new Error("publication_hash_mismatch");
    const publicationId = seedPublicationId(entry.record);
    if (!contract.publicationOperationIdSchema.safeParse(publicationId).success)
      throw new Error(`invalid_publication_id: ${publicationId}`);
    records.push({
      ...entry,
      publicationId,
      sourceSha256,
      revision: 1,
      contentSchemaVersion: contract.CONTENT_SCHEMA_VERSION,
      media: [...entry.source.matchAll(mediaPattern)].map((match) => match[1]),
    });
  }
  const media = [...new Set(records.flatMap((record) => record.media))]
    .sort()
    .map((id) => {
      const file = join(root, "apps/www/public/images/editorial", id);
      const present = existsSync(file);
      return {
        id,
        file,
        present,
        valid: present && sha256(readFileSync(file)) === id.split(".")[0],
      };
    });
  return {
    records,
    excluded,
    media,
    bundledSourceSha256: await contract.bundledPublicationSourceHash(entries),
    counts: countByKind(records),
  };
}

export function countByKind(records) {
  const counts = { page: 0, work: 0, writing: 0 };
  for (const { record } of records) counts[record.kind] += 1;
  return counts;
}

const text = (value) =>
  value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

/** Rows exactly as publishDirect() writes them for a first publication:
 * revision 1, no expected publication, expected inventory version 0. All
 * records share one activation, so the inventory moves 0 -> 1 exactly once.
 *
 * Every statement is guarded, so a partially applied file (a provider that
 * does not wrap --file in one transaction) converges on rerun and can never
 * bump the inventory before every pointer exists. */
export function seedStatements(records, publishedAt) {
  if (!records.length) throw new Error("empty_seed");
  if (!Number.isFinite(Date.parse(publishedAt)))
    throw new Error("invalid_published_at");
  const n = records.length;
  const ids = records.map((r) => text(r.publicationId)).join(",");
  const statements = [];
  for (const r of records)
    statements.push(
      `INSERT INTO editorial_published_revisions (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_publication_id,expected_inventory_version,content_schema_version) SELECT ${[
        r.publicationId,
        r.record.kind,
        r.record.id,
        r.source,
      ]
        .map(text)
        .join(
          ",",
        )},${r.revision},${text(r.sourceSha256)},${text(publishedAt)},NULL,0,${r.contentSchemaVersion} WHERE (SELECT version FROM editorial_published_inventory WHERE singleton = 1) = 0 AND NOT EXISTS (SELECT 1 FROM editorial_published_revisions WHERE publication_id = ${text(r.publicationId)}) AND NOT EXISTS (SELECT 1 FROM editorial_published_active WHERE record_kind = ${text(r.record.kind)} AND record_id = ${text(r.record.id)});`,
    );
  for (const r of records)
    statements.push(
      `INSERT INTO editorial_published_active (record_kind,record_id,publication_id) SELECT ${text(r.record.kind)},${text(r.record.id)},${text(r.publicationId)} WHERE (SELECT version FROM editorial_published_inventory WHERE singleton = 1) = 0 AND (SELECT source_sha256 FROM editorial_published_revisions WHERE publication_id = ${text(r.publicationId)}) = ${text(r.sourceSha256)} AND NOT EXISTS (SELECT 1 FROM editorial_published_active WHERE record_kind = ${text(r.record.kind)} AND record_id = ${text(r.record.id)});`,
    );
  statements.push(
    `UPDATE editorial_published_inventory SET version = 1 WHERE singleton = 1 AND version = 0 AND (SELECT COUNT(*) FROM editorial_published_active) = ${n} AND (SELECT COUNT(*) FROM editorial_published_active WHERE publication_id IN (${ids})) = ${n} AND (SELECT COUNT(*) FROM editorial_published_revisions) = ${n};`,
  );
  return statements;
}
export const seedSql = (records, publishedAt) =>
  `${seedStatements(records, publishedAt).join("\n")}\n`;

export const STATE_SQL = [
  "SELECT version FROM editorial_published_inventory WHERE singleton = 1",
  "SELECT record_kind, record_id, publication_id FROM editorial_published_active ORDER BY record_kind, record_id",
  "SELECT publication_id, record_kind, record_id, revision, source_sha256, expected_publication_id, expected_inventory_version, content_schema_version FROM editorial_published_revisions ORDER BY publication_id",
];

const seedRowMatches = (row, r) =>
  row.publication_id === r.publicationId &&
  row.record_kind === r.record.kind &&
  row.record_id === r.record.id &&
  row.revision === r.revision &&
  row.source_sha256 === r.sourceSha256 &&
  row.expected_publication_id === null &&
  row.expected_inventory_version === 0 &&
  row.content_schema_version === r.contentSchemaVersion;

/** Decide from observed state. Anything not produced by this exact seed refuses. */
export function planSeed(state, records) {
  const byId = new Map(records.map((r) => [r.publicationId, r]));
  const { version, active, revisions } = state;
  if (!Number.isSafeInteger(version))
    return { action: "refuse", reason: "inventory_missing" };
  for (const row of revisions) {
    const expected = byId.get(row.publication_id);
    if (!expected || !seedRowMatches(row, expected))
      return {
        action: "refuse",
        reason: `revision_mismatch:${row.publication_id}`,
      };
  }
  for (const row of active) {
    const expected = byId.get(row.publication_id);
    if (
      !expected ||
      expected.record.kind !== row.record_kind ||
      expected.record.id !== row.record_id
    )
      return {
        action: "refuse",
        reason: `active_mismatch:${row.record_kind}/${row.record_id}`,
      };
  }
  const complete =
    active.length === records.length && revisions.length === records.length;
  if (version === 1 && complete) return { action: "noop" };
  if (version !== 0)
    return { action: "refuse", reason: `inventory_version_${version}` };
  return {
    action: "apply",
    resume: active.length > 0 || revisions.length > 0,
  };
}
