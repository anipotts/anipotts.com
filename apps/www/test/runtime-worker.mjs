import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

/** A real built worker, with no production resources or publication overrides. */
export async function startPublicTestWorker() {
  if (process.env.WWW_TEST_ORIGIN)
    return { origin: process.env.WWW_TEST_ORIGIN, stop: async () => {} };
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), "www-built-test-"));
  const config = join(temporary, "wrangler.json");
  await writeFile(
    config,
    JSON.stringify({
      name: "www-built-test",
      vars: { CONTENT_MODE: "git" },
      main: join(root, "apps/www/dist/_worker.js/index.js"),
      compatibility_date: "2026-05-01",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        binding: "ASSETS",
        directory: join(root, "apps/www/dist"),
        run_worker_first: true,
      },
    }),
  );
  const child = spawn(
    join(root, "node_modules/.bin/wrangler"),
    ["dev", "--config", config, "--local", "--ip", "127.0.0.1", "--port", "0"],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        WRANGLER_REGISTRY_PATH: join(temporary, "registry"),
        WRANGLER_LOG_PATH: join(temporary, "logs"),
        WRANGLER_SEND_METRICS: "false",
      },
    },
  );
  async function stop() {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      process.kill(-child.pid, "SIGTERM");
      await exited;
    }
    await rm(temporary, { recursive: true, force: true });
  }
  let log = "";
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(`Built worker startup timed out: ${log.slice(-1500)}`),
          ),
        30000,
      );
      const read = (chunk) => {
        log = (log + chunk.toString()).slice(-8000);
        const match = log.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/u);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Built worker exited ${code}: ${log.slice(-1500)}`));
      });
    });
    return { origin, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
