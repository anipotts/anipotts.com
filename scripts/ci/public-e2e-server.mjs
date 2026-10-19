#!/usr/bin/env node

// Serve the built public Worker against a seeded, temporary local D1. This
// process is owned by the e2e runner and has no remote Cloudflare bindings.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
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

// Setup commands have task-owned process groups, so cancellation reaches
// grandchildren during migration/media seeding. The final Worker remains in
// the e2e runner-owned group. Never use
// a port or process-name lookup to find something to terminate.
function signalGroup(child, signal, ownGroup) {
  if (!child.pid) return;
  try {
    if (!ownGroup || process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
function groupRunning(child, ownGroup) {
  if (!child.pid) return false;
  if (!ownGroup || process.platform === "win32")
    return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
async function finishGroup(child, ownGroup) {
  if (!groupRunning(child, ownGroup)) return;
  signalGroup(child, "SIGTERM", ownGroup);
  const deadline = Date.now() + 1_000;
  while (groupRunning(child, ownGroup) && Date.now() < deadline)
    await delay(25);
  if (!groupRunning(child, ownGroup)) return;
  signalGroup(child, "SIGKILL", ownGroup);
  const forcedDeadline = Date.now() + 1_000;
  while (groupRunning(child, ownGroup) && Date.now() < forcedDeadline)
    await delay(25);
  if (groupRunning(child, ownGroup))
    throw Object.assign(
      new Error("owned public e2e process group did not close"),
      {
        code: "PUBLIC_E2E_GROUP_OPEN",
      },
    );
}

function runOwnedCommand(
  args,
  { cwd, env, signal, timeout, inherit = false, ownGroup = true },
) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      detached: ownGroup && process.platform !== "win32",
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let failure;
    let output = "";
    let escalation;
    const stop = (reason) => {
      if (failure) return;
      failure = reason;
      signalGroup(child, "SIGTERM", ownGroup);
      escalation = setTimeout(
        () => signalGroup(child, "SIGKILL", ownGroup),
        5_000,
      );
    };
    const abort = () => stop(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const deadline =
      timeout === undefined
        ? undefined
        : setTimeout(() => stop(new Error(`${args[0]} timed out`)), timeout);
    const collect = (chunk) => {
      output = (output + chunk.toString()).slice(-16_384);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.once("error", (error) => {
      failure ??= error;
    });
    child.once("close", async (code) => {
      clearTimeout(deadline);
      clearTimeout(escalation);
      signal.removeEventListener("abort", abort);
      try {
        await finishGroup(child, ownGroup);
        if (failure) reject(failure);
        else resolve({ code: code ?? 1, output });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Install handlers before creating any temporary state or starting setup. The
// operation unwinds only after its owned children close; finally can then remove
// temporary D1/R2 state without racing a still-running seed command.
async function withCancellation(operation) {
  const controller = new AbortController();
  const interrupt = () =>
    controller.abort(new DOMException("public e2e interrupted", "AbortError"));
  const terminate = () =>
    controller.abort(new DOMException("public e2e terminated", "AbortError"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && error === controller.signal.reason)
      return 0;
    throw error;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

export function servePublicE2EWorker(options) {
  const serve = async (signal) => {
    const { cli, port, config, state, temporary, env } = options;
    const args = publicE2EWorkerArgs({ port, config, state });
    console.log(
      `[www-e2e] pid=${process.pid} http=127.0.0.1:${port} inspector=0`,
    );
    const result = await runOwnedCommand([cli, ...args], {
      cwd: temporary,
      env,
      signal,
      inherit: true,
      ownGroup: false,
    });
    return result.code;
  };
  return options.signal ? serve(options.signal) : withCancellation(serve);
}

export function runPublicE2EServer({
  port,
  root = fileURLToPath(new URL("../../", import.meta.url)),
  cli = join(
    dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
    "bin/wrangler.js",
  ),
  env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
}) {
  publicE2EWorkerArgs({ port });
  return withCancellation(async (signal) => {
    const temporary = mkdtempSync(join(tmpdir(), "www-e2e-"));
    const state = join(temporary, "state");
    const config = join(temporary, "wrangler.json");
    const databaseId = "00000000-0000-0000-0000-000000000001";
    const mediaBucket = "synthetic-content-media";
    let cleanupSafe = true;
    async function run(args, cwd = temporary) {
      const result = await runOwnedCommand(args, {
        cwd,
        env,
        signal,
        timeout: 120_000,
      });
      if (result.code !== 0)
        throw new Error(`${args[0]} failed: ${result.output}`);
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
      await run([
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
      await run([...seed, "--upload-media"], root);
      await run(
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
        signal,
      });
    } catch (error) {
      if (error.code === "PUBLIC_E2E_GROUP_OPEN") cleanupSafe = false;
      throw error;
    } finally {
      // Fail closed if an owned group could not be reaped. Retain state rather
      // than deleting files a surviving command might still be using.
      if (cleanupSafe) rmSync(temporary, { recursive: true, force: true });
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await runPublicE2EServer({
      port: Number(process.argv[2]),
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
