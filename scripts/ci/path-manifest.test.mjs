#!/usr/bin/env node

// Golden release corpus. Every recorded change line is replayed through the
// release classifier, the deploy-target selector, Security Review's path
// filter and check:changed's broad escalation, and any difference fails. A
// refactor of the path rules must replay with 0 differences. An intended rule
// change regenerates the corpus with
// `node scripts/ci/path-manifest.test.mjs --write`, and its json diff is the
// review record of every classification that moved.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
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

// check-changed-scope.mjs runs git and pnpm at import, so the corpus records
// its broad escalation with this copy, which must match the source verbatim.
const BROAD_CHANGE_LINE =
  /\t(?:\.github\/|config\/|scripts\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|turbo\.json$|packages\/(?:lib|types)\/)/u;
const isBroadChangeLine = (line) => BROAD_CHANGE_LINE.test(line);
assert.ok(
  readFileSync(
    new URL("./check-changed-scope.mjs", import.meta.url),
    "utf8",
  ).includes(`/${BROAD_CHANGE_LINE.source}/${BROAD_CHANGE_LINE.flags}`),
  "check-changed-scope.mjs must use the broad regex the corpus recorded",
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

// Novel paths stay unknown, throw, or (a deleted migration) need approval.
function assertNovelPathsFailClosed(options) {
  for (const path of NOVEL_PATHS) {
    for (const status of STATUSES) {
      let release;
      try {
        release = classifyRelease([`${status}\t${path}`], options);
      } catch {
        continue;
      }
      assert.ok(
        release.risk === "unknown" || release.risk === "approval",
        `${status} ${path} must not release as ${release.risk}`,
      );
    }
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
  console.log(
    `release corpus replayed: ${entries} entries in ${corpus.classes.length} classes, 0 differences`,
  );
}
