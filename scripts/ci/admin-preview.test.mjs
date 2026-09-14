#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const previewSource = readFileSync("scripts/admin/admin-preview.mjs", "utf8");
const passkeySource = readFileSync(
  "apps/admin/src/lib/passkey-auth.ts",
  "utf8",
);
const agentGuide = readFileSync("AGENTS.md", "utf8");
const previewGuide = readFileSync(
  "docs/local-admin-preview-thread-prompt.md",
  "utf8",
);

assert.equal(
  packageJson.scripts["admin:preview:ensure"],
  "node scripts/admin/admin-preview.mjs ensure",
);
assert.equal(
  packageJson.scripts["admin:preview:status"],
  "node scripts/admin/admin-preview.mjs status",
);
assert.equal(
  packageJson.scripts["admin:preview:stop"],
  "node scripts/admin/admin-preview.mjs stop",
);

for (const marker of [
  'const DEFAULT_HOST = "localhost"',
  "const DEFAULT_PORT = 4311",
  'const HEALTH_PATH = "/api/health"',
  'payload?.app === "admin-astro"',
  'payload?.target === "admin.anipotts.com"',
  "processMatches(metadata)",
  "no process was stopped",
  'process.kill(-metadata.pid, "SIGTERM")',
  "no stronger signal was sent",
]) {
  assert.ok(
    previewSource.includes(marker),
    `preview manager missing ${marker}`,
  );
}

assert.equal(
  previewSource.includes("ADMIN_PREVIEW_HOST"),
  false,
  "preview manager must stay bound to canonical loopback",
);

// The shared 4311 review preview is never a local owner build, even when the
// calling shell exported ADMIN_LOCAL_OWNER=1. One pure function builds the
// child environment, so the rule is tested without touching the preview.
assert.ok(
  previewSource.includes("env: adminPreviewChildEnv(process.env)"),
  "preview manager must build its child environment with adminPreviewChildEnv",
);
assert.equal(
  /\.\.\.process\.env/.test(previewSource),
  false,
  "preview manager must not spread the parent environment into the child",
);
const { adminPreviewChildEnv } = await import("../admin/admin-preview-env.mjs");
const inherited = Object.freeze({
  PATH: "/usr/bin",
  ADMIN_LOCAL_OWNER: "1",
  ADMIN_PREVIEW_PORT: "4311",
  FORCE_COLOR: "1",
});
const childEnv = adminPreviewChildEnv(inherited);
assert.equal(Object.hasOwn(childEnv, "ADMIN_LOCAL_OWNER"), false);
assert.equal(childEnv.PATH, "/usr/bin");
assert.equal(childEnv.ADMIN_PREVIEW_PORT, "4311");
assert.equal(childEnv.FORCE_COLOR, "0");
assert.equal(inherited.ADMIN_LOCAL_OWNER, "1", "the parent env is not mutated");
for (const value of ["", "0", "yes"]) {
  assert.equal(
    Object.hasOwn(
      adminPreviewChildEnv({ ADMIN_LOCAL_OWNER: value }),
      "ADMIN_LOCAL_OWNER",
    ),
    false,
    `ADMIN_LOCAL_OWNER=${JSON.stringify(value)} must not reach the preview`,
  );
}

assert.ok(
  passkeySource.includes("isLoopbackDevOrigin"),
  "passkey auth must recognize the canonical loopback preview",
);
assert.equal(
  passkeySource.includes('const LOCAL_ORIGIN = "http://localhost:3001"'),
  false,
  "passkey auth must not pin local development to one port",
);

for (const source of [agentGuide, previewGuide]) {
  assert.ok(
    source.includes("pnpm admin:preview:ensure"),
    "local preview guidance must use the durable ensure command",
  );
  assert.ok(
    source.includes("http://localhost:4311/"),
    "local preview guidance must name the canonical review URL",
  );
}

console.log("admin preview invariants: ok");
