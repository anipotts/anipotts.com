#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_SMOKE_ROUTES } from "./public-route-inventory.mjs";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const smokeWorkflow = readFileSync(".github/workflows/smoke.yml", "utf8");
const releaseSmoke = readFileSync("scripts/ci/release-smoke.mjs", "utf8");

assert.ok(PUBLIC_SMOKE_ROUTES.includes("/"));
assert.equal(PUBLIC_SMOKE_ROUTES.includes("/newsletter"), false);

for (const [sourceName, source] of [
  ["deploy.yml", deployWorkflow],
  ["smoke.yml", smokeWorkflow],
]) {
  assert.ok(
    source.includes("scripts/ci/release-smoke.mjs --target www"),
    `${sourceName} must call the shared public release smoke`,
  );
}
assert.ok(
  releaseSmoke.includes(
    'import { PUBLIC_SMOKE_ROUTES } from "./public-route-inventory.mjs";',
  ),
  "release smoke must import the canonical public route inventory",
);

assert.ok(releaseSmoke.includes("healthAttempts = 6"));
assert.ok(releaseSmoke.includes("retryDelayMs = 10_000"));
assert.ok(releaseSmoke.includes("health.release_sha === expectedSha"));
