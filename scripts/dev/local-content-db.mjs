// Bootstraps the local CONTENT_DB that `astro dev` gives an app from its
// wrangler.toml. Local only: every wrangler call passes --local with the app's
// own .wrangler/state, and this module refuses to build a remote command.
//
// A fresh worktree has an empty local D1, so www content routes answer 503 and
// the Admin inventory fails until the content-publication migrations run and
// the Git records are seeded as the first published revision. This does both,
// once: an already migrated and seeded database is left untouched.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = join(ROOT, "apps/admin/migrations/content-publication");
const SEED = join(ROOT, "scripts/content/seed-content-d1.mjs");
// The dedicated content database, as both wrangler.toml files bind it.
// Local D1 state is keyed by this id under the persist directory.
export const CONTENT_DATABASE = "anipotts-content";
export const CONTENT_DATABASE_ID = "2679fc97-e251-46b7-ad01-db8b9fe04e8d";

export const PROBE_SQL =
  "SELECT (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'editorial_published_inventory') AS inventory, " +
  "(SELECT count(*) FROM pragma_table_info('editorial_published_revisions') WHERE name = 'content_schema_version') AS schema_version";
export const VERSION_SQL =
  "SELECT version FROM editorial_published_inventory WHERE singleton = 1";

/** What a probed database still needs. Pure, so tests cover every state. */
export function bootstrapPlan(probe, version) {
  const migrations = [];
  if (!probe?.inventory) migrations.push("0001", "0002");
  else if (!probe.schema_version) migrations.push("0002");
  const seed = migrations.includes("0001") || !(Number(version) > 0);
  return { migrations, seed };
}

/** Every argument list this module hands wrangler goes through here. */
export function localArgs(args, persistTo) {
  if (args.some((arg) => /^--remote\b|^--env\b/.test(arg)))
    throw new Error("local content database bootstrap never runs remotely");
  return [...args, "--local", "--persist-to", persistTo];
}

function wranglerCli() {
  return join(
    dirname(
      createRequire(join(ROOT, "apps/www/package.json")).resolve(
        "wrangler/package.json",
      ),
    ),
    "bin/wrangler.js",
  );
}

export function ensureLocalContentDatabase({
  appDir,
  log = (line) => console.log(line),
  run = spawnSync,
} = {}) {
  const persistTo = join(appDir, ".wrangler", "state");
  const temporary = mkdtempSync(join(tmpdir(), "local-content-db-"));
  const config = join(temporary, "wrangler.json");
  // No account and no routes: nothing in this config can address Cloudflare.
  writeFileSync(
    config,
    JSON.stringify({
      name: "local-content-db",
      compatibility_date: "2026-05-01",
      d1_databases: [
        {
          binding: "CONTENT_DB",
          database_name: CONTENT_DATABASE,
          database_id: CONTENT_DATABASE_ID,
        },
      ],
    }),
  );
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };
  const node = (args) => {
    const result = run(process.execPath, args, {
      cwd: temporary,
      env,
      encoding: "utf8",
      timeout: 120_000,
    });
    if (result.status !== 0)
      throw new Error(
        `local content database: ${args.slice(1, 3).join(" ")} failed\n${result.stderr ?? ""}`,
      );
    return result.stdout ?? "";
  };
  const d1 = (extra) =>
    node([
      wranglerCli(),
      ...localArgs(
        ["d1", "execute", CONTENT_DATABASE, "--config", config, ...extra],
        persistTo,
      ),
    ]);
  const query = (sql) => {
    const out = d1(["--json", "--command", sql]);
    return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
  };
  try {
    const probe = query(PROBE_SQL)[0];
    const version = probe?.inventory ? query(VERSION_SQL)[0]?.version : null;
    const plan = bootstrapPlan(probe, version);
    if (plan.migrations.length === 0 && !plan.seed) {
      log(`local content database ready (${persistTo})`);
      return plan;
    }
    log(
      `local content database: bootstrapping ${persistTo}` +
        (plan.migrations.length
          ? ` (migrations ${plan.migrations.join(", ")}` +
            (plan.seed ? ", seed" : "") +
            ")"
          : " (seed)"),
    );
    const files = readdirSync(MIGRATIONS).sort();
    for (const id of plan.migrations) {
      const file = files.find((name) => name.startsWith(`${id}_`));
      if (!file) throw new Error(`missing content migration ${id}`);
      d1(["--yes", "--file", join(MIGRATIONS, file)]);
    }
    if (plan.seed) {
      for (const step of [["--upload-media"], ["--apply", "--media-ready"]])
        node([SEED, ...localArgs(step, persistTo)]);
    }
    log("local content database: bootstrapped");
    return plan;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
