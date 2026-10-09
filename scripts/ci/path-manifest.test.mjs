#!/usr/bin/env node

// Golden release corpus and path manifest checks. Every recorded change line
// is replayed through the release classifier, the deploy-target selector,
// Security Review's path filter and check:changed's broad escalation, and any
// difference fails. A refactor of the path rules must replay with 0
// differences. An intended rule change regenerates the corpus with
// `node scripts/ci/path-manifest.test.mjs --write`, and its json diff is the
// review record of every classification that moved.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  PATH_RULES,
  isBroadChangeLine,
  matchesPath,
  matchingRules,
  rulesOfKind,
} from "./path-manifest.mjs";
import {
  DEPLOY_TARGETS,
  classifyRelease,
  computeDeployTargets,
  githubOutputs,
  isReleaseIgnored,
  unclassifiedPaths,
} from "./release-policy.mjs";
import { isSensitivePath } from "./security-review.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = new URL("./fixtures/release-corpus.json", import.meta.url);
const STATUSES = ["M", "A", "D"];
// No single rule may cover more than this share of the tracked tree.
const MAX_RULE_SHARE = 0.5;

// check-changed-scope.mjs runs git and pnpm at import, so the corpus records
// its broad escalation through the manifest helper that it calls.
assert.match(
  readFileSync(new URL("./check-changed-scope.mjs", import.meta.url), "utf8"),
  /^const broad = changes\.some\(isBroadChangeLine\);$/m,
  "check:changed must escalate through the manifest's broad rows",
);

// Change line sets the classifier test files used at the corpus base
// (release-policy, security-review, compute-deploy-targets, deployment-plan,
// admin-solid-retirement, content-release-isolation and check-changed-scope),
// beyond single M, A and D lines on tracked paths.
const FIXTURE_LINE_SETS = [
  ["docs/release.md"],
  ["M\tdocs/release.md"],
  ["M\tcontent/public/pages/home.md", "A\tcontent/publication.json"],
  ["M\tcontent/publication-other.json"],
  ["A\t.github/editorial-publisher.pem"],
  ["M\tdrizzle/seeds/public-content.json"],
  ["M\tdrizzle/seeds/unreviewed.json"],
  ["M\tapps/admin/src/pages/inbox.astro"],
  ["M\tapps/admin-solid/package.json"],
  ["A\tapps/admin/src/pages/new-route.astro"],
  ["M\tapps/admin/src/pages/auth/passkey.astro"],
  ["mystery/file.bin"],
  ["A\tdrizzle/migrations/0043_release_canary.sql"],
  ["A\tdrizzle/migrations/0046_release_canary_index.sql"],
  ["D\tdrizzle/migrations/0044_public_identity_systems.sql"],
  ["A\tknip.json"],
  ["A\tknip.jsonc.bak"],
  ["A\tconfig-knip.jsonc"],
  ["A\te2e.production.config.ts"],
  ["A\tconfig/astronomy/other.mjs"],
  ["A\tpatches/@astryxdesign__core@0.4.7.patch"],
  ["A\tpatches/other.patch"],
  ["A\t.gitignore-extra"],
  ["A\t.prettierignore/other"],
  ["M\t.codex/secrets.toml"],
  ["M\t.codex/unrecognized.toml"],
  ["R100\tscripts/ci/public-e2e-server.mjs\tscripts/ci/renamed-server.mjs"],
  [
    "R100\tscripts/ci/public-e2e-migrations.mjs\tscripts/ci/renamed-migrations.mjs",
  ],
  ["R100\tscripts/ci/renamed-server.mjs\tscripts/ci/public-e2e-server.mjs"],
  ["R100\te2e.www.config.ts\tdocs/old-config.md"],
  ["R075\tscripts/ci/public-e2e-server.mjs\tscripts/ci/renamed-server.mjs"],
  [
    "R075\tscripts/ci/public-e2e-migrations.mjs\tscripts/ci/renamed-migrations.mjs",
  ],
  ["R075\tscripts/ci/renamed-server.mjs\tscripts/ci/public-e2e-server.mjs"],
  ["R075\te2e.www.config.ts\tdocs/old-config.md"],
  ["C100\tscripts/ci/public-e2e-server.mjs\tscripts/ci/renamed-server.mjs"],
  [
    "C100\tscripts/ci/public-e2e-migrations.mjs\tscripts/ci/renamed-migrations.mjs",
  ],
  ["C100\tscripts/ci/renamed-server.mjs\tscripts/ci/public-e2e-server.mjs"],
  ["C100\te2e.www.config.ts\tdocs/old-config.md"],
  ["R100\tapps/www/src/pages/example.astro\tdocs/example.md"],
  [
    "R100\tdrizzle/migrations/0044_public_identity_systems.sql\tdocs/old-migration.sql",
  ],
  ["M\t.claude/credentials.json"],
  ["M\t.claude/settings.local.json"],
  ["M\t.worktreeinclude", "M\tdocs/local-development.md"],
  ["M\tapps/www/src/components/Footer.astro", "M\t.worktreeinclude"],
  ["R100\t.worktreeinclude\tdocs/worktreeinclude.md"],
  ["R100\tscripts/dev/worktree-files.txt\t.worktreeinclude"],
  ["M\t.worktreeinclude", "A\tnotes.txt"],
  ["M\tc1c4-probe-unclassified.txt"],
  ["A\tc1c4-probe-unclassified.txt"],
  ["D\tc1c4-probe-unclassified.txt"],
  ["M\tnotes.txt"],
  ["A\tnotes.txt"],
  ["D\tnotes.txt"],
  ["M\tscratch.mjs"],
  ["A\tscratch.mjs"],
  ["D\tscratch.mjs"],
  ["M\t.codex-workspaces/agent/"],
  ["A\t.codex-workspaces/agent/"],
  ["D\t.codex-workspaces/agent/"],
  ["M\t.local/admin-preview/log.txt"],
  ["A\t.local/admin-preview/log.txt"],
  ["D\t.local/admin-preview/log.txt"],
  ["M\t.env"],
  ["A\t.env"],
  ["D\t.env"],
  ["M\t.env.local"],
  ["A\t.env.local"],
  ["D\t.env.local"],
  ["M\t.env.production"],
  ["A\t.env.production"],
  ["D\t.env.production"],
  ["M\t.env.example.bak"],
  ["A\t.env.example.bak"],
  ["D\t.env.example.bak"],
  ["M\t.npmrc.bak"],
  ["A\t.npmrc.bak"],
  ["D\t.npmrc.bak"],
  ["M\t.prettierrc.json"],
  ["A\t.prettierrc.json"],
  ["D\t.prettierrc.json"],
  ["M\t.prettierrc.mjs"],
  ["A\t.prettierrc.mjs"],
  ["D\t.prettierrc.mjs"],
  ["M\t.editorconfig.local"],
  ["A\t.editorconfig.local"],
  ["D\t.editorconfig.local"],
  ["M\t.worktreeinclude.bak"],
  ["A\t.worktreeinclude.bak"],
  ["D\t.worktreeinclude.bak"],
  ["M\t.posthog-events.json.bak"],
  ["A\t.posthog-events.json.bak"],
  ["D\t.posthog-events.json.bak"],
  ["M\ttsconfig.base.json"],
  ["A\ttsconfig.base.json"],
  ["D\ttsconfig.base.json"],
  ["M\ttsconfig.json.bak"],
  ["A\ttsconfig.json.bak"],
  ["D\ttsconfig.json.bak"],
  ["M\tapps/tsconfig.json"],
  ["A\tapps/tsconfig.json"],
  ["D\tapps/tsconfig.json"],
  ["M\t.github/dependabot.yaml"],
  ["A\t.github/dependabot.yaml"],
  ["D\t.github/dependabot.yaml"],
  ["M\t.github/actions/guard/action.yml"],
  ["A\t.github/actions/guard/action.yml"],
  ["D\t.github/actions/guard/action.yml"],
  ["M\t.husky/pre-push"],
  ["A\t.husky/pre-push"],
  ["D\t.husky/pre-push"],
  ["M\t.vscode/launch.json"],
  ["A\t.vscode/launch.json"],
  ["D\t.vscode/launch.json"],
  ["M\t.vscode/settings.local.json"],
  ["A\t.vscode/settings.local.json"],
  ["D\t.vscode/settings.local.json"],
  ["M\tdrizzle.config.js"],
  ["A\tdrizzle.config.js"],
  ["D\tdrizzle.config.js"],
  ["M\tdrizzle.config.ts.bak"],
  ["A\tdrizzle.config.ts.bak"],
  ["D\tdrizzle.config.ts.bak"],
  ["M\tdrizzle/meta/0001_snapshot.json"],
  ["A\tdrizzle/meta/0001_snapshot.json"],
  ["D\tdrizzle/meta/0001_snapshot.json"],
  ["M\tdrizzle/meta/_journal.json.bak"],
  ["A\tdrizzle/meta/_journal.json.bak"],
  ["D\tdrizzle/meta/_journal.json.bak"],
  ["M\tsolo.yaml"],
  ["A\tsolo.yaml"],
  ["D\tsolo.yaml"],
  ["M\tsolo.yml.bak"],
  ["A\tsolo.yml.bak"],
  ["D\tsolo.yml.bak"],
  ["M\tmystery/file.bin"],
  ["A\tmystery/file.bin"],
  ["D\tmystery/file.bin"],
  [
    "M\t.github/workflows/ci.yml",
    "M\tscripts/ci/check-changed-scope.mjs",
    "M\tscripts/ci/check-changed-scope.test.mjs",
    "M\tscripts/ci/release-policy.mjs",
    "M\tscripts/ci/release-policy.test.mjs",
    "M\tscripts/ci/workflow-inventory.test.mjs",
  ],
  ["A\tc1c4-probe-unclassified.txt", "M\tscripts/ci/release-policy.mjs"],
  ["M\tscripts/ci/release-policy.mjs", "A\tc1c4-probe-unclassified.txt"],
  ["A\tnotes.txt", "M\tdocs/release.md"],
  ["M\tdocs/release.md", "A\tnotes.txt"],
  ["A\tnotes.txt", "M\tapps/admin/src/middleware.ts"],
  ["R100\tapps/www/src/pages/example.astro\tnotes.txt"],
  [
    "M\t.github/workflows/ci.yml",
    "A\tc1c4-probe-unclassified.txt",
    "M\tscripts/ci/check-changed-scope.mjs",
    "M\tscripts/ci/check-changed-scope.test.mjs",
    "M\tscripts/ci/release-policy.mjs",
    "M\tscripts/ci/release-policy.test.mjs",
    "M\tscripts/ci/workflow-inventory.test.mjs",
  ],
  [
    "A\tscripts/ci/content-release-isolation.mjs",
    "A\tscripts/ci/content-release-isolation.test.mjs",
    "M\tpackage.json",
  ],
  [],
  ["A\tapps/www/src/pages/new.astro"],
  ["A\tdocs/renamed.astro"],
  ["D\tapps/www/src/pages/index.astro", "A\tdocs/renamed.astro"],
  ["A\tscripts/local-helper.mjs"],
  ["M\tapps/www/src/pages/index.astro", "A\tscripts/local-helper.mjs"],
  ["M\tdocs/example.md"],
  ["A\tnotes.txt", "M\tapps/www/src/pages/index.astro"],
  ["M\tapps/www/src/pages/index.astro", "A\tnotes.txt"],
  // Coverage closure (a3): paths its rules are written for that are not
  // tracked yet, and siblings that must not inherit those rules.
  ...[
    "packages/runtime-contract/package.json",
    "packages/runtime-contract/src/index.ts",
    "packages/runtime-contract/README.md",
    "packages/runtime-contractx/a.ts",
    "packages/content/src/astro-adapter.ts",
    "packages/content/src/editorial/layout.ts",
    "packages/content/src/editorialx/a.ts",
    "packages/lib/src/db/new.ts",
    "packages/lib/src/dbx/a.ts",
    "packages/lib/src/db.ts",
    "scripts/content/new.mjs",
    "scripts/contentx/a.mjs",
    "scripts/admin/new.mjs",
    "scripts/adminx/a.mjs",
    "scripts/dev/review-state.mjs.bak",
    "docs/worker-inventory.md.bak",
    "docs/local-admin-preview-thread-prompt.md.bak",
  ].flatMap((path) => STATUSES.map((status) => [`${status}\t${path}`])),
  // The final db row decides only its own paths.
  ["M\tpackages/lib/src/db/schema.ts", "M\tpackages/lib/src/cms/index.ts"],
  ["R100\tpackages/lib/src/db/schema.ts\tpackages/lib/src/schema.ts"],
  ["R100\tpackages/lib/src/schema.ts\tpackages/lib/src/db/schema.ts"],
  // The b4 schema docs diff, and a b2a-shaped runtime contract diff.
  [
    "M\tdrizzle/README.md",
    "M\tpackage.json",
    "A\tscripts/ci/d1-schema-docs.test.mjs",
    "M\tpackages/lib/src/db/schema.ts",
  ],
  [
    "A\tpackages/runtime-contract/package.json",
    "A\tpackages/runtime-contract/src/index.ts",
    "M\tworkers/state/src/runtime-contract.ts",
  ],
  ["R100\tpackages/content/src/public/site.ts\tpackages/content/src/site.ts"],
];

// computeDeployTargets path arrays from the same test files.
const DEPLOY_TARGET_PATH_SETS = [
  [
    "docs/archive/personal-cloud-architecture-2026-05-13.md",
    "workers/state/README.md",
    "apps/admin/README.md",
    ".github/ISSUE_TEMPLATE/bug.md",
    "LICENSE",
  ],
  ["workers/state/README.md", ".github/workflows/deploy.yml"],
  ["apps/www/src/pages/index.astro"],
  [
    "apps/admin/src/pages/content/index.astro",
    "packages/content/src/admin/content.ts",
  ],
  ["packages/lib/src/admin-control/index.ts"],
  ["apps/admin/wrangler.toml"],
  ["apps/admin-solid/src/routes/index.tsx"],
  ["workers/state/src/index.ts"],
  ["workers/state/README.md", "workers/state/src/index.ts"],
  ["packages/brand/src/tokens.css"],
  ["packages/lib/src/cms/index.ts"],
  ["packages/types/src/cms.ts"],
  ["packages/content/src/public/defaults.ts"],
  ["package.json", "pnpm-lock.yaml"],
  ["apps/admin/src/pages/proof.astro", "workers/newsletter/src/index.ts"],
  ["patches/@astryxdesign__core@0.4.6.patch"],
  [".gitignore", ".prettierignore"],
  ["apps/www/src/components/shared.ts"],
  ["apps/www/src/layouts/shared.ts"],
  ["apps/www/src/styles/shared.ts"],
  ["apps/www/src/lib/shared.ts"],
  ["apps/www/src/scripts/shared.ts"],
  ["apps/admin-solid/package.json"],
];

// isSensitivePath inputs from the same test files.
const SENSITIVE_PATHS = [
  ".github/workflows/deploy.yml",
  ".github/workflows/review.yml",
  "apps/admin/README.md",
  "apps/admin/src/data/life-owner-reader.ts",
  "apps/admin/src/data/personal-context.ts",
  "apps/admin/src/editorial/draft-store.ts",
  "apps/admin/src/lib/access-identity.ts",
  "apps/admin/src/lib/draft-recovery.ts",
  "apps/admin/src/lib/editorial-handoff-client.ts",
  "apps/admin/src/lib/editorial-inventory-projection.test.ts",
  "apps/admin/src/lib/editorial-owner.ts",
  "apps/admin/src/lib/editorial-security.ts",
  "apps/admin/src/middleware.ts",
  "apps/admin/src/pages/api/admin/content/draft-operation.ts",
  "apps/admin/src/pages/api/admin/passkey/status.ts",
  "apps/admin/src/pages/auth/invite-safe.astro",
  "apps/admin/src/pages/auth/passkey.astro",
  "apps/admin/wrangler.toml",
  "apps/www/src/pages/index.astro",
  "apps/www/wrangler.toml",
  "docs/archive/old.md",
  "docs/platform-architecture.md",
  "drizzle/migrations/0016_seed_homepage_rich_summary.sql",
  "drizzle/migrations/0099_drop.sql",
  "drizzle/migrations/0100_public_metadata.sql",
  "package.json",
  "packages/content/src/admin/operations.ts",
  "packages/content/src/admin/runtime.ts",
  "packages/content/src/public/defaults.ts",
  "packages/lib/src/admin-control/dev-fixtures.ts",
  "packages/lib/src/admin-control/types.ts",
  "packages/lib/src/admin-control/unsafe.ts",
  "packages/lib/src/cms/homepage.ts",
  "patches/@astryxdesign__core@0.4.6.patch",
  "scripts/ci/security-review.mjs",
  "scripts/example.ts",
  "workers/state/src/control-plane-safe.ts",
  "workers/state/src/index.ts",
];

// Every ordered pair under R100 and C100 crosses a rule boundary: renames
// delete the old side and copies modify it, and broad escalation reads only
// the last field for root manifests.
const RENAME_PATHS = [
  "docs/worker-inventory.md",
  "CLAUDE.md",
  "content/public/pages/home.md",
  "apps/www/src/pages/index.astro",
  "apps/admin/src/lib/editorial-security.ts",
  "scripts/ci/release-policy.mjs",
  "package.json",
  "turbo.json",
  ".github/workflows/ci.yml",
  "drizzle/migrations/0001_service_registry.sql",
  "drizzle/migrations/0044_copy_agents_project_page_content.sql",
  "drizzle/meta/_journal.json",
  "workers/state/src/index.ts",
  ".env.example",
  "packages/types/src/cms.ts",
  "config/astro/advisory-guard.mjs",
  "notes.txt",
];

// Paths no rule was written for. None may ever release as none or automatic.
const NOVEL_PATHS = [
  "newroot.txt",
  ".github/actions/x/action.yml",
  ".env.something",
  "drizzle/migrations/0099_new_table.sql",
  "apps/newapp/src/index.ts",
  "workers/newworker/src/index.ts",
  "drizzle/meta/0002_snapshot.json",
];

// Entry keys join a line set with newlines; change lines never hold one.
const entryKey = (lines) => lines.join("\n");
const entryLines = (key) => key.split("\n").filter(Boolean);
const trackedKey = (status, path) => entryKey([`${status}\t${path}`]);

function lineSetKeys(tracked) {
  const renames = ["R100", "C100"].flatMap((status) =>
    RENAME_PATHS.flatMap((from) =>
      RENAME_PATHS.filter((to) => to !== from).map((to) => [
        `${status}\t${from}\t${to}`,
      ]),
    ),
  );
  const novel = NOVEL_PATHS.flatMap((path) =>
    STATUSES.map((status) => [`${status}\t${path}`]),
  );
  const covered = new Set(
    STATUSES.flatMap((status) =>
      tracked.map((path) => trackedKey(status, path)),
    ),
  );
  return [
    ...new Set(
      [...FIXTURE_LINE_SETS, ...renames, ...novel]
        .map(entryKey)
        .filter((key) => !covered.has(key)),
    ),
  ];
}

function changePaths(line) {
  const parts = line.split("\t");
  if (parts.length === 1) return [parts[0]];
  if (/^[RC]\d*$/.test(parts[0]) && parts.length === 3)
    return [parts[1], parts[2]];
  return [parts.at(-1)];
}

// Migration reads resolve from the repository root and are cached. The
// manifest and file list come from the corpus, so a later migration never
// changes a recorded release.
const fileCache = new Map();
function readRepoFile(path, encoding) {
  const key = `${encoding ?? "buffer"}\0${path}`;
  if (!fileCache.has(key))
    fileCache.set(key, readFileSync(join(ROOT, path), encoding));
  return fileCache.get(key);
}

function classifierOptions(corpus) {
  return {
    ...corpus.options,
    ...corpus.migrationContext,
    readFile: readRepoFile,
  };
}

// The full record of one line set. Reasons and unclassified paths name the
// set's own paths as {index}, so line sets that classify alike share a class.
function record(lines, options) {
  const live = lines.filter(Boolean);
  const paths = live.flatMap(changePaths);
  const unique = [...new Set(paths)];
  const mark = (text) => {
    const at = text.indexOf(": ");
    const index = at < 0 ? -1 : unique.indexOf(text.slice(at + 2));
    return index < 0 ? text : `${text.slice(0, at + 2)}{${index}}`;
  };
  const result = {};
  try {
    const release = classifyRelease(live, options);
    result.release = { ...release, reasons: release.reasons.map(mark) };
    result.outputs = githubOutputs(release);
  } catch (error) {
    result.error = error.code ?? error.message;
  }
  result.unclassified = unclassifiedPaths(live).map(
    (path) => `{${unique.indexOf(path)}}`,
  );
  result.ignored = paths.map(isReleaseIgnored);
  result.sensitive = paths.map(isSensitivePath);
  result.deployTargets = computeDeployTargets(paths);
  result.broad = live.some(isBroadChangeLine);
  return result;
}

// A class stores only what differs from the baseline record (the empty
// change list): changed release fields, changed GITHUB_OUTPUT lines and
// selected deploy targets. expand() rebuilds the full record in the
// baseline's key order, so key order and output shape are compared too.
const outputEntries = (text) =>
  text.split("\n").map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)];
  });

function changedFields(full, baseline) {
  return Object.fromEntries(
    Object.entries(full).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline[key]),
    ),
  );
}

function expand(stored, baseline) {
  const full = {};
  if (stored.error === undefined) {
    full.release = { ...baseline.release, ...stored.release };
    full.outputs = outputEntries(baseline.outputs)
      .map(([key, value]) => `${key}=${stored.outputs[key] ?? value}`)
      .join("\n");
  } else {
    full.error = stored.error;
  }
  full.unclassified = stored.unclassified;
  full.ignored = stored.ignored;
  full.sensitive = stored.sensitive;
  full.deployTargets = { ...baseline.deployTargets, ...stored.deployTargets };
  full.broad = stored.broad;
  return full;
}

function compress(full, baseline, id) {
  const stored = { id };
  if (full.release) {
    stored.release = changedFields(full.release, baseline.release);
    stored.outputs = changedFields(
      Object.fromEntries(outputEntries(full.outputs)),
      Object.fromEntries(outputEntries(baseline.outputs)),
    );
  } else {
    stored.error = full.error;
  }
  stored.unclassified = full.unclassified;
  stored.ignored = full.ignored;
  stored.sensitive = full.sensitive;
  stored.deployTargets = changedFields(
    full.deployTargets,
    baseline.deployTargets,
  );
  stored.broad = full.broad;
  assert.equal(
    JSON.stringify(expand(stored, baseline)),
    JSON.stringify(full),
    `class ${id} must expand back to its record`,
  );
  return stored;
}

async function writeCorpus() {
  const git = (...args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const tracked = git("ls-files", "-z").split("\0").filter(Boolean).sort();
  const corpus = {
    schema: 1,
    source: git("rev-parse", "HEAD").trim(),
    options: { sourceSha: "a".repeat(40), eventName: "pull_request" },
    migrationContext: {
      manifest: JSON.parse(
        readFileSync(join(ROOT, "drizzle/migrations/manifest.json"), "utf8"),
      ),
      files: readdirSync(join(ROOT, "drizzle/migrations"))
        .filter((file) => /^\d{4}_.+\.sql$/.test(file))
        .sort(),
    },
  };
  const options = classifierOptions(corpus);
  const baseline = record([], options);
  const classes = new Map();
  const classOf = (key) => {
    const value = JSON.stringify(record(entryLines(key), options));
    if (!classes.has(value)) classes.set(value, classes.size);
    return classes.get(value);
  };
  const trackedClasses = Object.fromEntries(
    tracked.map((path) => [
      path,
      STATUSES.map((status) => classOf(trackedKey(status, path))),
    ]),
  );
  const lineSetClasses = Object.fromEntries(
    lineSetKeys(tracked).map((key) => [key, classOf(key)]),
  );
  Object.assign(corpus, {
    baseline,
    classes: [...classes.keys()].map((value, id) =>
      compress(JSON.parse(value), baseline, id),
    ),
    tracked: trackedClasses,
    lineSets: lineSetClasses,
    deployTargetCases: DEPLOY_TARGET_PATH_SETS.map((paths) => ({
      paths,
      targets: computeDeployTargets(paths),
    })),
    sensitiveCases: SENSITIVE_PATHS.map((path) => [
      path,
      isSensitivePath(path),
    ]),
  });
  const prettier = await import("prettier");
  const filepath = fileURLToPath(CORPUS);
  const text = await prettier.format(JSON.stringify(corpus), {
    ...(await prettier.resolveConfig(filepath)),
    filepath,
  });
  writeFileSync(CORPUS, text);
  console.log(
    `release corpus written: ${classes.size} classes, ${tracked.length} tracked paths, ${Object.keys(lineSetClasses).length} line sets`,
  );
}

function replayCorpus() {
  const corpus = JSON.parse(readFileSync(CORPUS, "utf8"));
  assert.equal(corpus.schema, 1);
  const options = classifierOptions(corpus);
  const tracked = Object.keys(corpus.tracked);
  assert.deepEqual(
    Object.keys(corpus.lineSets),
    lineSetKeys(tracked),
    "corpus line sets must match the lists above; run --write",
  );
  corpus.classes.forEach((stored, id) => assert.equal(stored.id, id));

  const entries = [
    ...tracked.flatMap((path) =>
      STATUSES.map((status, index) => [
        trackedKey(status, path),
        corpus.tracked[path][index],
      ]),
    ),
    ...Object.entries(corpus.lineSets),
  ];
  const used = new Set(entries.map(([, id]) => id));
  assert.equal(used.size, corpus.classes.length, "every class is used");

  const diffs = [];
  const baselineActual = record([], options);
  if (JSON.stringify(baselineActual) !== JSON.stringify(corpus.baseline))
    diffs.push({
      lines: [],
      expected: corpus.baseline,
      actual: baselineActual,
    });
  const expected = corpus.classes.map((stored) =>
    JSON.stringify(expand(stored, corpus.baseline)),
  );
  for (const [key, id] of entries) {
    const actual = JSON.stringify(record(entryLines(key), options));
    if (actual !== expected[id])
      diffs.push({
        lines: entryLines(key),
        class: id,
        expected: JSON.parse(expected[id]),
        actual: JSON.parse(actual),
      });
  }
  assert.deepEqual(
    corpus.deployTargetCases.map(({ paths }) => paths),
    DEPLOY_TARGET_PATH_SETS,
  );
  for (const { paths, targets } of corpus.deployTargetCases) {
    const actual = computeDeployTargets(paths);
    if (JSON.stringify(actual) !== JSON.stringify(targets))
      diffs.push({ paths, expected: targets, actual });
  }
  assert.deepEqual(
    corpus.sensitiveCases.map(([path]) => path),
    SENSITIVE_PATHS,
  );
  for (const [path, sensitive] of corpus.sensitiveCases) {
    if (isSensitivePath(path) !== sensitive)
      diffs.push({ path, expected: sensitive, actual: !sensitive });
  }
  assert.equal(
    diffs.length,
    0,
    `${diffs.length} corpus entries changed; first ${Math.min(diffs.length, 5)}:\n${diffs
      .slice(0, 5)
      .map((diff) => JSON.stringify(diff, null, 2))
      .join("\n")}`,
  );
  return { corpus, options, entries: entries.length };
}

// Novel paths stay unknown. A new migration file throws until the manifest
// records it, and deleting one needs approval.
function assertNovelPathsFailClosed(options) {
  for (const path of NOVEL_PATHS) {
    const migration = /^drizzle\/migrations\/\d{4}_.+\.sql$/.test(path);
    for (const status of STATUSES) {
      const label = `${status} ${path}`;
      let release;
      try {
        release = classifyRelease([`${status}\t${path}`], options);
      } catch (error) {
        assert.ok(migration && status !== "D", `${label}: ${error.message}`);
        continue;
      }
      assert.ok(
        release.risk === "unknown" || release.risk === "approval",
        `${label} must not release as ${release.risk}`,
      );
      if (release.risk === "approval") {
        assert.ok(migration && status === "D", label);
        assert.ok(
          release.reasons.includes(
            `${path.split("/").at(-1)}: removed migration`,
          ),
          label,
        );
      }
    }
  }
}

function globToRegExp(glob) {
  let source = "";
  let depth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "{") {
      source += "(?:";
      depth += 1;
    } else if (char === "}") {
      source += ")";
      depth -= 1;
    } else if (char === "," && depth > 0) source += "|";
    else source += char.replace(/[.+?^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

const isProtectedSurface = (path) =>
  rulesOfKind("risk").some(
    (rule) =>
      rule.risk === "approval" &&
      rule.status === undefined &&
      matchesPath(rule, path),
  );

function assertRuleTable() {
  assert.ok(Object.isFrozen(PATH_RULES), "the rule table is frozen");
  const ids = PATH_RULES.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length, "rule ids are unique");
  const flags = [
    "migration_preflight_required",
    "ci_policy_changed",
    "public_browser_changed",
    "local_dev_changed",
  ];
  for (const rule of PATH_RULES) {
    const matchers = ["prefix", "exact", "suffix", "pattern"].filter(
      (key) => rule[key] !== undefined,
    );
    assert.equal(matchers.length, 1, `${rule.id} has one path matcher`);
    if (rule.pattern)
      assert.ok(
        !rule.pattern.global && !rule.pattern.sticky,
        `${rule.id} pattern keeps no state between tests`,
      );
    if (rule.exact)
      assert.ok(rule.exact.length > 0, `${rule.id} lists exact paths`);
    if (rule.status)
      assert.ok(
        ["risk", "removed-migration"].includes(rule.kind),
        `${rule.id}: only change-level kinds read the git status`,
      );
    if (rule.final !== undefined)
      assert.ok(
        rule.kind === "target" && rule.final === true,
        `${rule.id}: only target rows can decide alone`,
      );
    if (rule.kind === "ignored")
      assert.equal(typeof rule.ignored, "boolean", rule.id);
    else if (rule.kind === "risk") {
      assert.ok(["approval", "safe"].includes(rule.risk), rule.id);
      if (rule.risk === "approval") assert.ok(rule.reason, rule.id);
    } else if (rule.kind === "removed-migration") assert.ok(rule.status);
    else if (rule.kind === "flag")
      assert.ok(flags.includes(rule.flag), rule.id);
    else if (rule.kind === "target")
      assert.ok(
        (rule.final || rule.targets.length > 0) &&
          rule.targets.every((name) => DEPLOY_TARGETS.includes(name)),
        `${rule.id} selects known deploy targets`,
      );
    else if (rule.kind === "sensitive")
      assert.equal(typeof rule.sensitive, "boolean", rule.id);
    else if (rule.kind === "broad")
      assert.ok(
        rule.prefix !== undefined || rule.exact !== undefined,
        `${rule.id} matches by prefix or exact path`,
      );
    else assert.fail(`${rule.id} has unknown kind ${rule.kind}`);
  }

  // First-match kinds keep the precedence the consumers rely on.
  const riskOrder = rulesOfKind("risk").map((rule) =>
    rule.risk === "safe" ? 2 : rule.status ? 1 : 0,
  );
  assert.deepEqual(
    riskOrder,
    [...riskOrder].sort((a, b) => a - b),
    "approval rows, then the route contract row, then known-safe rows",
  );
  const [carveOut, ...docs] = rulesOfKind("ignored");
  assert.equal(carveOut.ignored, false, "public content is never ignored");
  assert.ok(
    docs.every((rule) => rule.ignored),
    "docs rows follow it",
  );
  const [markdown, ...scanned] = rulesOfKind("sensitive");
  assert.equal(markdown.suffix, ".md");
  assert.equal(markdown.sensitive, false, "markdown is never scanned");
  assert.ok(
    scanned.every((rule) => rule.sensitive),
    "scanned rows follow",
  );
}

function assertManifest(options) {
  assertRuleTable();
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  assert.ok(tracked.length > 1000, "git ls-files must list the repository");

  // A rule that covers most of the tree hides the paths it was not written
  // for; split it instead.
  for (const rule of PATH_RULES) {
    const share =
      tracked.filter((path) => matchesPath(rule, path)).length / tracked.length;
    assert.ok(
      share <= MAX_RULE_SHARE,
      `${rule.id} matches ${(share * 100).toFixed(1)}% of tracked paths`,
    );
  }

  // The manifest guards its own rules.
  for (const status of STATUSES) {
    const release = classifyRelease(
      [`${status}\tscripts/ci/path-manifest.mjs`],
      options,
    );
    assert.equal(release.risk, "approval", status);
    assert.ok(
      release.reasons.includes(
        "protected surface: scripts/ci/path-manifest.mjs",
      ),
      status,
    );
    assert.equal(release.ci_policy_changed, true, status);
  }
  assert.equal(isSensitivePath("scripts/ci/path-manifest.mjs"), true);

  // Root manifests escalate only as the last field of a change line.
  for (const [line, broad] of [
    ["M\tpackage.json", true],
    ["package.json", false],
    ["R100\tpackage.json\tfoo.json", false],
    ["R100\tfoo.json\tpackage.json", true],
    ["C100\tturbo.json\tturbo.bak", false],
    ["R100\tscripts/a.mjs\tdocs/a.md", true],
    ["M\t.github/actions/x/action.yml", true],
    ["M\tpackages/lib/src/index.ts", true],
    ["M\tpackages/content/src/index.ts", false],
  ])
    assert.equal(isBroadChangeLine(line), broad, JSON.stringify(line));

  // Every deploy.yml paths-ignore entry is a release-ignored rule, so the push
  // workflow never skips a path the classifier would deploy.
  const deploy = parse(
    readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8"),
  );
  const ignoredRows = rulesOfKind("ignored");
  const carveOuts = ignoredRows.filter((rule) => !rule.ignored);
  for (const glob of deploy.on.push["paths-ignore"]) {
    const prefix = /^[^*?[\]{}!]+\/\*\*$/.test(glob)
      ? glob.slice(0, -2)
      : undefined;
    const exact = /^[^*?[\]{}!]+$/.test(glob) ? glob : undefined;
    assert.ok(prefix || exact, `paths-ignore ${glob}: use dir/** or a path`);
    assert.ok(
      ignoredRows.some(
        (rule) =>
          rule.ignored &&
          (prefix ? rule.prefix === prefix : rule.exact?.includes(exact)),
      ),
      `paths-ignore ${glob} must be a release-ignored rule`,
    );
    assert.equal(isReleaseIgnored(prefix ? `${prefix}a/b.txt` : exact), true);
    for (const rule of carveOuts) {
      const skipped = prefix ?? exact;
      assert.ok(
        !skipped.startsWith(rule.prefix) && !rule.prefix.startsWith(skipped),
        `paths-ignore ${glob} must not skip ${rule.prefix}`,
      );
    }
  }

  // The CodeRabbit review paths sit on approval rules. Markdown under them is
  // release-ignored docs, a new worker stays unknown until it gets a rule,
  // and migration files are governed by migration policy and preflight.
  const coderabbit = parse(
    readFileSync(join(ROOT, ".coderabbit.yaml"), "utf8"),
  );
  const reviewGlobs = coderabbit.reviews.path_instructions.map(
    ({ path }) => path,
  );
  assert.deepEqual(
    reviewGlobs,
    [
      "apps/admin/src/{middleware.ts,lib/access-identity.ts,pages/auth/**}",
      "drizzle/{migrations/**,meta/**}",
      ".github/workflows/**",
      "workers/**",
    ],
    "update these review-path checks with .coderabbit.yaml",
  );
  const under = (glob) => {
    const pattern = globToRegExp(glob);
    const paths = tracked.filter((path) => pattern.test(path));
    assert.ok(paths.length > 0, `${glob} matches tracked paths`);
    return paths;
  };
  for (const glob of [reviewGlobs[0], reviewGlobs[2], reviewGlobs[3]]) {
    for (const path of under(glob)) {
      assert.ok(
        isProtectedSurface(path),
        `${path} must match an approval rule`,
      );
      const release = classifyRelease([`M\t${path}`], options);
      assert.equal(
        release.risk,
        isReleaseIgnored(path) ? "none" : "approval",
        path,
      );
    }
  }
  assert.equal(
    classifyRelease(["A\tworkers/newworker/src/index.ts"], options).risk,
    "unknown",
  );
  for (const path of under(reviewGlobs[1])) {
    assert.ok(
      matchingRules("flag", path).some(
        (rule) => rule.flag === "migration_preflight_required",
      ),
      `${path} requires migration preflight`,
    );
  }
  assert.ok(isProtectedSurface("drizzle/migrations/manifest.json"));
  assertCoverage(tracked);
}

// Coverage closure: a deploy target follows every file that reaches it.
const DEPENDENCY_KEYS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const WORKSPACE_TARGETS = {
  "apps/www": "www",
  "apps/admin": "admin",
  "workers/ingest": "ingest",
  "workers/newsletter": "newsletter",
  "workers/state": "state",
  "workers/weekly-email": "weekly_email",
};
const CODE_FILE = /\.(?:astro|[cm]?[jt]sx?)$/;
const TEST_FILE = /(?:^|\/)(?:test|e2e)\/|\.test\.[cm]?[jt]sx?$/;
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g;
const BUILD_SCRIPT_NODE_FILE = /\bnode\s+([^\s&|;"'-][^\s&|;"']*\.m?js)\b/g;

const readRoot = (path) => readFileSync(join(ROOT, path), "utf8");

function workspaceManifests(tracked) {
  return tracked
    .filter((path) =>
      /^(?:apps|packages|workers)\/[^/]+\/package\.json$/.test(path),
    )
    .map((path) => ({
      dir: posix.dirname(path),
      manifest: JSON.parse(readRoot(path)),
    }));
}

function dependentsOf(name, workspaces) {
  return workspaces
    .filter(({ manifest }) =>
      DEPENDENCY_KEYS.some((key) => manifest[key]?.[name] !== undefined),
    )
    .map(({ dir }) => dir);
}

/** The tracked file one import specifier names, if it is in this repository. */
function resolveImport(from, specifier, trackedSet, workspaces) {
  let base;
  const workspace = workspaces.find(
    ({ manifest }) =>
      specifier === manifest.name || specifier.startsWith(`${manifest.name}/`),
  );
  if (workspace) {
    const key = `.${specifier.slice(workspace.manifest.name.length)}`;
    let entry = workspace.manifest.exports?.[key];
    if (entry && typeof entry === "object")
      entry = entry.import ?? entry.default;
    if (typeof entry !== "string") return undefined;
    // dist output is built from the matching source file.
    base = posix.join(
      workspace.dir,
      entry.replace(/^\.\/dist\/(.+)\.js$/, "./src/$1.ts"),
    );
  } else if (specifier.startsWith(".")) {
    base = posix.join(posix.dirname(from), specifier);
  } else return undefined;
  return [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.mjs`,
    `${base}/index.ts`,
  ].find((candidate) => trackedSet.has(candidate));
}

/** Files outside an app that its build or runtime imports: the app's own
 * non-test source, the node scripts its build and its workspace
 * dependencies' builds run, and every packages/content or scripts file
 * those import in turn. */
function appBuildInputs(app, trackedSet, workspaces) {
  const byName = new Map(workspaces.map((ws) => [ws.manifest.name, ws]));
  const builders = [];
  const visit = (ws) => {
    if (!ws || builders.includes(ws)) return;
    builders.push(ws);
    for (const key of DEPENDENCY_KEYS)
      for (const [name, version] of Object.entries(ws.manifest[key] ?? {}))
        if (String(version).startsWith("workspace:")) visit(byName.get(name));
  };
  visit(workspaces.find(({ dir }) => dir === app));
  const queue = [...trackedSet].filter(
    (path) =>
      path.startsWith(`${app}/`) &&
      CODE_FILE.test(path) &&
      !TEST_FILE.test(path.slice(app.length + 1)),
  );
  for (const { dir, manifest } of builders)
    for (const script of ["prebuild", "build"])
      for (const [, file] of (manifest.scripts?.[script] ?? "").matchAll(
        BUILD_SCRIPT_NODE_FILE,
      ))
        queue.push(posix.join(dir, file));
  const reached = new Set();
  for (const file of queue) {
    if (!trackedSet.has(file) || !CODE_FILE.test(file)) continue;
    for (const [, , specifier] of readRoot(file).matchAll(IMPORT_SPECIFIER)) {
      const resolved = resolveImport(file, specifier, trackedSet, workspaces);
      if (
        resolved &&
        !reached.has(resolved) &&
        /^(?:packages\/content|scripts)\//.test(resolved)
      ) {
        reached.add(resolved);
        queue.push(resolved);
      }
    }
    if (!file.startsWith(`${app}/`)) reached.add(file);
  }
  return reached;
}

function assertCoverage(tracked) {
  const trackedSet = new Set(tracked);
  const workspaces = workspaceManifests(tracked);
  const targetRule = (id) => PATH_RULES.find((rule) => rule.id === id);

  // The runtime contract deploys exactly the workspaces that depend on it,
  // so a package-only change cannot ship to fewer of them.
  const contractUsers = dependentsOf("@anipotts/runtime-contract", workspaces);
  assert.deepEqual(
    contractUsers.filter((dir) => !WORKSPACE_TARGETS[dir]),
    [],
    "a package that depends on @anipotts/runtime-contract needs a deploy mapping",
  );
  if (trackedSet.has("packages/runtime-contract/package.json"))
    assert.deepEqual(
      contractUsers.map((dir) => WORKSPACE_TARGETS[dir]).sort(),
      [...targetRule("target.runtime-contract").targets].sort(),
      "target.runtime-contract must list every workspace that depends on @anipotts/runtime-contract",
    );
  else assert.deepEqual(contractUsers, []);

  // packages/lib/src/db/ selects no deploy target only while no deployed
  // code depends on the package or imports the drizzle model.
  assert.equal(targetRule("target.lib-db").final, true);
  assert.deepEqual(targetRule("target.lib-db").targets, []);
  assert.deepEqual(
    dependentsOf("@anipotts/lib", workspaces),
    [],
    "target.lib-db assumes no workspace depends on @anipotts/lib",
  );
  const modelImporters = tracked.filter(
    (path) =>
      /^(?:apps|packages|workers)\//.test(path) &&
      !path.startsWith("packages/lib/") &&
      CODE_FILE.test(path) &&
      [...readRoot(path).matchAll(IMPORT_SPECIFIER)].some(
        ([, , specifier]) =>
          specifier.startsWith("@anipotts/lib") ||
          resolveImport(path, specifier, trackedSet, workspaces)?.startsWith(
            "packages/lib/",
          ),
      ),
  );
  assert.deepEqual(
    modelImporters,
    [],
    "target.lib-db assumes no deployed code imports packages/lib",
  );

  // Every packages/content or scripts file an app's build or runtime
  // imports selects that app.
  const expectedInputs = {
    "apps/www": [
      "packages/content/src/editorial/direct-publication.ts",
      "packages/content/src/editorial/source.ts",
      "packages/content/src/public/defaults.ts",
      "scripts/ci/public-built-output.test.mjs",
      "scripts/content/content-d1-seed.mjs",
      "scripts/content/generate-public-content.mjs",
      "scripts/dev/admin-preview-identity.mjs",
      "scripts/dev/review-state.mjs",
    ],
    "apps/admin": [
      "scripts/ci/admin-route-inventory.mjs",
      "scripts/content/generate-public-content.mjs",
      "scripts/dev/admin-local-owner-host.mjs",
      "scripts/dev/admin-preview-identity.mjs",
      "scripts/dev/editorial-public-assets.mjs",
      "scripts/dev/editorial-updates.mjs",
      "scripts/dev/public-content-hot-reload.mjs",
      "scripts/dev/review-state.mjs",
    ],
  };
  for (const [app, expected] of Object.entries(expectedInputs)) {
    const target = WORKSPACE_TARGETS[app];
    const inputs = [...appBuildInputs(app, trackedSet, workspaces)].sort();
    for (const path of expected)
      assert.ok(inputs.includes(path), `${app} build inputs include ${path}`);
    const missed = inputs.filter(
      (path) => !computeDeployTargets([path])[target],
    );
    assert.deepEqual(missed, [], `${app} build inputs must select ${target}`);
  }
}

const directRun = process.argv[1] === fileURLToPath(import.meta.url);
if (directRun && process.argv.includes("--write")) {
  writeCorpus().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const { corpus, options, entries } = replayCorpus();
  assertNovelPathsFailClosed(options);
  assertManifest(options);
  console.log(
    `release corpus replayed: ${entries} entries in ${corpus.classes.length} classes, 0 differences; path manifest checks passed`,
  );
}
