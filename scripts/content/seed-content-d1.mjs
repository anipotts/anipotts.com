#!/usr/bin/env node
/** Seed the dedicated content D1 with every public Git record as its first
 * published revision. Default is a dry run that prints the plan.
 *
 *   node scripts/content/seed-content-d1.mjs                        # plan only
 *   node scripts/content/seed-content-d1.mjs --sql out.sql          # emit SQL
 *   node scripts/content/seed-content-d1.mjs --local --persist-to .wrangler/state --apply
 *   node scripts/content/seed-content-d1.mjs --remote --apply --confirm-remote anipotts-content
 *   node scripts/content/seed-content-d1.mjs --remote --upload-media --confirm-remote anipotts-content-media
 *
 * Never targets anipotts-db. Remote writes need the exact --confirm-remote name. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectGitSeed,
  planSeed,
  seedSql,
  STATE_SQL,
} from "./content-d1-seed.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const database = option("--database", "anipotts-content");
const databaseId = option(
  "--database-id",
  "2679fc97-e251-46b7-ad01-db8b9fe04e8d",
);
const bucket = option("--bucket", "anipotts-content-media");
const remote = flag("--remote");
const local = flag("--local");
const persistTo = option("--persist-to");
const publishedAt = option("--published-at", new Date().toISOString());

if (/anipotts-db/u.test(database) || databaseId.startsWith("a8aadf73"))
  throw new Error("refusing the shared anipotts-db; content D1 only");
if (remote && local) throw new Error("choose --local or --remote");

const cli = join(
  dirname(
    createRequire(join(root, "apps/www/package.json")).resolve(
      "wrangler/package.json",
    ),
  ),
  "bin/wrangler.js",
);
const temporary = mkdtempSync(join(tmpdir(), "content-d1-seed-"));
const config = join(temporary, "wrangler.json");
writeFileSync(
  config,
  JSON.stringify({
    name: "content-d1-seed",
    compatibility_date: "2026-05-01",
    ...(remote ? { account_id: "0f856093bdcd34a7da1bde5ee4385163" } : {}),
    d1_databases: [
      {
        binding: "CONTENT_DB",
        database_name: database,
        database_id: databaseId,
      },
    ],
    r2_buckets: [{ binding: "CONTENT_MEDIA", bucket_name: bucket }],
  }),
);
const target = [
  remote ? "--remote" : "--local",
  "--config",
  config,
  ...(persistTo ? ["--persist-to", resolve(persistTo)] : []),
];
function wrangler(rest) {
  const result = spawnSync(process.execPath, [cli, ...rest], {
    cwd: temporary,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0)
    throw new Error(`wrangler ${rest[0]} ${rest[1]} failed: ${result.stderr}`);
  return result.stdout;
}
function query(sql) {
  const out = wrangler([
    "d1",
    "execute",
    database,
    ...target,
    "--json",
    "--command",
    sql,
  ]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}
function requireRemoteConfirmation(name) {
  if (remote && option("--confirm-remote") !== name)
    throw new Error(`remote writes need --confirm-remote ${name}`);
}

async function main() {
  const seed = await collectGitSeed(root);
  const summary = {
    database,
    target: remote ? "remote" : local || persistTo ? "local" : "none",
    counts: seed.counts,
    total: seed.records.length,
    bundledSourceSha256: seed.bundledSourceSha256,
    records: seed.records.map((r) => ({
      id: r.publicationId,
      sha256: r.sourceSha256,
    })),
    excluded: seed.excluded.map(({ path, reason }) => ({ path, reason })),
    media: seed.media.map(({ id, present, valid }) => ({ id, present, valid })),
  };
  const sqlPath = option("--sql");
  if (sqlPath)
    writeFileSync(resolve(sqlPath), seedSql(seed.records, publishedAt));
  if (!remote && !local && !persistTo) {
    console.log(JSON.stringify({ ...summary, plan: "dry_run" }, null, 2));
    return 0;
  }
  if (flag("--upload-media")) {
    requireRemoteConfirmation(bucket);
    if (seed.media.some((m) => !m.valid))
      throw new Error("referenced editorial media missing or corrupt");
    for (const media of seed.media)
      wrangler([
        "r2",
        "object",
        "put",
        `${bucket}/${media.id}`,
        ...target,
        "--file",
        media.file,
        "--content-type",
        media.id.endsWith(".jpg")
          ? "image/jpeg"
          : media.id.endsWith(".png")
            ? "image/png"
            : "image/webp",
      ]);
    console.log(JSON.stringify({ uploaded: seed.media.length }));
    return 0;
  }
  const read = () => ({
    version: query(STATE_SQL[0])[0]?.version,
    active: query(STATE_SQL[1]),
    revisions: query(STATE_SQL[2]),
  });
  const plan = planSeed(read(), seed.records);
  console.log(JSON.stringify({ ...summary, plan }, null, 2));
  if (plan.action === "refuse") return 2;
  if (plan.action === "noop" || !flag("--apply")) return 0;
  if (seed.media.length && !flag("--media-ready"))
    throw new Error(
      "records reference editorial media; run --upload-media first, then pass --media-ready",
    );
  requireRemoteConfirmation(database);
  const file = join(temporary, "seed.sql");
  writeFileSync(file, seedSql(seed.records, publishedAt));
  wrangler(["d1", "execute", database, ...target, "--yes", "--file", file]);
  const after = planSeed(read(), seed.records);
  if (after.action !== "noop")
    throw new Error(`seed did not converge: ${JSON.stringify(after)}`);
  console.log(JSON.stringify({ applied: true, inventoryVersion: 1 }));
  return 0;
}
try {
  process.exitCode = await main();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
