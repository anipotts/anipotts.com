import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { release, tryAcquire } from "./heavy-slot.mjs";

const holder = (pid) => ({
  pid,
  cwd: "/wt",
  command: "pnpm validate",
  startedAt: "now",
});

test("one holder at a time, released only by its owner", () => {
  const dir = mkdtempSync(join(tmpdir(), "heavy-slot-"));
  const lock = join(dir, "lock");
  try {
    assert.equal(tryAcquire(lock, holder(process.pid)).state, "acquired");
    const busy = tryAcquire(lock, holder(process.pid + 1));
    assert.equal(busy.state, "busy");
    assert.equal(busy.holder.pid, process.pid);
    release(lock, process.pid + 1);
    assert.ok(existsSync(lock), "a non-owner cannot release the slot");
    release(lock, process.pid);
    assert.ok(!existsSync(lock));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a slot whose holder exited is reclaimed", () => {
  const dir = mkdtempSync(join(tmpdir(), "heavy-slot-"));
  const lock = join(dir, "lock");
  try {
    const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"]).pid;
    assert.equal(tryAcquire(lock, holder(exited)).state, "acquired");
    assert.equal(tryAcquire(lock, holder(process.pid)).state, "acquired");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an uncreatable lock reports unavailable instead of blocking", () => {
  assert.equal(
    tryAcquire("/nonexistent-root/anipotts-heavy-slot", holder(process.pid))
      .state,
    "unavailable",
  );
});

test("CI and nested runs skip the lock and keep the exit code", () => {
  const script = join(import.meta.dirname, "heavy-slot.mjs");
  for (const env of [{ CI: "1" }, { ANIPOTTS_HEAVY_SLOT: "held" }]) {
    const result = spawnSync(process.execPath, [script, "exit 3"], {
      env: { ...process.env, ...env },
    });
    assert.equal(result.status, 3);
  }
});

test("holderless locks have a grace period and then recover", () => {
  const dir = mkdtempSync(join(tmpdir(), "heavy-orphan-"));
  const lock = join(dir, "lock");
  try {
    mkdirSync(lock);
    assert.equal(tryAcquire(lock, holder(process.pid)).state, "busy");
    const old = new Date(Date.now() - 10_000);
    utimesSync(lock, old, old);
    assert.equal(tryAcquire(lock, holder(process.pid)).state, "acquired");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("targeted cancellation stops descendants before the wrapper finishes", async () => {
  if (process.platform === "win32") return;
  const dir = mkdtempSync(join(tmpdir(), "heavy-cancel-"));
  const pidFile = join(dir, "pid");
  const script = join(import.meta.dirname, "heavy-slot.mjs");
  const payload = `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);`;
  const quoted = "'" + payload.replaceAll("'", "'\\''") + "'";
  const wrapper = spawn(
    process.execPath,
    [script, `${process.execPath} -e ${quoted}`],
    { env: { ...process.env, CI: "1" }, stdio: "ignore" },
  );
  const exit = new Promise((resolve) => wrapper.once("exit", resolve));
  try {
    for (let i = 0; !existsSync(pidFile) && i < 100; i++)
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    wrapper.kill("SIGTERM");
    await exit;
    const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], {
      encoding: "utf8",
    }).stdout.trim();
    assert.ok(
      !state || state.startsWith("Z"),
      `descendant still running: ${state}`,
    );
  } finally {
    wrapper.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});
