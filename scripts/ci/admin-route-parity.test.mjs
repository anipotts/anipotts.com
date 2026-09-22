#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_PROTECTED_SMOKE_ROUTES,
  ADMIN_REDIRECTS,
  ADMIN_ROUTES,
  RETIRED_ADMIN_AUTH_FILES,
  PUBLIC_UNSMOKED_ROUTE_FILES,
} from "./admin-route-inventory.mjs";

const navSource = readFileSync("apps/admin/src/data/admin.ts", "utf8");
const sidebarSource = readFileSync(
  "apps/admin/src/components/astryx/UnifiedSidebar.tsx",
  "utf8",
);
const rootSource = readFileSync("apps/admin/src/pages/index.astro", "utf8");
const layoutSource = readFileSync(
  "apps/admin/src/layouts/AdminLayout.astro",
  "utf8",
);
const astroConfigSource = readFileSync("apps/admin/astro.config.mjs", "utf8");
const lifecycleSource = readFileSync(
  "packages/lib/src/admin-control/work-lifecycle.ts",
  "utf8",
);
const middlewareSource = readFileSync("apps/admin/src/middleware.ts", "utf8");
const accessPolicySource = readFileSync(
  "apps/admin/src/lib/admin-access-policy.ts",
  "utf8",
);
const passkeyProofSource = readFileSync(
  "scripts/admin/passkey-proof.mjs",
  "utf8",
);
const authSource = readFileSync("apps/admin/src/pages/auth.astro", "utf8");
const contentEditorSource = readFileSync(
  "apps/admin/src/pages/content/edit/[pageKey].astro",
  "utf8",
);
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const smokeWorkflow = readFileSync(".github/workflows/smoke.yml", "utf8");
assert.ok(
  deployWorkflow.includes("scripts/ci/release-smoke.mjs --target admin"),
  "deploy workflow must use the shared admin smoke implementation",
);
assert.ok(
  smokeWorkflow.includes("scripts/ci/release-smoke.mjs --target admin"),
  "manual smoke must use the shared admin smoke implementation",
);
const deploySmokeRoutes = new Set(ADMIN_PROTECTED_SMOKE_ROUTES);
const manualSmokeRoutes = new Set(ADMIN_PROTECTED_SMOKE_ROUTES);
const publicPaths = extractStringList(accessPolicySource, "PUBLIC_PATHS");
const publicPasskeyApiPaths = extractStringList(
  accessPolicySource,
  "PUBLIC_PASSKEY_API_PATHS",
);
const publicPrefixes = extractStringList(accessPolicySource, "PUBLIC_PREFIXES");
const loopbackHostnames = extractStringList(
  accessPolicySource,
  "LOOPBACK_HOSTNAMES",
);
const devLoopbackPreviewPaths = extractStringList(
  accessPolicySource,
  "DEV_LOOPBACK_PREVIEW_PATHS",
);
const devPreviewAssetPaths = extractStringList(
  accessPolicySource,
  "DEV_PREVIEW_ASSET_PATHS",
);
const devPreviewAssetPrefixes = extractStringList(
  accessPolicySource,
  "DEV_PREVIEW_ASSET_PREFIXES",
);
const retiredActionQueueFiles = [
  "apps/admin/src/pages/needs-ani.astro",
  "apps/admin/src/data/needs.ts",
  "apps/admin/src/data/static/needs-ani.syscalls.json",
  "packages/content/src/admin/needs.ts",
];

assert.deepEqual(publicPaths, [
  "/admin-bracket.svg",
  "/api/health",
  "/api/mcp",
  "/apple-touch-icon.png",
  "/auth",
  "/auth/invite",
  "/auth/passkey",
  "/auth/recover",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon-dark-32.png",
  "/favicon-dark.svg",
  "/favicon-light-32.png",
  "/favicon-light.svg",
  "/favicon.svg",
]);
assert.deepEqual(publicPasskeyApiPaths, [
  "/api/admin/auth/session",
  "/api/admin/device/claim",
  "/api/admin/device/start",
  "/api/admin/device/status",
  "/api/admin/invites/register-options",
  "/api/admin/invites/register-verify",
  "/api/admin/invites/status",
  "/api/admin/passkey/login-options",
  "/api/admin/passkey/login-verify",
  "/api/admin/passkey/logout",
  "/api/admin/passkey/register-options",
  "/api/admin/passkey/register-verify",
  "/api/admin/passkey/revoke-current",
  "/api/admin/passkey/status",
  "/api/admin/password/login",
  "/api/admin/password/logout",
  "/api/admin/password/status",
  "/api/admin/recovery/google/callback",
  "/api/admin/recovery/google/start",
]);
assert.deepEqual(publicPrefixes, ["/_astro/", "/assets/"]);
assert.deepEqual(loopbackHostnames, ["127.0.0.1", "[::1]", "localhost"]);
assert.deepEqual(devLoopbackPreviewPaths, [
  "/",
  "/content",
  "/content/carousels",
  "/content/drafts",
  "/content/newsletter",
  "/content/operations",
  "/content/pages",
  "/content/preview",
  "/content/projects",
  "/content/review",
  "/content/writing",
  "/data",
  "/data/health",
  "/data/knowledge",
  "/data/records",
  "/data/sources",
  "/deploys",
  "/fleet",
  "/handoffs",
  "/inbox",
  "/knowledge",
  "/knowledge/locations",
  "/life",
  "/life/aesthetics",
  "/life/health",
  "/life/people",
  "/life/places",
  "/life/preview",
  "/life/projects",
  "/life/sources",
  "/life/timeline",
  "/mutations",
  "/newsletter",
  "/observability/activity",
  "/observability/alerts",
  "/observability/status",
  "/operations/observability",
  "/proof",
  "/repos",
  "/system",
  "/work",
]);
assert.deepEqual(devPreviewAssetPaths, ["/@react-refresh"]);
assert.deepEqual(devPreviewAssetPrefixes, ["/@id/", "/@vite/", "/src/"]);
assert.ok(
  !/anipotts\\?\.localhost/.test(accessPolicySource),
  "the dev preview must not trust named localhost hosts",
);
assert.match(
  accessPolicySource,
  /url\.protocol === "http:" &&\s*LOOPBACK_HOSTNAMES\.has\(url\.hostname\)/,
  "the dev preview must accept only plain HTTP loopback origins",
);
assert.ok(
  middlewareSource.includes("isDev: import.meta.env.DEV"),
  "loopback preview must remain gated by Astro development mode",
);
assert.ok(
  middlewareSource.includes('searchParams.get("stepup") !== "1"'),
  "fresh passkey step-up must remain reachable from an active session",
);

const classifiedFiles = new Set([
  ...ADMIN_ROUTES.map((route) => route.file),
  ...PUBLIC_UNSMOKED_ROUTE_FILES,
]);

for (const file of listAdminPageFiles()) {
  assert.ok(
    classifiedFiles.has(file),
    `${file} must be classified in admin-route-parity before it can ship`,
  );
}

for (const file of PUBLIC_UNSMOKED_ROUTE_FILES) {
  assert.ok(existsSync(file), `public admin exception missing ${file}`);
}

assert.ok(
  passkeyProofSource.includes("ADMIN_PROTECTED_SMOKE_ROUTES"),
  "passkey proof must import shared protected smoke routes",
);
assert.ok(
  passkeyProofSource.includes("const ROUTES = ADMIN_PROTECTED_SMOKE_ROUTES;"),
  "passkey proof must use the shared protected smoke route list",
);

for (const route of ADMIN_ROUTES) {
  assert.ok(existsSync(route.file), `${route.route} missing ${route.file}`);

  if (route.route !== "/auth/passkey") {
    assert.equal(
      publicPaths.includes(route.route),
      false,
      `${route.route} must stay behind passkey middleware`,
    );
    assert.equal(
      publicPasskeyApiPaths.includes(route.route),
      false,
      `${route.route} must not be exposed as a public passkey API`,
    );
    assert.equal(
      publicPrefixes.some((prefix) => route.route.startsWith(prefix)),
      false,
      `${route.route} must not match a public static prefix`,
    );
  }

  if (route.nav) {
    assert.ok(
      sidebarSource.includes(`href: "${route.route}"`),
      `${route.route} missing from the sidebar`,
    );
  }

  if (route.smoke !== false) {
    assert.ok(
      deploySmokeRoutes.has(route.route),
      `${route.route} missing from deploy admin smoke`,
    );
    assert.ok(
      manualSmokeRoutes.has(route.route),
      `${route.route} missing from smoke.yml admin route proof`,
    );
    assert.ok(
      ADMIN_PROTECTED_SMOKE_ROUTES.includes(route.route),
      `${route.route} missing from shared passkey proof route set`,
    );
  }
}

// Inbox is retired: no navigation entry, no page or API, and old links land
// on Observability. Its inbox_items projection in @anipotts/lib stays for /api/mcp.
assert.equal(
  navSource.includes('"/inbox"'),
  false,
  "admin nav must not link the retired Inbox",
);
for (const file of [
  "apps/admin/src/components/AdminHome.astro",
  "apps/admin/src/components/AttentionRow.astro",
  "apps/admin/src/components/ActivationGraph.astro",
  "apps/admin/src/components/ControlPlaneReceipt.astro",
  "apps/admin/src/data/inbox.ts",
  "apps/admin/src/data/activation-graph.ts",
  "apps/admin/src/pages/api/admin/inbox.ts",
])
  assert.equal(existsSync(file), false, `${file} must stay retired`);
assert.ok(rootSource.includes("<PrivateShell"), "root is the one overview");
assert.equal(
  ADMIN_REDIRECTS["/inbox"],
  "/observability/status",
  "retired inbox redirects to Observability Status",
);
// The sidebar lists Content (4), Data (4) and Observability (3) under one
// overview link, all from one list.
for (const href of [
  "/",
  "/content/pages",
  "/content/writing",
  "/content/projects",
  "/content/newsletter",
  "/data/records",
  "/data/sources",
  "/data/health",
  "/data/knowledge",
  "/observability/status",
  "/observability/activity",
  "/observability/alerts",
])
  assert.ok(sidebarSource.includes(`href: "${href}"`), `sidebar lists ${href}`);
for (const retired of ["/life", "/knowledge", "/operations/observability"])
  assert.equal(
    sidebarSource.includes(`href: "${retired}`),
    false,
    `sidebar must not link ${retired}`,
  );
// Every retired URL answers 308 with its new home. Request-dependent
// redirects stay pages; fixed ones live in astro.config.mjs.
for (const [page, marker] of [
  ["content/index", "libraryStateUrl("],
  ["newsletter", "libraryStateUrl("],
  ["life/[section]", "Astro.redirect(lifeRedirect(Astro.params.section), 308)"],
  ["knowledge", "knowledgeRedirect("],
  ["knowledge/locations", 'Astro.redirect(dataRecordsHref("places"), 308)'],
]) {
  const source = readFileSync(`apps/admin/src/pages/${page}.astro`, "utf8");
  assert.ok(source.includes(marker), `/${page} redirects with ${marker}`);
  assert.ok(source.includes("308"), `/${page} redirects permanently`);
}
for (const file of [
  "apps/admin/src/pages/life/health.astro",
  "apps/admin/src/pages/life/aesthetics.astro",
  "apps/admin/src/components/life/LifeWorkspace.tsx",
  "apps/admin/src/components/life/PrivateDataWorkspace.tsx",
])
  assert.equal(existsSync(file), false, `${file} must stay retired`);
// Retired pages, fixture views and the old console are gone. Each URL is a
// config redirect to a live route, with no page file or navigation entry.
assert.ok(
  astroConfigSource.includes("retiredRoutes(),"),
  "astro.config.mjs must serve the retired route redirects",
);
assert.ok(
  readFileSync("apps/admin/src/lib/retired-route.ts", "utf8").includes(
    "status: 308",
  ),
  "retired routes redirect permanently",
);
const liveRoutes = new Set(ADMIN_ROUTES.map((route) => route.route));
for (const [from, destination] of Object.entries(ADMIN_REDIRECTS)) {
  assert.ok(liveRoutes.has(destination), `${from} redirects to a live route`);
  assert.equal(liveRoutes.has(from), false, `${from} is not also a live route`);
  for (const file of [
    `apps/admin/src/pages${from}.astro`,
    `apps/admin/src/pages${from}/index.astro`,
  ])
    assert.equal(existsSync(file), false, `${file} must stay retired`);
  assert.equal(
    sidebarSource.includes(`href: "${from}"`) ||
      navSource.includes(`href: "${from}"`),
    false,
    `navigation must not link the retired ${from}`,
  );
}
for (const file of [
  "apps/admin/src/components/AdminTable.astro",
  "apps/admin/src/components/CmsMarkdown.astro",
  "apps/admin/src/components/SemanticInspector.astro",
  "apps/admin/src/components/SemanticReference.astro",
  "apps/admin/src/components/astryx/OperatorWorkTable.tsx",
  "apps/admin/src/components/auth/AuthFrame.astro",
  "apps/admin/src/data/carousels.ts",
  "apps/admin/src/data/operator-work.ts",
  "apps/admin/src/data/proof.ts",
  "apps/admin/src/data/semantic-reference.ts",
  "apps/admin/src/data/static/carousels",
  "apps/admin/src/styles/admin-canvas.css",
  "apps/admin/public/media/carousels",
])
  assert.equal(existsSync(file), false, `${file} must stay retired`);
for (const file of [
  "apps/admin/src/lib/observability-model.ts",
  "apps/admin/src/lib/observability-reader.ts",
  "apps/admin/src/lib/observability-activity.ts",
  "apps/admin/src/pages/api/admin/observability.ts",
])
  assert.equal(existsSync(file), false, `${file} must stay retired`);
for (const file of RETIRED_ADMIN_AUTH_FILES)
  assert.equal(existsSync(file), false, `${file} must remain retired`);
assert.ok(
  middlewareSource.includes("verifyEditorialOwner"),
  "editorial requests require signed owner identity",
);
for (const file of retiredActionQueueFiles) {
  assert.equal(existsSync(file), false, `${file} must stay retired`);
}
assert.equal(
  ADMIN_ROUTES.some((route) => route.route === "/needs-ani"),
  false,
  "retired action queue route must not be classified",
);
assert.equal(
  deploySmokeRoutes.has("/needs-ani"),
  false,
  "retired action queue route must not stay in deploy smoke",
);
assert.equal(
  manualSmokeRoutes.has("/needs-ani"),
  false,
  "retired action queue route must not stay in manual smoke",
);

for (const marker of [
  "sourceIdentityKey",
  "upsertSourceImport",
  "evaluateArchiveCandidate",
  "createArchiveProposalBatches",
  "confirmArchiveProposal",
  "restoreArchiveReceipt",
  "MAX_ARCHIVE_BATCH_SIZE = 20",
]) {
  assert.ok(
    lifecycleSource.includes(marker),
    `lifecycle seam missing ${marker}`,
  );
}

for (const marker of [
  "AdminWordmark",
  "editorialReturnPath",
  "href={destination}",
  "sign-in:focus-visible",
]) {
  assert.ok(
    authSource.includes(marker),
    `/auth missing editorial sign-in requirement ${marker}`,
  );
}
for (const retired of ["continue with passkey", "recover access", "use phone"])
  assert.equal(authSource.includes(retired), false);

for (const marker of [
  "readPageContentInventoryStore",
  "/api/admin/content/editor",
  "Legacy content diagnostics",
]) {
  assert.ok(
    contentEditorSource.includes(marker),
    `/content/edit/:pageKey missing draft editor marker ${marker}`,
  );
}

function extractStringList(source, name) {
  const match =
    source.match(
      new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`),
    ) ?? source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `missing middleware list ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort();
}

function listAdminPageFiles(dir = "apps/admin/src/pages") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listAdminPageFiles(path);
    if (!entry.isFile()) return [];
    if (!/\.(astro|ts)$/.test(entry.name)) return [];
    return [path];
  });
}
