import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  IDLE_CPU_SECONDS_PER_MINUTE,
  isIntegrationCheckout,
  nextIdleMinutes,
  parseCount,
  parseGroupCpu,
  parseWorktreeList,
  slotError,
} from "./preview-budget.mjs";

test("worktree paths come from porcelain output", () => {
  const porcelain = [
    "worktree /repo",
    "HEAD abc",
    "detached",
    "",
    "worktree /tmp/wt one",
    "HEAD def",
    "branch refs/heads/x",
    "",
  ].join("\n");
  assert.deepEqual(parseWorktreeList(porcelain), ["/repo", "/tmp/wt one"]);
});

test("group CPU sums every process in a group, including long clocks", () => {
  const totals = parseGroupCpu(
    [
      "  100   0:01.50",
      "  100   1:00.25",
      "  200 1:02:03",
      "  300 1-00:00:01",
    ].join("\n"),
  );
  assert.equal(totals.get(100), 61.75);
  assert.equal(totals.get(200), 3723);
  assert.equal(totals.get(300), 86_401);
});

test("idle minutes accumulate only while CPU stays under the threshold", () => {
  const quiet = IDLE_CPU_SECONDS_PER_MINUTE * 0.5;
  let idle = 0;
  idle = nextIdleMinutes(idle, quiet, 1);
  idle = nextIdleMinutes(idle, quiet * 2, 2);
  assert.equal(idle, 3);
  assert.equal(nextIdleMinutes(idle, IDLE_CPU_SECONDS_PER_MINUTE * 3, 1), 0);
  assert.equal(nextIdleMinutes(idle, 0, 0), 3);
  assert.equal(
    nextIdleMinutes(idle, -10, 1),
    0,
    "a restarted group has no inherited idle time",
  );
});

test("the review lane flag marks the integration checkout", () => {
  assert.equal(
    isIntegrationCheckout("/nonexistent", { ANIPOTTS_REVIEW_LANE: "1" }),
    true,
  );
  assert.equal(isIntegrationCheckout("/nonexistent", {}), false);
});

test("slot errors name the holders and the override", () => {
  const others = [
    {
      worktree: "/wt/a",
      apps: [{ key: "www", url: "http://127.0.0.1:4500", pid: 42 }],
    },
  ];
  assert.equal(slotError([], 1), null);
  assert.equal(slotError(others, 2), null);
  const message = slotError(others, 1);
  assert.match(message, /budget is full \(1\/1/);
  assert.match(message, /\/wt\/a: www http:\/\/127\.0\.0\.1:4500 pid=42/);
  assert.match(message, /ANIPOTTS_WORKER_PREVIEW_SLOTS=2/);
});

test("counts reject negatives and fractions", () => {
  assert.equal(parseCount("X", undefined, 1), 1);
  assert.equal(parseCount("X", "0", 1), 0);
  assert.throws(() => parseCount("X", "-1", 1), /whole number/);
  assert.throws(() => parseCount("X", "1.5", 1), /whole number/);
});

test("concurrent worker startups cannot both scan an empty slot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "preview-startup-"));
  execFileSync("git", ["init", "--quiet", dir]);
  const log = join(dir, "startup.log");
  const moduleUrl = pathToFileURL(
    join(import.meta.dirname, "preview-budget.mjs"),
  ).href;
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
      import { withPreviewStartup } from ${JSON.stringify(moduleUrl)};
      import { appendFileSync } from "node:fs";
      await withPreviewStartup(${JSON.stringify(dir)}, async () => {
        appendFileSync(${JSON.stringify(log)}, "enter\\n");
        await new Promise(done => setTimeout(done, 100));
        appendFileSync(${JSON.stringify(log)}, "leave\\n");
      });`,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(stderr)),
      );
    });
  try {
    await Promise.all([run(), run()]);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
      "enter",
      "leave",
      "enter",
      "leave",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two individually idle groups accumulate idle time independently", async () => {
  const { nextGroupsIdleMinutes } = await import("./preview-budget.mjs");
  const before = new Map([
    [11, 10],
    [22, 10],
  ]);
  assert.equal(
    nextGroupsIdleMinutes(
      2,
      new Map([
        [11, 10.6],
        [22, 10.6],
      ]),
      before,
      1,
    ),
    3,
  );
  assert.equal(
    nextGroupsIdleMinutes(
      2,
      new Map([
        [11, 11.2],
        [22, 10.6],
      ]),
      before,
      1,
    ),
    0,
  );
});
