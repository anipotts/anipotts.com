import assert from "node:assert/strict";
import { classify } from "./dependency-maintenance.mjs";

const required = [{ context: "Build, lint, typecheck, test", app_id: 15368 }];
const pr = {
  author: { __typename: "Bot", login: "dependabot" },
  headRepository: { nameWithOwner: "anipotts/anipotts.com" },
  baseRefName: "main",
  headRefName: "dependabot/test",
  headRefOid: "abc",
  isDraft: false,
  files: { pageInfo: { hasNextPage: false } },
  reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  autoMergeRequest: null,
  commits: {
    nodes: [
      {
        commit: {
          oid: "abc",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  __typename: "CheckRun",
                  name: required[0].context,
                  status: "COMPLETED",
                  conclusion: "SUCCESS",
                  checkSuite: { app: { databaseId: 15368 } },
                },
              ],
            },
          },
        },
      },
    ],
  },
};
assert.equal(classify(pr, required), "await_owner_review");
assert.equal(
  classify({ ...pr, autoMergeRequest: { enabledAt: "2026-09-13" } }, required),
  "inspect_auto_merge",
);
assert.equal(
  classify({ ...pr, isDraft: true }, required),
  "inspect_draft_hold",
);
assert.equal(
  classify({ ...pr, mergeStateStatus: "BEHIND" }, required),
  "refresh_base",
);
assert.equal(
  classify({ ...pr, mergeable: "CONFLICTING" }, required),
  "repair_conflict",
);
assert.equal(
  classify(
    {
      ...pr,
      reviewThreads: { ...pr.reviewThreads, nodes: [{ isResolved: false }] },
    },
    required,
  ),
  "address_review",
);
assert.equal(
  classify(
    { ...pr, author: { __typename: "User", login: "dependabot" } },
    required,
  ),
  "excluded",
);
assert.equal(
  classify(
    { ...pr, headRepository: { nameWithOwner: "attacker/fork" } },
    required,
  ),
  "excluded",
);
assert.equal(classify({ ...pr, headRefOid: "new" }, required), "wait_checks");
for (const conclusion of ["FAILURE", "SKIPPED", "NEUTRAL", "CANCELLED"]) {
  const changed = structuredClone(pr);
  changed.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion =
    conclusion;
  assert.equal(classify(changed, required), "repair_checks");
}
for (const state of [
  "pending",
  "failed",
  "behind",
  "conflicting",
  "draft",
  "stale-head",
  "review",
]) {
  const changed = structuredClone(pr);
  changed.autoMergeRequest = { enabledAt: "2026-09-13" };
  const check =
    changed.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0];
  if (state === "pending") check.status = "IN_PROGRESS";
  if (state === "failed") check.conclusion = "FAILURE";
  if (state === "behind") changed.mergeStateStatus = "BEHIND";
  if (state === "conflicting") changed.mergeable = "CONFLICTING";
  if (state === "draft") changed.isDraft = true;
  if (state === "stale-head") changed.headRefOid = "new";
  if (state === "review")
    changed.reviewThreads.nodes.push({ isResolved: false });
  assert.equal(classify(changed, required), "inspect_auto_merge", state);
}
assert.equal(classify(pr, required), classify(pr, required));
console.log("dependency maintenance classification passed");

// Exercise Dependabot's first-match behavior across runtime/dev boundaries.
// An update-type-only group can split packages that must move together.
const { readFileSync } = await import("node:fs");
const { parse } = await import("yaml");
const configuration = parse(readFileSync(".github/dependabot.yml", "utf8"));
const npm = configuration.updates.find(
  (update) => update["package-ecosystem"] === "npm",
);
const matches = (pattern, name) =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  ).test(name);
function firstGroup(name, type) {
  return Object.entries(npm.groups).find(([, group]) => {
    if (group["dependency-type"] && group["dependency-type"] !== type)
      return false;
    return (
      (!group.patterns ||
        group.patterns.some((pattern) => matches(pattern, name))) &&
      !group["exclude-patterns"]?.some((pattern) => matches(pattern, name))
    );
  })?.[0];
}
for (const family of [
  [
    ["react", "production"],
    ["react-dom", "production"],
    ["@types/react", "development"],
    ["@types/react-dom", "development"],
  ],
  [
    ["astro", "production"],
    ["@astrojs/cloudflare", "production"],
    ["@astrojs/markdown-remark", "development"],
    ["@cloudflare/vite-plugin", "development"],
    ["wrangler", "development"],
  ],
  [
    ["@astryxdesign/core", "production"],
    ["@astryxdesign/theme-neutral", "production"],
    ["@astryxdesign/cli", "development"],
  ],
  [
    ["e2e", "development"],
    ["@e2e-dev/web", "development"],
    ["playwright", "development"],
    ["@playwright/test", "development"],
  ],
]) {
  const groups = family.map(([name, type]) => firstGroup(name, type));
  assert.ok(groups.every(Boolean), "each compatibility family must be grouped");
  assert.equal(
    new Set(groups).size,
    1,
    `${family.map(([name]) => name).join(", ")} must move together`,
  );
}
assert.notEqual(
  firstGroup("react", "production"),
  firstGroup("wrangler", "development"),
);
assert.ok(
  npm.ignore.some(
    (rule) =>
      rule["dependency-name"] === "@types/node" &&
      rule["update-types"].includes("version-update:semver-major"),
  ),
);
const admin = JSON.parse(readFileSync("apps/admin/package.json", "utf8"));
const lock = parse(readFileSync("pnpm-lock.yaml", "utf8"));
const react = lock.importers["apps/admin"].dependencies.react.version;
const dom =
  lock.importers["apps/admin"].dependencies["react-dom"].version.split("(")[0];
assert.equal(
  react,
  dom,
  "the frozen lock must pair identical React and DOM runtimes",
);
const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
const runtime = ci.jobs.ci.steps
  .find((step) => step.name === "Setup Node")
  .with["node-version"].split(".")[0];
for (const file of [
  "apps/admin/package.json",
  "packages/lib/package.json",
  "workers/state/package.json",
]) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(
    manifest.devDependencies["@types/node"].replace(/^[~^]/, "").split(".")[0],
    runtime,
    `${file} declarations must match CI's Node major`,
  );
}
assert.equal(admin.dependencies.react, admin.dependencies["react-dom"]);
console.log("dependency compatibility families passed");
