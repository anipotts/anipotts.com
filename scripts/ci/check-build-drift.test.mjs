import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { changedTrackedPaths } from "./check-build-drift.mjs";

test("validation drift includes tracked edits, staging and deletion but permits ignored output", () => {
  const cwd = mkdtempSync(join(tmpdir(), "build-drift-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  try {
    git("init", "--quiet");
    writeFileSync(join(cwd, ".gitignore"), "dist/\n");
    writeFileSync(join(cwd, "generated.css"), "reviewed theme\n");
    writeFileSync(join(cwd, "env.d.ts"), "reviewed types\n");
    git("add", ".gitignore", "generated.css", "env.d.ts");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "synthetic baseline",
    );
    assert.deepEqual(changedTrackedPaths(cwd), []);
    mkdirSync(join(cwd, "dist"));
    writeFileSync(join(cwd, "dist/output.js"), "ignored build output\n");
    writeFileSync(join(cwd, "untracked-output.txt"), "not reviewed source\n");
    assert.deepEqual(changedTrackedPaths(cwd), []);
    writeFileSync(join(cwd, "generated.css"), "unreviewed generated theme\n");
    assert.deepEqual(changedTrackedPaths(cwd), ["generated.css"]);
    git("add", "generated.css");
    assert.deepEqual(changedTrackedPaths(cwd), ["generated.css"]);
    unlinkSync(join(cwd, "env.d.ts"));
    assert.deepEqual(changedTrackedPaths(cwd), ["env.d.ts", "generated.css"]);
    const cli = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./check-build-drift.mjs", import.meta.url))],
      { cwd, encoding: "utf8" },
    );
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /generated\.css/);
    assert.doesNotMatch(cli.stderr, /unreviewed generated theme/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
