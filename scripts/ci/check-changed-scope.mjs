#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { isBroadChangeLine } from "./path-manifest.mjs";
import { classifyRelease, unclassifiedPaths } from "./release-policy.mjs";
import { changedFiles } from "./changed-files.mjs";

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const base = process.env.CHANGED_SCOPE_BASE || "origin/main";
const args = process.argv.slice(2);
const workingTree = !args.includes("--commits-only");
const unknown = args.filter(
  (arg) => !["--working-tree", "--commits-only"].includes(arg),
);
if (unknown.length)
  throw new Error(`unknown check:changed option: ${unknown.join(", ")}`);
if (!workingTree && args.includes("--working-tree"))
  throw new Error("choose either --working-tree or --commits-only");
const changes = changedFiles({ base, workingTree });

if (changes.length === 0) {
  console.log(
    `changed scope: clean against ${base}${workingTree ? " including working tree" : " (commits only)"}`,
  );
  process.exit(0);
}

// CI fails Classify release on any path no rule names. Untracked files never
// reach CI, so they only warn; .codex-workspaces/ holds nested agent worktrees.
// Partition by record so a staged delete of an untracked path still counts.
const untracked = new Set(
  workingTree
    ? execFileSync(
        "git",
        ["ls-files", "--others", "--exclude-standard", "-z"],
        {
          encoding: "utf8",
        },
      )
        .split("\0")
        .filter(Boolean)
        .map((path) => `A\t${path}`)
    : [],
);
for (const path of unclassifiedPaths(
  changes.filter((line) => untracked.has(line)),
)) {
  console.warn(
    `changed scope: warning: untracked path is unclassified; ci only sees committed files: ${path}`,
  );
}
const unclassified = unclassifiedPaths(
  changes.filter((line) => !untracked.has(line)),
);
if (unclassified.length > 0) {
  console.error(
    [
      "changed scope: tracked or committed paths match no release rule:",
      ...unclassified.map((path) => `  ${path}`),
      "add a rule in scripts/ci/path-manifest.mjs, which scripts/ci/release-policy.mjs applies; ci Classify release fails on these.",
    ].join("\n"),
  );
  process.exit(1);
}

const release = classifyRelease(changes, {
  sourceSha: git("rev-parse", "HEAD"),
  eventName: "local",
});
const targets = Object.entries(release.deploy_targets)
  .filter(([, enabled]) => enabled)
  .map(([target]) => target);

console.log(
  `changed scope: ${targets.join(",") || "non-deployable"}${workingTree ? " including working tree" : " (commits only)"}`,
);

const broad = changes.some(isBroadChangeLine);

if (
  broad ||
  release.ci_policy_changed ||
  release.d1_changed ||
  targets.some((target) => target !== "www" && target !== "admin")
) {
  run("pnpm", ["validate"]);
  process.exit(0);
}

run("pnpm", ["format:check"]);
if (release.deploy_targets.www) {
  run("pnpm", ["test:public-boundary"]);
  run("pnpm", ["test:public-routes"]);
  run("pnpm", ["test:public-copy"]);
  run("pnpm", ["turbo", "build", "--filter=@anipotts/www..."]);
  run("pnpm", ["turbo", "lint", "--filter=@anipotts/www..."]);
  run("pnpm", ["turbo", "typecheck", "--filter=@anipotts/www..."]);
  run("pnpm", ["turbo", "test", "--filter=@anipotts/www..."]);
}
if (release.deploy_targets.admin) {
  run("pnpm", ["test:admin-routes"]);
  run("pnpm", ["test:admin-fixture-boundary"]);
  run("pnpm", ["turbo", "build", "--filter=@anipotts/admin..."]);
  run("pnpm", ["turbo", "lint", "--filter=@anipotts/admin..."]);
  run("pnpm", ["turbo", "typecheck", "--filter=@anipotts/admin..."]);
  run("pnpm", ["turbo", "test", "--filter=@anipotts/admin..."]);
}
