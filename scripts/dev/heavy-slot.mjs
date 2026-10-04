#!/usr/bin/env node

// Runs one heavy local job (full validation, end-to-end suites, scoped check
// runs) at a time across every worktree of this repository on this host.
// Others wait in turn instead of stacking builds and browsers into swap.
//
//   node scripts/dev/heavy-slot.mjs '<shell command>'
//
// The lock lives in the shared git directory, so all linked worktrees see it.
// Nested heavy commands inherit the held slot. CI runs unlocked. A lock whose
// holder has exited is reclaimed. If the lock cannot be created at all (for
// example a sandbox that protects .git), the job runs without it.

import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const POLL_MS = 2_000;
const NOTICE_MS = 30_000;

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function lockPath(cwd = process.cwd()) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return join(resolve(cwd, common), "anipotts-heavy-slot");
}

function readHolder(path) {
  try {
    return JSON.parse(readFileSync(join(path, "holder.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Returns "acquired", "busy" with the holder, or "unavailable". */
export function tryAcquire(path, holder) {
  try {
    mkdirSync(path);
  } catch (error) {
    if (error.code !== "EEXIST") return { state: "unavailable", error };
    const current = readHolder(path);
    // A lock without a readable holder may be mid-creation; give it a moment.
    if (current && !isAlive(current.pid)) {
      rmSync(path, { recursive: true, force: true });
      return tryAcquire(path, holder);
    }
    return { state: "busy", holder: current };
  }
  writeFileSync(join(path, "holder.json"), `${JSON.stringify(holder)}\n`);
  return { state: "acquired" };
}

export function release(path, pid = process.pid) {
  if (readHolder(path)?.pid === pid)
    rmSync(path, { recursive: true, force: true });
}

async function acquire(path, holder) {
  let lastNotice = 0;
  for (;;) {
    const result = tryAcquire(path, holder);
    if (result.state !== "busy") return result.state;
    if (Date.now() - lastNotice >= NOTICE_MS) {
      const other = result.holder;
      console.error(
        other
          ? `heavy-slot: waiting for ${other.command} in ${other.cwd} (pid ${other.pid}, since ${other.startedAt})`
          : "heavy-slot: waiting for another heavy job",
      );
      lastNotice = Date.now();
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}

function run(command, env) {
  return new Promise((done) => {
    const child = spawn(command, { shell: true, stdio: "inherit", env });
    const forward = (signal) => child.kill(signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("exit", (code, signal) => done(signal ? 1 : (code ?? 1)));
  });
}

async function main() {
  const command = process.argv.slice(2).join(" ");
  if (!command) throw new Error("usage: heavy-slot.mjs '<shell command>'");
  if (process.env.CI || process.env.ANIPOTTS_HEAVY_SLOT === "held") {
    return run(command, process.env);
  }
  let path = null;
  try {
    path = lockPath();
  } catch {
    // Outside a git checkout there is nothing to coordinate with.
  }
  const state = path
    ? await acquire(path, {
        pid: process.pid,
        cwd: process.cwd(),
        command,
        startedAt: new Date().toISOString(),
      })
    : "unavailable";
  if (state === "unavailable") {
    console.error("heavy-slot: lock unavailable; running without coordination");
    return run(command, process.env);
  }
  const cleanup = () => release(path);
  process.on("exit", cleanup);
  return run(command, { ...process.env, ANIPOTTS_HEAVY_SLOT: "held" });
}

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
