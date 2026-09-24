#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const WORKFLOW_DIR = ".github/workflows";
const ALLOWED_WORKFLOWS = [
  "ci.yml",
  "deploy.yml",
  "security-review.yml",
  "smoke.yml",
];

const BANNED_PATTERNS = [
  /ANTHROPIC_API_KEY/i,
  /CLAUDE_API_KEY/i,
  /anthropic-ai\/claude/i,
  /claude-code-action/i,
  /api\.anthropic\.com/i,
];

const workflowFiles = readdirSync(WORKFLOW_DIR)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .sort();

const deployWorkflow = readFileSync(join(WORKFLOW_DIR, "deploy.yml"), "utf8");
const ciWorkflow = readFileSync(join(WORKFLOW_DIR, "ci.yml"), "utf8");
const securityWorkflow = readFileSync(
  join(WORKFLOW_DIR, "security-review.yml"),
  "utf8",
);
const smokeWorkflow = readFileSync(join(WORKFLOW_DIR, "smoke.yml"), "utf8");
const codeRabbit = readFileSync(".coderabbit.yaml", "utf8");
assert.match(ciWorkflow, /types:.*ready_for_review/);
assert.match(
  securityWorkflow,
  /ref: \$\{\{ github.event.pull_request.head.sha \}\}/,
  "security review must inspect the same immutable PR head as build validation",
);
assert.ok(
  ciWorkflow.indexOf("node scripts/ci/check-build-drift.mjs") >
    ciWorkflow.indexOf("pnpm test:site-migrations"),
  "tracked-source drift must be checked after builds and migration validation",
);
assert.match(
  ciWorkflow,
  /name: Setup Node\n\s+if: github.event.pull_request.draft == false/,
);
assert.match(
  ciWorkflow,
  /name: Setup pnpm\n\s+if: github.event.pull_request.draft == false/,
);
assert.match(ciWorkflow, /name: Draft diff validation/);
assert.match(
  ciWorkflow,
  /name: Full validation requires ready for review[\s\S]*?exit 1/,
);

assert.deepEqual(
  workflowFiles,
  ALLOWED_WORKFLOWS,
  "workflow inventory drifted from the approved CI/CD set",
);
assert.ok(
  codeRabbit.includes("profile: chill") &&
    codeRabbit.includes("request_changes_workflow: false"),
  "CodeRabbit must stay advisory for low-risk solo-repository changes",
);
for (const protectedPath of [
  "apps/admin/src/{middleware.ts,lib/access-identity.ts,pages/auth/**}",
  "drizzle/{migrations/**,meta/**}",
  ".github/workflows/**",
  "workers/**",
]) {
  assert.ok(
    codeRabbit.includes(protectedPath),
    `CodeRabbit must retain focused review for ${protectedPath}`,
  );
}

assert.ok(
  deployWorkflow.includes("push:\n    branches: [main]"),
  "deploy workflow must promote path-filtered changes from merged main",
);
assert.equal(
  deployWorkflow.includes('- "**.md"'),
  false,
  "deploy workflow must not suppress canonical public Markdown",
);
for (const checkName of ["Build, lint, typecheck, test"]) {
  assert.ok(
    ciWorkflow.includes(`name: ${checkName}`),
    `ci.yml must report required check ${checkName}`,
  );
}
assert.equal(
  ciWorkflow.includes("name: Migration Preflight"),
  false,
  "migration preflight must be a fast path inside the stable CI summary",
);
assert.ok(
  ciWorkflow.includes(
    "needs.classify.outputs.migration_preflight_required == 'true'",
  ),
  "migration replay must run only for migration-owned paths",
);
for (const command of [
  "pnpm turbo build --affected",
  "pnpm turbo lint --affected",
  "pnpm turbo typecheck --affected",
  "pnpm turbo test --affected",
]) {
  assert.equal(
    ciWorkflow.split(command).length - 1,
    1,
    `${command} must run once`,
  );
}
assert.ok(
  ciWorkflow.includes("uses: oven-sh/setup-bun@v2") &&
    ciWorkflow.includes('bun-version: "1.3.4"'),
  "pull request validation must install the pinned Bun runtime when needed",
);
assert.equal(
  deployWorkflow.includes("uses: oven-sh/setup-bun@v2"),
  false,
  "deployment must not reinstall Bun after required PR validation",
);
assert.ok(
  deployWorkflow.includes("pnpm turbo typecheck --filter=@anipotts/state"),
  "state deployment must build workspace dependencies before typechecking",
);
assert.ok(
  securityWorkflow.includes("name: Security Review"),
  "security-review.yml must report the required security check",
);
assert.equal(
  /pull_request:\n\s+paths:/.test(securityWorkflow),
  false,
  "required security review must run for every pull request",
);
for (const forbiddenCeremony of [
  "/approve-release",
  "release-approved",
  "issue_comment:",
  "pull_request_review:",
  "Promotion Policy",
]) {
  assert.equal(
    ciWorkflow.includes(forbiddenCeremony),
    false,
    `workflow approval ceremony must not include ${forbiddenCeremony}`,
  );
}
assert.ok(
  deployWorkflow.includes("group: production-release"),
  "production releases must share one serialized concurrency group",
);
assert.ok(
  deployWorkflow.includes("cancel-in-progress: false"),
  "a newer release must not cancel an in-flight release",
);
assert.ok(
  deployWorkflow.includes("node scripts/ci/deployment-plan.mjs"),
  "deployment must compare live target state through the shared release classifier",
);
assert.equal(
  deployWorkflow.includes("pnpm validate"),
  false,
  "deployment must not rerun the full workspace after required PR validation",
);
assert.ok(
  deployWorkflow.includes(
    'admin_enabled=${policy.authenticated_admin_smoke === "enabled" || policy.editorial_admin_release === "enabled"}',
  ) && deployWorkflow.includes("needs.release.outputs.admin_enabled == 'true'"),
  "Admin deployment must retain its independently approved identity or editorial boundary gate",
);
assert.ok(
  deployWorkflow.includes(
    'automatic_migrations_enabled=${policy.automatic_migrations === "enabled_safe_additive"}',
  ) &&
    deployWorkflow.includes(
      "steps.gates.outputs.automatic_migrations_enabled != 'true'",
    ),
  "automatic D1 promotion must honor the release-train emergency hold",
);
for (const manualGuard of [
  'test "${{ github.ref }}" = "refs/heads/main"',
  'test "${{ github.actor }}" = "anipotts"',
  'test "${{ inputs.source_sha }}" = "${{ github.sha }}"',
]) {
  assert.ok(
    deployWorkflow.includes(manualGuard),
    `manual deployment is missing exact authority guard ${manualGuard}`,
  );
}
assert.ok(
  deployWorkflow.includes("d1 time-travel info"),
  "migration releases must capture a Time Travel bookmark",
);
assert.equal(
  /d1\s+time-travel\s+restore/.test(deployWorkflow),
  false,
  "migration failures must never restore D1 automatically",
);
assert.ok(
  deployWorkflow.includes("needs.release.outputs.d1_changed != 'true'"),
  "automatic Worker rollback must be limited to app-only releases",
);
for (const workflow of [deployWorkflow, smokeWorkflow]) {
  assert.ok(
    workflow.includes("scripts/ci/release-smoke.mjs"),
    "deploy and manual smoke must share one smoke implementation",
  );
}

// A-33: every health smoke that names a release also names the schema
// version that release must report, and a forward deploy smoke takes it from
// the release job, never a literal.
for (const [file, workflow] of [
  ["deploy.yml", deployWorkflow],
  ["smoke.yml", smokeWorkflow],
]) {
  const smokes = workflow
    .split("\n")
    .filter((line) => line.includes("scripts/ci/release-smoke.mjs"));
  assert.ok(smokes.length > 0, `${file} must run the release smoke`);
  for (const line of smokes) {
    if (line.includes("--allow-unversioned")) continue;
    assert.match(
      line,
      /--expected-sha "[^"]+" --expected-schema "[^"]+"$/,
      `${file} smoke must pass an expected schema version: ${line.trim()}`,
    );
  }
}
const deployJobs = parse(deployWorkflow).jobs;
for (const job of ["deploy-www", "deploy-admin"]) {
  const forward = deployJobs[job].steps.filter(
    (step) =>
      typeof step.run === "string" &&
      step.run.includes("release-smoke.mjs") &&
      step.run.includes('--expected-sha "${{ github.sha }}"'),
  );
  assert.ok(forward.length > 0, `${job} must smoke its exact release`);
  for (const step of forward) {
    assert.ok(
      step.run.includes(
        '--expected-schema "${{ needs.release.outputs.database_schema_version }}"',
      ),
      `${job} ${step.name} must expect the release job's schema version`,
    );
  }
}

// A-33: the editorial admin path skips the /api/health smokes (Access has one
// human owner), so the deployed version's message names the release's schema
// and the editorial verify step compares it with the release job's output.
{
  const steps = deployJobs["deploy-admin"].steps;
  const deploy = steps.find(
    (step) => step.name === "Deploy to Cloudflare Workers",
  );
  assert.match(
    deploy.with.command,
    /--message "release:\$\{\{ github\.sha \}\} schema:\$\{\{ needs\.release\.outputs\.database_schema_version \}\}"$/,
    "the admin version message must carry the release's schema version",
  );
  const verify = steps.find(
    (step) => step.name === "Verify editorial release and owner boundary",
  );
  assert.ok(
    verify.run.includes(
      'editorial-release-smoke.mjs verify "${{ github.sha }}" "${{ needs.release.outputs.database_schema_version }}"',
    ),
    "the editorial verify step must expect the release job's schema version",
  );
}

// A deploy job runs only after the release job succeeded. always() would let
// admin deploy after a held migration, schema drift or a failed postcondition.
for (const [name, job] of Object.entries(deployJobs)) {
  if (!name.startsWith("deploy-")) continue;
  assert.deepEqual(job.needs, ["release"], `${name} depends only on release`);
  assert.equal(
    /\b(?:always|failure|cancelled)\(\)/.test(job.if),
    false,
    `${name} must not run after a failed or cancelled release`,
  );
}
assert.match(
  deployJobs["deploy-admin"].if,
  /^needs\.release\.result == 'success' &&/,
  "deploy-admin must require a successful release job",
);

for (const file of workflowFiles) {
  const body = readFileSync(join(WORKFLOW_DIR, file), "utf8");
  assert.equal(
    /gh\s+pr\s+merge|\/approve-release|release-approved|pull-requests:\s*write|contents:\s*write/.test(
      body,
    ),
    false,
    `${file} must not merge or recreate an approval ceremony`,
  );
  for (const pattern of BANNED_PATTERNS) {
    assert.equal(
      pattern.test(body),
      false,
      `${file} includes disabled external LLM review hook ${pattern}`,
    );
  }
}

assert.match(
  ciWorkflow,
  /Validate migration inventory and replay[\s\S]*migration_preflight_required[\s\S]*pnpm test:content-publication-migration/,
  "publication schema replay must run in pre-merge migration validation",
);
