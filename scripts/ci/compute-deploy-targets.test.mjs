#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { computeDeployTargets } from "./compute-deploy-targets.mjs";
import "./changed-files.test.mjs";

const empty = {
  www: false,
  admin: false,
  ingest: false,
  newsletter: false,
  state: false,
  weekly_email: false,
};

function expectTargets(name, files, expected) {
  assert.deepEqual(
    computeDeployTargets(files),
    { ...empty, ...expected },
    name,
  );
}

expectTargets(
  "docs-only changes under workers and docs do not deploy",
  [
    "docs/archive/personal-cloud-architecture-2026-05-13.md",
    "workers/state/README.md",
    "apps/admin/README.md",
    ".github/ISSUE_TEMPLATE/bug.md",
    "LICENSE",
  ],
  {},
);

expectTargets(
  "worker docs plus workflow-only changes do not deploy",
  ["workers/state/README.md", ".github/workflows/deploy.yml"],
  {},
);

expectTargets(
  "public site source deploys www",
  ["apps/www/src/pages/index.astro"],
  {
    www: true,
  },
);

expectTargets(
  "admin source and content package deploy admin",
  [
    "apps/admin/src/pages/content/index.astro",
    "packages/content/src/admin/content.ts",
  ],
  { admin: true },
);

expectTargets(
  "admin-control library code deploys admin only",
  ["packages/lib/src/admin-control/index.ts"],
  { admin: true },
);

expectTargets(
  "admin worker config deploys admin",
  ["apps/admin/wrangler.toml"],
  { admin: true },
);

expectTargets(
  "retiring admin-solid does not deploy any worker",
  ["apps/admin-solid/src/routes/index.tsx"],
  {},
);

expectTargets(
  "worker source deploys exact worker",
  ["workers/state/src/index.ts"],
  {
    state: true,
  },
);

expectTargets(
  "worker readme with worker source deploys exact worker",
  ["workers/state/README.md", "workers/state/src/index.ts"],
  {
    state: true,
  },
);

expectTargets(
  "brand changes deploy both visual consumers",
  ["packages/brand/src/tokens.css"],
  { www: true, admin: true },
);

expectTargets(
  "lib changes deploy its remaining Admin consumer",
  ["packages/lib/src/cms/index.ts"],
  { admin: true },
);

expectTargets(
  "shared type changes deploy direct runtime consumers",
  ["packages/types/src/cms.ts"],
  { admin: true, state: true },
);

expectTargets(
  "public content contracts deploy public and admin consumers",
  ["packages/content/src/public/defaults.ts"],
  { www: true, admin: true },
);

expectTargets(
  "root dependency files do not fan out",
  ["package.json", "pnpm-lock.yaml"],
  {},
);

expectTargets(
  "mixed app and worker changes preserve exact targets",
  ["apps/admin/src/pages/proof.astro", "workers/newsletter/src/index.ts"],
  { admin: true, newsletter: true },
);

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

assert.ok(
  deployWorkflow.includes("node scripts/ci/deployment-plan.mjs"),
  "deploy.yml must use the live-aware deployment plan that wraps shared targets",
);

assert.equal(
  deployWorkflow.includes("dorny/paths-filter"),
  false,
  "deploy.yml must not duplicate target rules through paths-filter",
);

expectTargets(
  "reviewed Astryx patch deploys only its Admin consumer",
  ["patches/@astryxdesign__core@0.4.6.patch"],
  { admin: true },
);
expectTargets(
  "tooling ignore files do not select deploy targets",
  [".gitignore", ".prettierignore"],
  {},
);

// The exact patch mapping must be revisited if another workspace adopts core.
const coreConsumers = execFileSync(
  "git",
  [
    "ls-files",
    "apps/*/package.json",
    "packages/*/package.json",
    "workers/*/package.json",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((path) => {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    return [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ].some((key) => manifest[key]?.["@astryxdesign/core"]);
  });
assert.deepEqual(
  coreConsumers,
  ["apps/admin/package.json"],
  "Astryx patch deployment mapping requires an explicit update when consumers change",
);
