#!/usr/bin/env node
import { spawn, spawnSync, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, syncHealth, nodeSupported } from "./review-state.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const state = join(root, ".local/review");
const watcher = join(root, "scripts/dev/sync-published-preview.mjs");
const supervisor = join(root, "scripts/dev/review-supervisor.mjs");
const action = process.argv[2] ?? "ensure";
mkdirSync(state, { recursive: true, mode: 0o700 });
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
const run = (args) => {
  const r = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) throw Error(`command failed: pnpm ${args.join(" ")}`);
};
function owns(record, command = watcher) {
  if (!record || record.checkout !== root || !Number.isSafeInteger(record.pid))
    return false;
  try {
    process.kill(record.pid, 0);
    const cmd = execFileSync(
      "ps",
      ["-p", String(record.pid), "-o", "command="],
      { encoding: "utf8" },
    );
    return cmd.includes(command);
  } catch {
    return false;
  }
}
async function probe(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function report(checkCredentials = false) {
  const metadata = readJson(join(root, ".local/dev-servers/processes.json"));
  const publicRecord = metadata?.apps?.find((a) => a.key === "www");
  const admin = await probe("http://localhost:4311/api/review-identity");
  const www = publicRecord
    ? await probe(`${publicRecord.url}/api/review-identity`)
    : null;
  const sync = readJson(join(root, ".local/published-preview/status.json"));
  const record = readJson(join(state, "watcher.json"));
  const issues = [];
  if (!nodeSupported(process.version))
    issues.push(`Node ${process.version} unsupported; use Node >=24.19.0 <26`);
  if (!existsSync(join(root, "node_modules/.pnpm")))
    issues.push("dependencies missing; run pnpm install --frozen-lockfile");
  if (!www || www.checkout !== root)
    issues.push("www preview missing or wrong checkout; run pnpm review");
  if (!admin || admin.checkout !== root)
    issues.push(
      "admin port4311 missing or belongs to another checkout; use that checkout's pnpm admin:preview:stop before pnpm review",
    );
  if (!owns(readJson(join(state, "supervisor.json")), supervisor))
    issues.push("review supervisor stopped; run pnpm review");
  if (!owns(record))
    issues.push("publication watcher not owned/running; run pnpm review");
  if (syncHealth(sync).state !== "current")
    issues.push(
      syncHealth(sync).label +
        "; inspect .local/review/watcher.log and rerun pnpm review",
    );
  let credentials = "last sync evidence only";
  if (checkCredentials) {
    const r = spawnSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "anipotts-content",
        "--remote",
        "--config",
        "apps/www/wrangler.toml",
        "--command",
        "SELECT version FROM editorial_published_inventory WHERE singleton=1",
        "--json",
      ],
      { cwd: root, encoding: "utf8", timeout: 30000 },
    );
    credentials =
      r.status === 0
        ? "read-only production access verified"
        : "production read authorization unavailable";
    if (r.status !== 0)
      issues.push(
        credentials +
          "; restore the approved Cloudflare session, then rerun pnpm review",
      );
  }
  const result = {
    checkout: root,
    branch: git("branch", "--show-current"),
    revision: git("rev-parse", "HEAD"),
    dirty: Boolean(git("status", "--porcelain")),
    urls: { www: publicRecord?.url ?? null, admin: "http://localhost:4311/" },
    sync: { ...sync, ...syncHealth(sync) },
    credentials,
    blockers: issues,
  };
  writeFileSync(join(state, "status.json"), JSON.stringify(result, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}
async function ensure() {
  if (!nodeSupported(process.version)) throw Error("use Node >=24.19.0 <26");
  if (!existsSync(join(root, "node_modules/.pnpm")))
    throw Error("run pnpm install --frozen-lockfile first");
  run(["dev:www"]);
  run(["admin:preview:ensure"]);
  let record = readJson(join(state, "supervisor.json"));
  if (!owns(record, supervisor)) {
    const fd = openSync(join(state, "watcher.log"), "a", 0o600);
    const child = spawn(process.execPath, [supervisor], {
      cwd: root,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    closeSync(fd);
    child.unref();
    record = {
      pid: child.pid,
      checkout: root,
      command: supervisor,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(join(state, "supervisor.json"), JSON.stringify(record), {
      mode: 0o600,
    });
  }
  for (let i = 0; i < 40; i++) {
    if (!owns(record, supervisor)) break;
    const s = readJson(join(root, ".local/published-preview/status.json"));
    if (
      syncHealth(s).state === "current" &&
      owns(readJson(join(state, "watcher.json")))
    )
      break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const result = await report();
  if (result.blockers.length) process.exitCode = 1;
}
async function main() {
  if (action === "doctor" || action === "status") {
    const r = await report(
      action === "doctor" && !process.argv.includes("--offline"),
    );
    if (r.blockers.length) process.exitCode = 1;
    return;
  }
  if (action !== "ensure")
    throw Error("use pnpm review, review:status or review:doctor");
  const lock = join(state, "ensure.lock");
  try {
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), String(process.pid));
  } catch {
    const pid = Number(readFileSync(join(lock, "pid"), "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw Error(
        "review startup lock has no verified owner; inspect .local/review/ensure.lock",
      );
    let live = true;
    try {
      process.kill(pid, 0);
    } catch {
      live = false;
    }
    if (live)
      throw Error(
        "another review startup is in progress; run pnpm review:status",
      );
    rmSync(lock, { recursive: true });
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), String(process.pid));
  }
  try {
    await ensure();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
