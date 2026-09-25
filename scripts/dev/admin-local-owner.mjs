#!/usr/bin/env node

// Builds Admin with ADMIN_LOCAL_OWNER=1 into an ignored directory and serves
// that production bundle through local wrangler dev on loopback. It never
// writes apps/admin/dist, never touches the shared previews, and never uses
// remote Cloudflare resources.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_readRawConfig } from "wrangler";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ADMIN = join(ROOT, "apps", "admin");
const OUT_DIR = join(ADMIN, ".local", "local-owner-dist");
// @astrojs/cloudflare points `wrangler deploy` at the last build through this
// file. A local owner build must never become that target.
const DEPLOY_REDIRECT = join(ADMIN, ".wrangler/deploy/config.json");
const HOST = "127.0.0.1";
const DEFAULT_PORT = 8871;
// The managed Admin preview; dev servers use 4400 to 4999.
const RESERVED_PORTS = new Set([4311]);

function port() {
  const raw = process.env.ADMIN_LOCAL_OWNER_PORT ?? String(DEFAULT_PORT);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("ADMIN_LOCAL_OWNER_PORT must be a port from 1024 to 65535");
  }
  if (RESERVED_PORTS.has(value) || (value >= 4400 && value <= 4999)) {
    throw new Error(`port ${value} belongs to a shared local preview`);
  }
  return value;
}

function run(args, options) {
  execFileSync("pnpm", args, { stdio: "inherit", ...options });
}

function build() {
  const inherited = { ...process.env };
  delete inherited.ADMIN_LOCAL_OWNER;
  run(["content:generate"], { cwd: ROOT, env: inherited });
  run(
    [
      "turbo",
      "build",
      "--filter=@anipotts/admin^...",
      "--output-logs=errors-only",
    ],
    { cwd: ROOT, env: inherited },
  );
  // Astro directly, not turbo: strict env mode would drop the flag, and a
  // cached local owner output must never be restored into dist.
  const redirect = existsSync(DEPLOY_REDIRECT)
    ? readFileSync(DEPLOY_REDIRECT, "utf8")
    : null;
  try {
    run(["exec", "astro", "build"], {
      cwd: ADMIN,
      env: { ...inherited, ADMIN_LOCAL_OWNER: "1" },
    });
  } finally {
    if (redirect === null) rmSync(DEPLOY_REDIRECT, { force: true });
    else writeFileSync(DEPLOY_REDIRECT, redirect);
  }
  console.log(`local owner build: ${OUT_DIR}`);
}

// wrangler dev rewrites Host to the first route's host, which would hide a
// DNS rebinding hostname from the Worker. The served config keeps every
// binding from wrangler.toml but drops routes, so Host reaches the Worker
// unchanged and its own loopback check refuses any other host.
function localWranglerConfig() {
  const { rawConfig } = experimental_readRawConfig({
    config: join(ADMIN, "wrangler.toml"),
  });
  const config = structuredClone(rawConfig);
  delete config.routes;
  delete config.route;
  // The Worker trusts request headers, so the config pins loopback as well
  // as the --ip flag.
  config.dev = { ...config.dev, ip: HOST };
  // The adapter's prebundled Worker and its assets, served as emitted.
  config.main = join(OUT_DIR, "server", "entry.mjs");
  config.no_bundle = true;
  config.rules = [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }];
  config.assets = { ...config.assets, directory: join(OUT_DIR, "client") };
  config.d1_databases = (config.d1_databases ?? []).map((database) =>
    database.migrations_dir
      ? { ...database, migrations_dir: resolve(ADMIN, database.migrations_dir) }
      : database,
  );
  const path = join(ADMIN, ".local", "local-owner-wrangler.json");
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

function serve() {
  const listen = port();
  build();
  if (!existsSync(join(OUT_DIR, "server", "entry.mjs")))
    throw new Error(`missing local owner build in ${OUT_DIR}`);
  const config = localWranglerConfig();
  // The flag is compiled in. Omitting it here shows runtime state cannot
  // turn the identity on or off.
  const runtimeEnv = { ...process.env };
  delete runtimeEnv.ADMIN_LOCAL_OWNER;
  console.log(`local owner Admin: http://${HOST}:${listen}/content`);
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      config,
      "--ip",
      HOST,
      "--port",
      String(listen),
      // Share local D1 and Durable Object state with astro dev.
      "--persist-to",
      join(ADMIN, ".wrangler", "state"),
      "--show-interactive-dev-session=false",
    ],
    { cwd: ADMIN, env: runtimeEnv, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 0 : (code ?? 1);
  });
}

const action = process.argv[2];
try {
  if (action === "build") build();
  else if (action === "serve") serve();
  else throw new Error("usage: admin-local-owner.mjs {build|serve}");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
