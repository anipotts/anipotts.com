#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_PROTECTED_SMOKE_ROUTES,
  ADMIN_ROUTES,
  RETIRED_ADMIN_AUTH_FILES,
  PUBLIC_UNSMOKED_ROUTE_FILES,
} from "./admin-route-inventory.mjs";

const navSource = readFileSync("apps/admin/src/data/admin.ts", "utf8");
const websiteNavSource = readFileSync(
  "apps/admin/src/components/astryx/EditorialWorkspaceShell.tsx",
  "utf8",
);
const inboxDataSource = readFileSync("apps/admin/src/data/inbox.ts", "utf8");
const inboxSource = readFileSync("apps/admin/src/pages/inbox.astro", "utf8");
const rootSource = readFileSync("apps/admin/src/pages/index.astro", "utf8");
const homeSource = readFileSync(
  "apps/admin/src/components/AdminHome.astro",
  "utf8",
);
const layoutSource = readFileSync(
  "apps/admin/src/layouts/AdminLayout.astro",
  "utf8",
);
const attentionRowSource = readFileSync(
  "apps/admin/src/components/AttentionRow.astro",
  "utf8",
);
const semanticInspectorSource = readFileSync(
  "apps/admin/src/components/SemanticInspector.astro",
  "utf8",
);
const semanticReferenceSource = readFileSync(
  "apps/admin/src/data/semantic-reference.ts",
  "utf8",
);
const knowledgeSource = readFileSync(
  "apps/admin/src/pages/knowledge.astro",
  "utf8",
);
const locationsSource = readFileSync(
  "apps/admin/src/pages/knowledge/locations.astro",
  "utf8",
);
const workSource = readFileSync("apps/admin/src/pages/work.astro", "utf8");
const operatorWorkTableSource = readFileSync(
  "apps/admin/src/components/astryx/OperatorWorkTable.tsx",
  "utf8",
);
const operatorWorkSource = readFileSync(
  "apps/admin/src/data/operator-work.ts",
  "utf8",
);
const devOperatorWorkSource = readFileSync(
  "apps/admin/src/data/dev-operator-work.ts",
  "utf8",
);
const lifeSource = readFileSync(
  "apps/admin/src/pages/life/index.astro",
  "utf8",
);
const healthSource = readFileSync(
  "apps/admin/src/pages/life/health.astro",
  "utf8",
);
const aestheticsSource = readFileSync(
  "apps/admin/src/pages/life/aesthetics.astro",
  "utf8",
);
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
const devLoopbackOrigins = extractStringList(
  accessPolicySource,
  "DEV_LOOPBACK_ORIGINS",
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
assert.deepEqual(devLoopbackOrigins, [
  "http://127.0.0.1:4311",
  "http://localhost:4311",
]);
assert.deepEqual(devLoopbackPreviewPaths, [
  "/",
  "/content",
  "/content/carousels",
  "/content/drafts",
  "/content/operations",
  "/content/preview",
  "/content/review",
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
  "/operations/observability",
  "/proof",
  "/repos",
  "/system",
  "/work",
]);
assert.deepEqual(devPreviewAssetPaths, ["/@react-refresh"]);
assert.deepEqual(devPreviewAssetPrefixes, ["/@id/", "/@vite/", "/src/"]);
assert.match(
  accessPolicySource,
  /DEV_PORTLESS_HOST_PATTERN[\s\S]*admin\\\.anipotts\\\.localhost/,
  "Portless preview must match only the exact Admin localhost suffix",
);
assert.ok(
  accessPolicySource.includes(
    'url.protocol === "http:" && url.port === "1355"',
  ),
  "rootless Portless preview must stay pinned to HTTP port 1355",
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
    const navHref = route.route === "/work" ? "/work?view=now" : route.route;
    assert.ok(
      (route.route === "/newsletter" ? websiteNavSource : navSource).includes(
        `href: "${navHref}"`,
      ),
      `${route.route} missing from admin nav`,
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

assert.equal(
  [...navSource.matchAll(/label: "Inbox"/g)].length,
  1,
  "admin nav must expose one primary inbox entry",
);
assert.ok(
  rootSource.includes("Astro.redirect(`/content${Astro.url.search}`"),
  "root opens editorial content and preserves its query",
);
assert.ok(
  inboxSource.includes('import AdminHome from "../components/AdminHome.astro"'),
  "legacy inbox keeps its projection",
);
for (const file of RETIRED_ADMIN_AUTH_FILES)
  assert.equal(existsSync(file), false, `${file} must remain retired`);
assert.ok(
  middlewareSource.includes("verifyEditorialOwner"),
  "editorial requests require signed owner identity",
);
assert.ok(
  navSource.includes('href: "/inbox",\n    label: "Inbox"'),
  "Operations Inbox navigation must use its dedicated URL",
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
  "data-astro-rerun",
  "data-attention-projection",
  "ActivationGraph",
  "buildActivationGraph",
  "needs you",
  "being handled",
  "/work?view=now",
  "inbox-category-filter",
  "Everything else",
]) {
  assert.ok(homeSource.includes(marker), `admin home missing marker ${marker}`);
}
for (const marker of ["data-attention-id", "data-entity-id"]) {
  assert.ok(
    attentionRowSource.includes(marker),
    `admin attention row missing marker ${marker}`,
  );
}
assert.ok(
  layoutSource.includes('import "../styles/admin-canvas.css"'),
  "shared admin layout must load the canonical canvas styles",
);
for (const marker of [
  "SemanticInspector",
  "semanticReferences",
  "inbox.source",
]) {
  assert.ok(
    homeSource.includes(marker),
    `canonical admin canvas missing semantic marker ${marker}`,
  );
}
for (const marker of [
  "item.references.owner",
  "item.references.source_time",
  "item.references.proof",
  "item.references.action",
]) {
  assert.ok(
    attentionRowSource.includes(marker),
    `admin attention card missing typed reference ${marker}`,
  );
}
for (const marker of [
  "calendar_event",
  "source_time",
  "providerDestination",
  "isSafeProviderHref",
  "source not checked",
  "checked · no value found",
]) {
  assert.ok(
    semanticReferenceSource.includes(marker),
    `semantic reference contract missing marker ${marker}`,
  );
}
for (const marker of [
  "data-semantic-inspector",
  "data-semantic-inspector-panel",
  "showModal",
  "data-semantic-close",
]) {
  assert.ok(
    semanticInspectorSource.includes(marker),
    `semantic inspector missing marker ${marker}`,
  );
}

for (const marker of ["data-knowledge-card", "/knowledge?kind="]) {
  assert.ok(
    knowledgeSource.includes(marker),
    `admin knowledge missing marker ${marker}`,
  );
}
assert.equal(
  knowledgeSource.includes("data-knowledge-search"),
  false,
  "Knowledge must use the one global search instead of a local search category",
);
assert.ok(
  navSource.includes('href: "/knowledge/locations"'),
  "Knowledge must expose the source-backed Locations view",
);
for (const marker of [
  "Fleet map",
  "viewing from",
  "runtime.machine",
  "Known places",
]) {
  assert.ok(
    locationsSource.includes(marker),
    `admin locations missing marker ${marker}`,
  );
}

for (const marker of [
  "data-work-now",
  "Currently working",
  "Last verified work",
  "OperatorWorkTable",
  "view=projects",
  "view=history",
  "Loose conversations",
  "preserved",
]) {
  assert.ok(workSource.includes(marker), `admin work missing marker ${marker}`);
}
assert.ok(
  operatorWorkTableSource.includes("data-semantic-open"),
  "admin work table must use the shared semantic inspector",
);
for (const marker of [
  "019f7fb8-69b7-7791-8e67-87c87acfae02",
  "019f95c5-be35-7991-811c-371611daa94b",
  "019f99d2-90a1-7761-8582-17b7037c748b",
  "searchable_history_disposition",
]) {
  assert.ok(
    devOperatorWorkSource.includes(marker),
    `operator work fixture missing marker ${marker}`,
  );
}

for (const marker of [
  'readPersonalContext({ method: "status" })',
  "private, no-store",
  "LifeWorkspace",
]) {
  assert.ok(
    lifeSource.includes(marker),
    `admin life missing boundary ${marker}`,
  );
}
const lifeWorkspaceSource = readFileSync(
  "apps/admin/src/components/life/LifeWorkspace.tsx",
  "utf8",
);
for (const path of [
  "/life/health",
  "/life/aesthetics",
  "/knowledge",
  "/knowledge/locations",
]) {
  assert.ok(
    lifeWorkspaceSource.includes(path),
    `Life compatibility link missing ${path}`,
  );
}
const lifeSectionSource = readFileSync(
  "apps/admin/src/pages/life/[section].astro",
  "utf8",
);
assert.ok(lifeSectionSource.includes("isLifeSection(section)"));
assert.ok(
  lifeSectionSource.indexOf("isLifeSection(section)") <
    lifeSectionSource.indexOf("readPersonalContext(lifeSectionRead(section))"),
);
assert.ok(lifeSectionSource.includes("private, no-store"));
assert.ok(
  healthSource.includes("does not infer tasks"),
  "health must remain status only",
);
assert.ok(
  aestheticsSource.includes('<LifeSupportingView section="aesthetics" />'),
  "aesthetics must use the presentation-only supporting view without data props",
);
const lifeSupportingSource = readFileSync(
  "apps/admin/src/components/life/LifeSupportingView.tsx",
  "utf8",
);
for (const source of [aestheticsSource, lifeSupportingSource]) {
  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|from\s+["'][^"']*\/data\/|type=["']file["']|onDrop\s*=|onPaste\s*=/,
    "aesthetics presentation must not add a data reader or image-ingestion control",
  );
}

for (const removedNarration of [
  "source → entity → outcome → attention → history",
  "adapter writes and native archive actions are disconnected",
  "sanitized metadata, lineage, proofs, freshness, and receipts",
]) {
  assert.equal(
    homeSource.includes(removedNarration),
    false,
    `admin home must demote ${removedNarration}`,
  );
}

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
  "loadAdminControlSnapshot",
  "control.projections.inbox_items",
  "rankInboxItems",
  "copy_text",
]) {
  assert.ok(
    inboxDataSource.includes(marker),
    `admin inbox adapter missing marker ${marker}`,
  );
}
assert.equal(
  inboxDataSource.includes('from "./needs"'),
  false,
  "admin inbox must not import the retired static action queue",
);
assert.equal(
  homeSource.includes("/needs-ani"),
  false,
  "canonical inbox must not restore the retired needs-Ani route",
);

for (const marker of [
  "BrandMark",
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
