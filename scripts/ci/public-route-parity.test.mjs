#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_SMOKE_ROUTES } from "./public-route-inventory.mjs";

const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const smokeWorkflow = readFileSync(".github/workflows/smoke.yml", "utf8");
const releaseSmoke = readFileSync("scripts/ci/release-smoke.mjs", "utf8");
const contentProof = readFileSync("scripts/admin/content-proof.mjs", "utf8");

assert.equal(PUBLIC_SMOKE_ROUTES.length, 22);

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

assert.ok(
  contentProof.includes(
    'import { PUBLIC_SMOKE_ROUTES } from "../ci/public-route-inventory.mjs";',
  ),
  "content-proof must import shared public smoke routes",
);
assert.ok(
  contentProof.includes("const PUBLIC_ROUTES = PUBLIC_SMOKE_ROUTES;"),
  "content-proof must probe the shared public smoke route set",
);

assert.ok(releaseSmoke.includes("healthAttempts = 6"));
assert.ok(releaseSmoke.includes("retryDelayMs = 10_000"));
assert.ok(releaseSmoke.includes("health.release_sha === expectedSha"));

for (const marker of [
  'method: "HEAD"',
  "runD1(`",
  "publishedEventRoutes",
  "UNPUBLISHED_PUBLIC_ROUTES",
  "publishedEventRouteChecks",
  "unpublishedPublicRouteChecks",
]) {
  assert.ok(
    contentProof.includes(marker),
    `content-proof must retain ${marker}`,
  );
}
