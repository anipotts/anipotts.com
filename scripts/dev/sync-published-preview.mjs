// Development-only mirror. Remote access is a fixed SELECT of active publications.
// Local draft, job and receipt tables are never read or written.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const state = join(root, ".local/published-preview");
const columns = [
  "publication_id",
  "record_kind",
  "record_id",
  "source",
  "revision",
  "source_sha256",
  "published_at",
  "expected_publication_id",
  "expected_inventory_version",
  "content_schema_version",
];
const snapshotQuery = `SELECT version, (SELECT json_group_array(json_object(${columns.map((c) => `'${c}',r.${c}`).join(",")})) FROM editorial_published_active a JOIN editorial_published_revisions r ON r.publication_id=a.publication_id) AS publications FROM editorial_published_inventory WHERE singleton=1`;
const quote = (v) =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : `'${String(v).replaceAll("'", "''")}'`;
export function mirrorSql(snapshot) {
  if (
    !Number.isSafeInteger(snapshot.version) ||
    snapshot.version < 0 ||
    !Array.isArray(snapshot.publications)
  )
    throw Error("invalid_publication_snapshot");
  const ids = new Set();
  for (const r of snapshot.publications) {
    if (
      !["home", "page", "writing", "work", "settings"].includes(
        r.record_kind,
      ) ||
      typeof r.record_id !== "string" ||
      typeof r.source !== "string" ||
      createHash("sha256").update(r.source).digest("hex") !== r.source_sha256 ||
      ids.has(`${r.record_kind}/${r.record_id}`)
    )
      throw Error("invalid_publication_record");
    ids.add(`${r.record_kind}/${r.record_id}`);
  }
  return [
    ...snapshot.publications.map(
      (r) =>
        `INSERT OR IGNORE INTO editorial_published_revisions (${columns.join(",")}) VALUES (${columns.map((c) => quote(r[c])).join(",")});`,
    ),
    "DELETE FROM editorial_published_active;",
    ...snapshot.publications.map(
      (r) =>
        `INSERT INTO editorial_published_active (record_kind,record_id,publication_id) VALUES (${[r.record_kind, r.record_id, r.publication_id].map(quote).join(",")});`,
    ),
    `UPDATE editorial_published_inventory SET version=${snapshot.version} WHERE singleton=1;`,
  ].join("\n");
}
function run(args) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 90000,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (result.status !== 0) throw Error("publication_sync_command_failed");
  return result.stdout;
}
function query(app, remote, sql) {
  const args = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "anipotts-content",
    "--config",
    `apps/${app}/wrangler.toml`,
    "--json",
    "--command",
    sql,
  ];
  args.push(remote ? "--remote" : "--local");
  if (!remote)
    args.push("--persist-to", join(root, `apps/${app}/.wrangler/state`));
  const output = run(args);
  const result = JSON.parse(output.slice(output.indexOf("[")))[0];
  if (!result?.success) throw Error("publication_snapshot_read_failed");
  return result.results;
}
async function sync() {
  const row = query("www", true, snapshotQuery)[0];
  const snapshot = {
    version: row.version,
    publications: JSON.parse(row.publications),
  };
  const sql = mirrorSql(snapshot);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const file = join(state, "current.sql");
  writeFileSync(file, sql, { mode: 0o600 });
  for (const app of ["www", "admin"]) {
    const previous = query(app, false, snapshotQuery)[0];
    writeFileSync(
      join(state, `${app}-before-${Date.now()}.json`),
      JSON.stringify(previous),
      { mode: 0o600 },
    );
    run([
      "exec",
      "wrangler",
      "d1",
      "execute",
      "anipotts-content",
      "--config",
      `apps/${app}/wrangler.toml`,
      "--local",
      "--persist-to",
      join(root, `apps/${app}/.wrangler/state`),
      "--file",
      file,
    ]);
  }
  writeFileSync(
    join(state, "status.json"),
    JSON.stringify({
      version: snapshot.version,
      records: snapshot.publications.length,
      syncedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  console.log(
    `published preview synced: version ${snapshot.version}, ${snapshot.publications.length} records`,
  );
  return snapshot.version;
}
function heartbeat(extra) {
  let previous = {};
  try {
    previous = JSON.parse(readFileSync(join(state, "status.json"), "utf8"));
  } catch {}
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(state, "status.json"),
    JSON.stringify({ ...previous, ...extra }),
    { mode: 0o600 },
  );
}
function claimWatcher() {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const lock = join(state, "watcher.lock");
  try {
    mkdirSync(lock);
  } catch {
    let pid;
    try {
      pid = Number(readFileSync(join(lock, "pid"), "utf8"));
    } catch {
      throw Error("watcher_lock_unidentified");
    }
    try {
      process.kill(pid, 0);
      throw Error("publication_watcher_already_running");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    rmSync(lock, { recursive: true });
    mkdirSync(lock);
  }
  writeFileSync(join(lock, "pid"), String(process.pid));
  const owner = join(root, ".local/review");
  mkdirSync(owner, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(owner, "watcher.json"),
    JSON.stringify({
      pid: process.pid,
      checkout: root,
      command: fileURLToPath(import.meta.url),
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  const release = () => rmSync(lock, { recursive: true, force: true });
  process.on("exit", release);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
}
async function main() {
  if (process.argv.includes("--watch")) claimWatcher();
  let version;
  try {
    version = await sync();
    heartbeat({ checkedAt: new Date().toISOString(), error: null });
  } catch (error) {
    heartbeat({ error: error.message });
    throw error;
  }
  if (!process.argv.includes("--watch")) return;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const result = spawnSync(
        "curl",
        [
          "-fsS",
          "--max-time",
          "10",
          "https://anipotts.com/api/content-version",
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0) throw Error("production_version_unavailable");
      const next = JSON.parse(result.stdout).inventoryVersion;
      if (!Number.isSafeInteger(next))
        throw Error("production_version_invalid");
      if (next !== version) version = await sync();
      heartbeat({
        checkedAt: new Date().toISOString(),
        productionVersion: next,
        error: null,
      });
    } catch (error) {
      heartbeat({ error: error.message });
      console.error(error.message);
    }
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
