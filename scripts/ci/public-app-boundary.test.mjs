#!/usr/bin/env node

import assert from "node:assert/strict";
import "./public-freshness.test.mjs";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WWW_ROOT = "apps/www";
const WWW_SRC = join(WWW_ROOT, "src");
const WWW_PAGES = join(WWW_SRC, "pages");

const ALLOWED_API_ROUTES = [
  "content-version",
  "health",
  "icon",
  "newsletter/confirm",
  "newsletter/subscribe",
  "newsletter/unsubscribe",
  "newsletter/webhooks/resend",
  "subscribe",
];

const FORBIDDEN_PAGE_SEGMENTS = new Set([
  "admin",
  "auth",
  "deploys",
  "fleet",
  "handoffs",
  "mutations",
  "ops",
  "proof",
  "repos",
]);

const FORBIDDEN_SOURCE_PATTERNS = [
  {
    pattern:
      /\b(?:publishDirect|listPublicationHistory|getPublicationByOperation|getDirectReceipt)\b/,
    message:
      "apps/www may read active publication inventory, never write publications or expose private operation/history readers",
  },
  {
    pattern: /@anipotts\/lib\/(?:cms|db)\b/,
    message:
      "apps/www must use the reviewed public publication reader, never legacy D1 CMS adapters",
  },
  {
    pattern: /\b(?:fetchPageContent|fetchPublishedPageContentByPrefix|setDB)\b/,
    message: "apps/www must not restore legacy mutable D1 content loaders",
  },
  {
    pattern: /@anipotts\/content\/admin\b/,
    message: "apps/www must not import admin content package entrypoints",
  },
  {
    pattern: /@anipotts\/lib\/admin\b/,
    message: "apps/www must not import admin lib entrypoints",
  },
  {
    pattern: /\badmin_passkey_[a-z_]+\b/,
    message: "apps/www must not touch admin passkey tables directly",
  },
  {
    pattern: /\badmin_proof_events\b/,
    message: "apps/www must not touch admin proof tables directly",
  },
  {
    pattern: /\bcontent_draft_operations\b/,
    message: "apps/www must not touch admin content draft operations directly",
  },
  {
    pattern: /\bcontent_publish_events\b/,
    message: "apps/www must not touch content publish events directly",
  },
  {
    pattern: /\bcontent_records\b/,
    message: "apps/www must not touch future content write records directly",
  },
  {
    pattern: /Cf-Access-Jwt-Assertion/i,
    message: "apps/www must not read Cloudflare Access identity headers",
  },
  {
    pattern: /\bACCESS_POLICY_AUD\b/,
    message: "apps/www must not depend on admin Access policy config",
  },
  {
    pattern: /\bACCESS_TEAM_DOMAIN\b/,
    message: "apps/www must not depend on admin Access team config",
  },
  {
    pattern: /\/api\/admin\//,
    message: "apps/www must not call or expose admin API routes",
  },
  {
    pattern: /posthog/i,
    message:
      "apps/www ships no PostHog snippet, proxy or host; Cloudflare Web Analytics is the only analytics",
  },
];

const files = listFiles(WWW_SRC);
const pageFiles = files.filter((file) => file.startsWith(`${WWW_PAGES}/`));
const apiRoutes = pageFiles
  .filter((file) => file.startsWith(`${WWW_PAGES}/api/`))
  .map((file) => stripPageExtension(relative(`${WWW_PAGES}/api`, file)))
  .sort();

assert.deepEqual(
  apiRoutes,
  ALLOWED_API_ROUTES,
  "apps/www API surface must stay public-only and explicitly allowlisted",
);

for (const file of pageFiles) {
  const routePath = stripPageExtension(relative(WWW_PAGES, file));
  const firstSegment = routePath.split("/")[0];
  assert.equal(
    FORBIDDEN_PAGE_SEGMENTS.has(firstSegment),
    false,
    `${file} puts an admin/control segment under the public app`,
  );
}

// The PostHog stack is gone: no key was ever set, so the snippet never ran
// while /ingest still forwarded any path to PostHog. www keeps Cloudflare Web
// Analytics, which is edge-injected and needs no first-party route. Assert the
// removal so nothing reintroduces a third-party proxy or beacon by accident.
assert.equal(
  existsSync("apps/www/src/pages/ingest"),
  false,
  "the /ingest reverse proxy is removed and must not come back",
);

const sourceFiles = files.filter((file) =>
  /\.(astro|[cm]?[jt]sx?)$/.test(file),
);
for (const file of sourceFiles) {
  if (file.startsWith(`${WWW_SRC}/content/`)) continue;
  const source = readFileSync(file, "utf8");
  for (const { pattern, message } of FORBIDDEN_SOURCE_PATTERNS) {
    assert.equal(pattern.test(source), false, `${file}: ${message}`);
  }
}

for (const component of [
  "AmbientFlow.astro",
  "CodingAgentTipsCard.astro",
  "ExperienceFeatureCard.astro",
]) {
  const source = readFileSync(join(WWW_SRC, "components", component), "utf8");
  assert.doesNotMatch(
    source,
    /:hover[^{}]*\{[^{}]*transform\s*:[^;}]*translate3d/s,
    `${component} must keep decorative geometry fixed inside its clipped surface on hover`,
  );
}

const ambientFlow = readFileSync(
  join(WWW_SRC, "components", "AmbientFlow.astro"),
  "utf8",
);
assert.match(
  ambientFlow,
  /preserveAspectRatio="xMidYMid slice"/,
  "ambient artwork must preserve its proportions inside cropped surfaces",
);
assert.match(ambientFlow, /aria-hidden="true"/, "artwork is decorative");

const wrangler = readFileSync("apps/www/wrangler.toml", "utf8");
for (const marker of [
  "ACCESS_POLICY_AUD",
  "ACCESS_TEAM_DOMAIN",
  "ADMIN_PASSKEY",
  "admin.anipotts.com",
]) {
  assert.equal(
    wrangler.includes(marker),
    false,
    `apps/www wrangler config must not include admin boundary marker ${marker}`,
  );
}

function listFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    if (entry.isFile() || statSync(path).isFile()) return [path];
    return [];
  });
}

function stripPageExtension(file) {
  return file.replace(/\.(astro|[cm]?[jt]sx?)$/, "");
}
