#!/usr/bin/env node

// Serve the built public Worker against a seeded, temporary local D1. This
// process is owned by the e2e runner and has no remote Cloudflare bindings.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readPublicE2EMigrations } from "./public-e2e-migrations.mjs";

export function publicE2EWorkerArgs({ port, config, state }) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("pass a local port from 1024 to 65535");
  return [
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
    // Let the OS bind the inspector directly, without a probe/release race.
    "--inspector-port",
    "0",
    "--show-interactive-dev-session=false",
  ];
}

// Keep Wrangler in the runner-owned process group. e2e terminates that whole
// group, including workerd descendants, and refuses to reuse foreign listeners.
// Wait for child close before deleting its temporary D1/R2 state.
export function servePublicE2EWorker({
  cli,
  port,
  config,
  state,
  temporary,
  env,
}) {
  const args = publicE2EWorkerArgs({ port, config, state });
  console.log(
    `[www-e2e] pid=${process.pid} http=127.0.0.1:${port} inspector=0`,
  );
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, [cli, ...args], {
      cwd: temporary,
      env,
      stdio: "inherit",
    });
    let stopping = false;
    let timer;
    const stop = (signal) => {
      if (stopping) return;
      stopping = true;
      worker.kill(signal);
      timer = setTimeout(() => worker.kill("SIGKILL"), 5_000);
    };
    const interrupt = () => stop("SIGINT");
    const terminate = () => stop("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    function cleanup() {
      clearTimeout(timer);
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    }
    worker.once("error", (error) => {
      cleanup();
      reject(error);
    });
    worker.once("close", (code) => {
      cleanup();
      resolve(stopping ? 0 : (code ?? 1));
    });
  });
}

async function main() {
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
    return await servePublicE2EWorker({
      cli,
      port,
      config,
      state,
      temporary,
      env,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
