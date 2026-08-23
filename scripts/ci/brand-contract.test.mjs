#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "packages/brand";
const PACKET = join(ROOT, "ap-structural-v0.2.0-candidate.1");
const MANIFEST_HASH =
  "0465d108ffbcfff5816a15125ce0b54528419dbc522e1a7c0d0483ff9d9b766c";
const WOFF2_HASH =
  "ee8a297c8baf6311c8700f4119df7a84219298d29597a6aa09d9978effb894dd";

const manifestBytes = readFileSync(join(PACKET, "MANIFEST.json"));
assert.equal(sha256(manifestBytes), MANIFEST_HASH);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
for (const file of manifest.files) {
  assert.equal(
    sha256(readFileSync(join(PACKET, file.path))),
    file.sha256,
    `${file.path} must match the preserved source packet`,
  );
}

const release = JSON.parse(readFileSync(join(ROOT, "RELEASE.json"), "utf8"));
assert.equal(release.status, "web-ready");
assert.equal(release.display_face, "AP Structural");
assert.equal(
  release.display_face_source_packet,
  "ap-structural-v0.2.0-candidate.1",
);
assert.equal(release.display_face_woff2_sha256, WOFF2_HASH);
assert.equal(manifest.status, "web-ready");
assert.equal(manifest.coverage.glyphs, 487);
assert.equal(manifest.coverage.mappedCodePoints, 491);
assert.equal(manifest.correction.compositeTransformsRestored, true);
assert.equal(manifest.correction.widthClass, 5);
assert.deepEqual(manifest.correction.referenceAdvances, {
  I: 600,
  a: 1218,
  h: 1139,
  i: 540,
  m: 1777,
  n: 1139,
  o: 1120,
});
assert.deepEqual(release.semantic_colors, {
  light_background: "#61abea",
  light_text: "#ffffff",
  light_surface: "#61abea",
  light_surface_elevated: "#6eb2ec",
  dark_background: "#080b10",
  elevated_surface: "#11151d",
  action: "#61abea",
  primary_text: "#f7faff",
  muted_text: "#abb2be",
});

const tokens = readFileSync(join(ROOT, "src/tokens.css"), "utf8");
for (const value of Object.values(release.semantic_colors)) {
  assert.ok(tokens.includes(value), `tokens must contain ${value}`);
}

const typography = readFileSync(join(ROOT, "src/typography.css"), "utf8");
assert.ok(typography.includes('font-family: "AP Structural"'));
assert.ok(typography.includes('"Instrument Sans Variable"'));
assert.ok(
  typography.includes("APStructuralDisplayBlack-v0.2.0-candidate.1.woff2"),
);

const www = readFileSync("apps/www/src/styles/global.css", "utf8");
const admin = readFileSync("apps/admin/src/styles/admin.css", "utf8");
assert.ok(www.startsWith('@import "@anipotts/brand/public.css"'));
assert.ok(admin.startsWith('@import "@anipotts/brand/public.css"'));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

console.log("brand contract tests passed");
