#!/usr/bin/env node

// Serve the built public Worker against a seeded, temporary local D1. This
// process is owned by the e2e runner and has no remote Cloudflare bindings.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicE2EMigrations } from "./public-e2e-migrations.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("pass a local port from 1024 to 65535");

const temporary = mkdtempSync(join(tmpdir(), "www-e2e-"));
const state = join(temporary, "state");
const config = join(temporary, "wrangler.json");
const databaseId = "00000000-0000-0000-0000-000000000001";
const mediaBucket = "synthetic-content-media";
const cli = join(
  dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };
let worker;
let closing = false;

function run(args, cwd = temporary) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0)
    throw new Error(`${args[0]} failed: ${result.stderr || result.stdout}`);
}

function close(code = 0) {
  if (closing) return;
  closing = true;
  if (worker && worker.exitCode === null) worker.kill("SIGTERM");
  rmSync(temporary, { recursive: true, force: true });
  process.exit(code);
}

process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());

try {
  writeFileSync(
    config,
    JSON.stringify({
      name: "cms-reader-e2e",
      main: join(root, "apps/www/dist/server/entry.mjs"),
      no_bundle: true,
      rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
      compatibility_date: "2026-05-01",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        directory: join(root, "apps/www/dist/client"),
        binding: "ASSETS",
        run_worker_first: true,
      },
      vars: { CONTENT_RUNTIME: "cms" },
      d1_databases: [
        {
          binding: "CONTENT_DB",
          database_name: "synthetic-content",
          database_id: databaseId,
        },
      ],
      r2_buckets: [{ binding: "CONTENT_MEDIA", bucket_name: mediaBucket }],
    }),
  );
  const migrations = join(temporary, "migrations.sql");
  writeFileSync(
    migrations,
    readPublicE2EMigrations(
      join(root, "apps/admin/migrations/content-publication"),
    ),
  );
  run([
    cli,
    "d1",
    "execute",
    "CONTENT_DB",
    "--local",
    "--config",
    config,
    "--persist-to",
    state,
    "--file",
    migrations,
  ]);
  const seed = [
    join(root, "scripts/content/seed-content-d1.mjs"),
    "--database",
    "synthetic-content",
    "--database-id",
    databaseId,
    "--bucket",
    mediaBucket,
    "--local",
    "--persist-to",
    state,
  ];
  run([...seed, "--upload-media"], root);
  run(
    [
      ...seed,
      "--apply",
      "--media-ready",
      "--published-at",
      "2026-09-21T00:00:00.000Z",
    ],
    root,
  );
  worker = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--config",
      config,
      "--persist-to",
      state,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--show-interactive-dev-session=false",
    ],
    { cwd: temporary, env, stdio: "inherit" },
  );
  worker.once("exit", (code) => close(code ?? 1));
} catch (error) {
  console.error(error);
  close(1);
}
