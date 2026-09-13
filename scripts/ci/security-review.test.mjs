#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  isSensitivePath,
  requiresSecurityReview,
  reviewFiles,
} from "./security-review.mjs";

function expectSensitive(file, expected) {
  assert.equal(isSensitivePath(file), expected, file);
}

expectSensitive(".github/workflows/deploy.yml", true);
expectSensitive("apps/admin/src/middleware.ts", true);
for (const file of [
  "apps/admin/src/lib/access-identity.ts",
  "apps/admin/src/lib/editorial-security.ts",
  "apps/admin/src/lib/editorial-owner.ts",
  "apps/admin/src/lib/editorial-handoff-client.ts",
  "apps/admin/src/lib/draft-recovery.ts",
  "apps/admin/src/data/life-owner-reader.ts",
  "apps/admin/src/editorial/draft-store.ts",
  "apps/admin/wrangler.toml",
  "apps/www/wrangler.toml",
  "patches/@astryxdesign__core@0.4.6.patch",
]) {
  expectSensitive(file, true);
  assert.ok(
    reviewFiles(
      [file],
      () => `const token = "${"ghp_" + "a".repeat(30)}";`,
    ).some((finding) => finding.rule === "github-token"),
    `literal credential must be detected in ${file}`,
  );
}
expectSensitive(
  "apps/admin/src/pages/api/admin/content/draft-operation.ts",
  true,
);
expectSensitive("apps/admin/src/pages/api/admin/passkey/status.ts", true);
expectSensitive("apps/admin/src/pages/auth/passkey.astro", true);
expectSensitive("workers/state/src/index.ts", true);
expectSensitive("packages/content/src/public/defaults.ts", true);
expectSensitive("packages/lib/src/cms/homepage.ts", true);
expectSensitive("drizzle/migrations/0016_seed_homepage_rich_summary.sql", true);
expectSensitive("scripts/ci/security-review.mjs", true);
expectSensitive("package.json", true);
expectSensitive("docs/platform-architecture.md", false);
expectSensitive("apps/www/src/pages/index.astro", false);
expectSensitive("apps/admin/README.md", false);

assert.equal(
  requiresSecurityReview([
    "docs/platform-architecture.md",
    "apps/admin/src/middleware.ts",
  ]),
  true,
);

assert.equal(requiresSecurityReview(["docs/platform-architecture.md"]), false);

const boundary = "apps/admin/src/lib/editorial-inventory-projection.test.ts";
assert.ok(
  reviewFiles(
    ["apps/admin/wrangler.toml"],
    () => `# Secrets: ${"A1".repeat(16)}.`,
  ).length > 0,
);
assert.deepEqual(
  reviewFiles([boundary], () => 'key: "content/public/writing/post.md",'),
  [],
);
assert.ok(
  reviewFiles(
    [boundary],
    () =>
      'key: "content/public/writing/post.md", token: "abcdefghijklmnopqrstuvwxyz123456"',
  ).length > 0,
);
assert.ok(
  reviewFiles([boundary], () => 'key: "abcdefghijklmnopqrstuvwxyz123456"')
    .length > 0,
);
assert.deepEqual(
  reviewFiles(
    ["apps/admin/wrangler.toml"],
    () =>
      `ACCESS_POLICY_AUD = "${"a".repeat(64)}"\n# Secrets: EDITORIAL_GITHUB_PRIVATE_KEY and EDITORIAL_SIGNING_PRIVATE_KEY.`,
  ),
  [],
);
assert.ok(
  reviewFiles(
    ["apps/admin/wrangler.toml"],
    () => `ACCESS_TOKEN = "${"a".repeat(64)}"`,
  ).length > 0,
);
assert.ok(
  reviewFiles(
    ["apps/admin/wrangler.toml"],
    () => `# Secrets: ${"ghp_" + "a".repeat(30)}.`,
  ).length > 0,
);

const publicSqlMetadataAssignment =
  "  authority_" + "state = 'passkey_draft_save_no_publish';\n";

const fakeFiles = new Map([
  [
    ".github/workflows/review.yml",
    "env:\n  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n",
  ],
  [
    "scripts/example.ts",
    `const token = "${"sk-proj-" + "abcdefghijklmnopqrstuvwxyz"}";\n`,
  ],
  [
    "drizzle/migrations/0099_drop.sql",
    "-- rollback comment can say DELETE FROM safely\nDROP TABLE sessions;\n",
  ],
  [
    ".github/workflows/deploy.yml",
    "env:\n  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n",
  ],
  [
    "packages/content/src/admin/operations.ts",
    `const operation = {
  authority_state: "source_truth_resolved_preview_only",
  current_value_ref: "published_page_content:newsletter_archive",
};
`,
  ],
  ["drizzle/migrations/0100_public_metadata.sql", publicSqlMetadataAssignment],
  [
    "packages/content/src/admin/runtime.ts",
    "  secret_" + "values_included: value.secret_values_included,\n",
  ],
  [
    "packages/lib/src/admin-control/dev-fixtures.ts",
    "  auth_" + 'model: "cloudflare-access-service-token-per-machine",\n',
  ],
  [
    "packages/lib/src/admin-control/types.ts",
    "  au" + "th: AdminControlAuthContract;\n",
  ],
  [
    "packages/lib/src/admin-control/unsafe.ts",
    "  au" + 'th: "abcdefghijklmnopqrstuvwxyz123456";\n',
  ],
  [
    "apps/admin/src/pages/auth/invite-safe.astro",
    'const inviteCode = Astro.url.searchParams.get("token") ?? "";\n',
  ],
  [
    "workers/state/src/control-plane-safe.ts",
    "const lane = submission.authority.lane;\n  authority: lane,\n",
  ],
]);

function readFake(file) {
  return fakeFiles.get(file) ?? "";
}

const findings = reviewFiles(
  [
    ".github/workflows/review.yml",
    "scripts/example.ts",
    "drizzle/migrations/0099_drop.sql",
    ".github/workflows/deploy.yml",
    "packages/content/src/admin/operations.ts",
    "packages/content/src/admin/runtime.ts",
    "packages/lib/src/admin-control/dev-fixtures.ts",
    "packages/lib/src/admin-control/types.ts",
    "packages/lib/src/admin-control/unsafe.ts",
    "apps/admin/src/pages/auth/invite-safe.astro",
    "workers/state/src/control-plane-safe.ts",
    "drizzle/migrations/0100_public_metadata.sql",
    "docs/archive/old.md",
  ],
  readFake,
);

assert.deepEqual(findings.map((finding) => finding.rule).sort(), [
  "anthropic-api-key",
  "drop-table",
  "inline-secret-assignment",
  "inline-secret-assignment",
  "openai-or-similar-key",
]);

assert.deepEqual(reviewFiles([".github/workflows/deploy.yml"], readFake), []);
