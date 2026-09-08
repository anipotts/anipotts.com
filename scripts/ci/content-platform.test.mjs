#!/usr/bin/env node

import assert from "node:assert/strict";
import "./work-migration.test.mjs";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildPasskeyProofItems,
  countProofEntries,
  contentInventorySource,
  disabledRuntimeOverlayResponse,
  expectedPasskeyTables,
  manualPasskeyEnrollmentSequence,
  missingRequiredPasskeyAuditEvents,
  nextPasskeyProofAction,
  nextPasskeyStatusAction,
  passkeyAccessRemovalBlockers,
  passkeyMissingProofItems,
  proofSource,
  readProofEntries,
  REQUIRED_PASSKEY_AUDIT_EVENTS,
  RUNTIME_FEED_PATH,
  runtimeOverlayErrorResponse,
  runtimeOverlayResponseFromFeed,
  sourceContentRecordsFromProjection,
  summarizeSourceContentRecords,
} from "../../packages/content/dist/admin/index.js";
import {
  contentOperationTables,
  contentOperationTemplates,
} from "../../packages/content/dist/admin/operations.js";
import {
  contentInventorySource as rootContentInventorySource,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_SYSTEMS_CONTENT,
  normalizeHomepageContent,
  normalizeSystemsPageContent,
  segmentHomepageSummaryParagraph,
  validateSystemsPageContent,
} from "../../packages/content/dist/index.js";

const EXPECTED_OPERATION_IDS = [
  "content-draft-homepage-summary-2026-06-28",
  "content-draft-making-index-copy-2026-06-29",
  "content-draft-newsletter-archive-copy-2026-06-29",
  "content-draft-newsletter-copy-2026-06-28",
  "content-draft-orchestrating-hero-copy-2026-06-29",
  "content-draft-project-card-fields-2026-06-28",
  "content-draft-project-chainedchat-detail-2026-06-29",
  "content-draft-project-claude-code-tips-detail-2026-06-29",
  "content-draft-project-habittracker-obh-detail-2026-06-29",
  "content-draft-project-imessage-mcp-detail-2026-06-29",
  "content-draft-project-nyu-purity-test-detail-2026-06-29",
  "content-draft-project-options-pricing-sensitivity-detail-2026-06-29",
  "content-draft-project-pgi-research-platform-detail-2026-06-29",
  "content-draft-project-quantercise-detail-2026-06-29",
  "content-draft-project-quantercise-extension-detail-2026-06-29",
  "content-draft-project-saeshify-detail-2026-06-29",
  "content-draft-projects-index-copy-2026-06-29",
  "content-draft-writing-i-built-a-monitor-for-my-claude-code-sessions-detail-2026-06-29",
  "content-draft-writing-index-copy-2026-06-29",
  "content-draft-writing-jpegmafia-is-our-kanye-west-detail-2026-06-29",
  "content-draft-writing-newsletter-backfill-2026-06-28",
  "content-draft-writing-saturdays-detail-2026-06-29",
  "content-draft-writing-search-will-be-dead-by-2030-detail-2026-06-29",
  "content-draft-writing-stop-ending-your-day-with-fix-the-bug-detail-2026-06-29",
];

const UNSAFE_ALLOWED_ACTIONS = new Set([
  "save",
  "publish",
  "send",
  "schedule",
  "deploy",
  "rewrite_source",
  "rewrite_markdown",
  "sync_provider",
  "sync_external",
]);

assert.equal(
  DEFAULT_HOMEPAGE_CONTENT.sections.intro.paragraphs,
  undefined,
  "canonical homepage content must not duplicate the intro as paragraph rows",
);
assert.deepEqual(DEFAULT_HOMEPAGE_CONTENT.sections.intro.mention_keys, [
  "structuredAi",
  "yCombinatorF25",
  "badHabit",
  "atlanticRecords",
  "businessInsider",
]);
assert.equal(
  DEFAULT_HOMEPAGE_CONTENT.sections.intro.rich_summary,
  undefined,
  "canonical homepage content must not duplicate prose as rich segments",
);

const homepageMentionFixture = {
  build: { label: "build", href: "/work" },
  agent: { label: "agent", href: "/systems" },
  agents: { label: "agents", href: "/systems" },
  businessInsider: { label: "business insider", href: "/writing" },
};
assert.deepEqual(
  segmentHomepageSummaryParagraph(
    "İ Business Insider covers agents building.",
    ["build", "agent", "agents", "businessInsider"],
    homepageMentionFixture,
  ),
  [
    { kind: "text", text: "İ " },
    {
      kind: "mention",
      key: "businessInsider",
      text: "Business Insider",
    },
    { kind: "text", text: " covers " },
    { kind: "mention", key: "agents", text: "agents" },
    { kind: "text", text: " building." },
  ],
  "homepage summary segmentation must preserve casing, longest matches, and word boundaries",
);

const homepageSource = readFileSync("apps/www/src/pages/index.astro", "utf8");
const inlineMentionSource = readFileSync(
  "apps/www/src/components/InlineMention.astro",
  "utf8",
);
const writingIndexSource = readFileSync(
  "apps/www/src/pages/writing/index.astro",
  "utf8",
);
assert.ok(homepageSource.includes("<HomepageRichSummary"));
assert.equal(
  homepageSource.includes("HomepageContextRail"),
  false,
  "homepage context must remain embedded in the canonical intro prose",
);
assert.equal(
  homepageSource.includes("hero-sentence"),
  false,
  "homepage intro must wrap as one semantic paragraph without forced sentence blocks",
);
assert.ok(
  inlineMentionSource.includes('width="24"') &&
    inlineMentionSource.includes('height="24"'),
  "inline brand images must reserve intrinsic space before loading",
);
assert.equal(
  inlineMentionSource.includes("inline-flex"),
  false,
  "inline mentions must not reintroduce the replaced-element baseline bug",
);
assert.equal(
  writingIndexSource.includes('id="writing-search"') ||
    writingIndexSource.includes('id="writing-result-template"'),
  false,
  "the small writing index must not carry a redundant client-side search UI",
);

assert.deepEqual(
  REQUIRED_PASSKEY_AUDIT_EVENTS,
  [
    "passkey.credential.registered",
    "passkey.session.created",
    "passkey.session.revoked",
    "passkey.credential.revoked",
    "passkey.authentication.denied",
  ],
  "passkey audit events must stay stable for Access removal proof",
);
assert.deepEqual(
  expectedPasskeyTables,
  [
    "admin_passkey_audit",
    "admin_passkey_challenges",
    "admin_passkey_credentials",
    "admin_passkey_sessions",
  ],
  "passkey proof must check every required D1 table",
);
assert.equal(manualPasskeyEnrollmentSequence.length, 7);

const passkeyAuditEvents = {
  "passkey.credential.registered": 1,
  "passkey.session.created": 1,
  "passkey.session.revoked": 0,
  "passkey.credential.revoked": 0,
  "passkey.authentication.denied": 0,
};
assert.deepEqual(missingRequiredPasskeyAuditEvents(passkeyAuditEvents), [
  "passkey.session.revoked",
  "passkey.credential.revoked",
  "passkey.authentication.denied",
]);
assert.deepEqual(
  passkeyAccessRemovalBlockers({
    credentialCount: 1,
    sessionCount: 1,
    auditEvents: passkeyAuditEvents,
  }),
  [
    "passkey.session.revoked",
    "passkey.credential.revoked",
    "passkey.authentication.denied",
  ],
);
assert.deepEqual(
  passkeyAccessRemovalBlockers({
    schemaReady: false,
    credentialCount: 0,
    sessionCount: 0,
    auditEvents: {},
  }),
  [
    "schema_ready",
    "active_credential",
    "active_session",
    ...REQUIRED_PASSKEY_AUDIT_EVENTS,
  ],
);
assert.deepEqual(
  passkeyMissingProofItems({
    accessRemovalBlockers: ["active_credential"],
    routeBoundary: "unknown",
  }),
  ["active_credential", "app_native_route_boundary"],
);
assert.equal(
  nextPasskeyProofAction({
    credentialCount: 0,
    sessionCount: 0,
    missingAuditEvents: REQUIRED_PASSKEY_AUDIT_EVENTS,
  }),
  "open /auth/passkey behind Cloudflare Access and register the first platform passkey",
);
assert.equal(
  nextPasskeyProofAction({
    credentialCount: 1,
    sessionCount: 1,
    missingAuditEvents: [],
    routeBoundary: "cloudflare_access",
  }),
  "passkey proof is staged; remove Cloudflare Access and rerun this proof",
);
assert.equal(
  nextPasskeyStatusAction({
    hasSession: false,
    credentialCount: 0,
    accessIdentityVerified: true,
  }),
  "register the first passkey with verified Cloudflare Access identity",
);
assert.deepEqual(
  buildPasskeyProofItems(1, true, passkeyAuditEvents).map((item) => [
    item.id,
    item.complete,
  ]),
  [
    ["active_credential", true],
    ["active_session", true],
    ["passkey.credential.registered", true],
    ["passkey.session.created", true],
    ["passkey.session.revoked", false],
    ["passkey.credential.revoked", false],
    ["passkey.authentication.denied", false],
  ],
);

const passkeyProofScript = readFileSync(
  "scripts/admin/passkey-proof.mjs",
  "utf8",
);
assert.ok(passkeyProofScript.includes("REQUIRED_PASSKEY_AUDIT_EVENTS"));
assert.ok(passkeyProofScript.includes("expectedPasskeyTables"));
assert.equal(passkeyProofScript.includes("const REQUIRED_AUDIT_EVENTS"), false);
assert.equal(passkeyProofScript.includes("function nextSafeAction"), false);

const passkeyAuthSource = readFileSync(
  "apps/admin/src/lib/passkey-auth.ts",
  "utf8",
);
assert.ok(
  passkeyAuthSource.includes("ON CONFLICT(credential_id) DO UPDATE SET"),
  "passkey registration must support re-registering a revoked platform credential",
);
assert.ok(
  passkeyAuthSource.includes("revoked_at = NULL"),
  "passkey replacement registration must reactivate a previously revoked credential",
);

const contentEditorSource = readFileSync(
  "apps/admin/src/lib/content-editor.ts",
  "utf8",
);
const sourceContentModule = readFileSync(
  "apps/admin/src/data/source-content.ts",
  "utf8",
);
const prettierIgnore = readFileSync(".prettierignore", "utf8");
const adminContentInventory = readFileSync(
  "packages/content/src/admin/content.ts",
  "utf8",
);
assert.ok(
  sourceContentModule.includes(
    "packages/content/generated/admin-public-content.json",
  ),
  "Admin inventory must consume the canonical generated projection",
);
assert.equal(
  sourceContentModule.includes("import.meta.glob"),
  false,
  "Admin must not parse canonical Markdown through a second runtime path",
);
assert.equal(
  sourceContentModule.includes("../../../www/src/content/"),
  false,
  "Admin must not read the removed public content collections",
);
assert.match(
  prettierIgnore,
  /^content\/public\/$/m,
  "canonical public Markdown must remain byte-stable during formatting",
);
assert.doesNotMatch(
  prettierIgnore,
  /^apps\/www\/src\/content\/$/m,
  "Prettier must not retain the removed public content path",
);
assert.match(
  adminContentInventory,
  /content\/public\/pages\/newsletter_archive\.md/,
  "Admin newsletter inventory must reference the canonical filename",
);

const generatedAdminProjection = JSON.parse(
  readFileSync("packages/content/generated/admin-public-content.json", "utf8"),
);
const pgiStoryField = generatedAdminProjection.source_records
  .find((record) => record.slug === "pgi-research-platform")
  ?.fields.find((field) => field.path === "story");
assert.equal(pgiStoryField?.kind, "array");
assert.equal(
  JSON.parse(pgiStoryField?.value ?? "[]").length,
  4,
  "structured project story arrays must remain reviewable in the Admin projection",
);

const projectDetailSource = readFileSync(
  "apps/www/src/components/WorkDetail.astro",
  "utf8",
);
const projectMediaSource = readFileSync(
  "apps/www/src/components/ProjectMediaStage.astro",
  "utf8",
);
assert.match(
  projectDetailSource,
  /<ProjectMediaStage\s+items=\{\[d\.preview_media\]\}/,
  "the hero must show only the canonical preview, not repeat all story media",
);
assert.match(
  projectDetailSource,
  /<ProjectMediaStage\s+items=\{\[section\.media\]\}/,
  "story media must reach the shared viewer intact with its source, alt text, caption, and fit",
);
const projectMediaImageRule = projectMediaSource.match(
  /\.project-media__panel img,\s*\.project-media__panel video\s*\{([^}]+)\}/,
)?.[1];
assert.ok(
  projectMediaImageRule,
  "project images and videos need a shared size rule",
);
assert.match(
  projectMediaImageRule,
  /width:\s*100%;[\s\S]*height:\s*auto;/,
  "project screenshots and videos must retain their intrinsic proportions",
);
assert.doesNotMatch(
  projectMediaSource,
  /aspect-ratio:\s*16\s*\/\s*9|object-fit:\s*cover/,
  "project media must remain uncropped, including canonical contain-fit media",
);
assert.match(
  projectMediaSource,
  /<a\s+class="project-media__enlarge"\s+href=\{item\.src\}[\s\S]*?aria-label=\{`enlarge image: \$\{item\.alt\}`\}/,
  "image enlargement must retain an accessible original-file link without JavaScript",
);
assert.match(
  projectMediaSource,
  /<img\s+src=\{item\.src\}\s+alt=\{item\.alt\}/,
  "the shared viewer must preserve canonical image sources and alternative text",
);
assert.match(
  projectMediaSource,
  /typeof dialog\.showModal !== "function"\) return;\s*event\.preventDefault\(\);/,
  "native enlargement must progressively enhance the original-file link",
);

const alternateSlugRoot = mkdtempSync(join(tmpdir(), "public-content-slug-"));
try {
  cpSync("content/public", join(alternateSlugRoot, "content/public"), {
    recursive: true,
  });
  mkdirSync(join(alternateSlugRoot, "content/public/projects"), {
    recursive: true,
  });
  writeFileSync(
    join(alternateSlugRoot, "content/public/projects/source-name.md"),
    readFileSync("content/public/projects/claude-code-tips.md", "utf8")
      .replace(/^---\n/, "---\nslug: route-name\n")
      .replace(
        "detail_path: /work/claude-code-tips",
        "detail_path: /work/route-name",
      ),
  );
  execFileSync(
    process.execPath,
    [resolve("scripts/content/generate-public-content.mjs")],
    { cwd: alternateSlugRoot, stdio: "ignore" },
  );
  const alternateAdminProjection = JSON.parse(
    readFileSync(
      join(
        alternateSlugRoot,
        "packages/content/generated/admin-public-content.json",
      ),
      "utf8",
    ),
  );
  const expectedSource = "content/public/projects/source-name.md";
  const projected = alternateAdminProjection.records.find(
    (record) => record.entity_id === "public-project:route-name",
  );
  assert.equal(projected.source_ref, expectedSource);
  assert.match(projected.source_hash, /^[a-f0-9]{64}$/);
  const alternateFile = join(
    alternateSlugRoot,
    "content/public/projects/source-name.md",
  );
  const validAlternate = readFileSync(alternateFile, "utf8");
  for (const invalid of [
    validAlternate.replace("slug: route-name", "slug: bad/route"),
    validAlternate.replace(
      "detail_path: /work/route-name",
      "detail_path: /work/wrong-route",
    ),
    validAlternate.replaceAll("route-name", "claude-code-tips"),
  ]) {
    writeFileSync(alternateFile, invalid);
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [resolve("scripts/content/generate-public-content.mjs")],
          { cwd: alternateSlugRoot, stdio: "ignore" },
        ),
      "invalid or duplicate public routes must stop generation",
    );
  }
} finally {
  rmSync(alternateSlugRoot, { recursive: true, force: true });
}
assert.ok(
  contentEditorSource.includes("publish_batch_required"),
  "content editor publish must fail closed when D1 batch semantics are unavailable",
);
assert.equal(
  contentEditorSource.includes("runSequentialPublish"),
  false,
  "content editor publish must not fall back to sequential public writes",
);
assert.ok(
  contentEditorSource.includes("content_publish_events"),
  "content editor publish must keep explicit publish proof writes",
);

const disabledRuntime = disabledRuntimeOverlayResponse();
assert.equal(disabledRuntime.mode, "disabled");
assert.equal(disabledRuntime.available, false);
assert.equal(disabledRuntime.source_path, RUNTIME_FEED_PATH);
assert.deepEqual(disabledRuntime.overlays, []);

const runtimeOverlay = runtimeOverlayResponseFromFeed({
  generated_at: "2026-06-29T12:00:00Z",
  machine: "ap-mini.local",
  runtime: {
    repo_state_overlays: [
      {
        ahead: 0,
        behind: 1,
        branch: "main",
        deploy_impact: "none",
        dirty_tracked_count: 0,
        git_available: true,
        head_sha: "abc1234",
        live_runtime_role: "public site source",
        machine: "ap-mini.local",
        notes: "metadata only",
        repo: "anipotts-com",
        repo_root_label: "~/Code/projects/anipotts-com",
        repo_state_id: "runtime.repo.site.local",
        untracked_count: 2,
        upstream: "origin/main",
        upstream_sha: "abc1234",
      },
      {
        ahead: null,
        behind: null,
        branch: null,
        deploy_impact: "future-unknown",
        dirty_tracked_count: null,
        git_available: false,
        head_sha: null,
        live_runtime_role: "runtime data tree",
        machine: "ap-mini.local",
        notes: "non-git runtime tree",
        repo: "vitals",
        repo_root_label: "~/Code/projects/vitals",
        repo_state_id: "runtime.repo.vitals.local",
        untracked_count: null,
        upstream: null,
        upstream_sha: null,
      },
      {
        repo_state_id: "invalid-overlay",
        repo: "missing required fields",
      },
    ],
    safety: {
      dirty_filenames_included: false,
      file_contents_included: false,
      health_payloads_included: false,
      mode: "read_only_metadata",
      secret_values_included: false,
    },
  },
});

assert.equal(runtimeOverlay.mode, "local_dev");
assert.equal(runtimeOverlay.available, true);
assert.equal(runtimeOverlay.generated_at, "2026-06-29T12:00:00Z");
assert.equal(runtimeOverlay.machine, "ap-mini.local");
assert.equal(runtimeOverlay.safety?.mode, "read_only_metadata");
assert.equal(runtimeOverlay.safety?.secret_values_included, false);
assert.equal(runtimeOverlay.safety?.file_contents_included, false);
assert.equal(runtimeOverlay.overlays.length, 2);
assert.equal(runtimeOverlay.overlays[0]?.repo, "anipotts-com");
assert.equal(runtimeOverlay.overlays[0]?.behind, 1);
assert.equal(runtimeOverlay.overlays[1]?.deploy_impact, "unknown");

const missingRuntime = runtimeOverlayErrorResponse(
  Object.assign(new Error("missing feed"), { code: "ENOENT" }),
);
assert.equal(missingRuntime.mode, "missing");
assert.equal(missingRuntime.available, false);
assert.equal(missingRuntime.error, "missing feed");

const failedRuntime = runtimeOverlayErrorResponse(new Error("bad json"));
assert.equal(failedRuntime.mode, "error");
assert.equal(failedRuntime.error, "bad json");

const sourceRecords = sourceContentRecordsFromProjection([
  {
    id: "projects.hidden-lab",
    surface: "projects",
    slug: "hidden-lab",
    title: "Hidden Lab",
    route: "/work/hidden-lab",
    status: "hidden",
    source_ref: "content/public/projects/hidden-lab.md",
    summary: "Internal project page",
    body_words: 0,
    body_state: "frontmatter only",
    body_section_count: 0,
    body_preview: "no markdown body yet",
    fields: [{ path: "visible", value: "false", kind: "boolean" }],
    next_safe_action: "review project source",
  },
  {
    id: "writing.control-plane",
    surface: "writing",
    slug: "control-plane",
    title: "Control Plane",
    route: "/writing/control-plane",
    status: "published",
    source_ref: "content/public/writing/control-plane.md",
    summary: "Agents need authority, proof, and state.",
    body_words: 17,
    body_state: "short body",
    body_section_count: 1,
    body_preview:
      "## opening The admin app should render source-backed writing as a preview before any publish or send path exists.",
    fields: [{ path: "tags", value: "agents, admin", kind: "array" }],
    next_safe_action: "review writing source",
  },
]);

assert.deepEqual(
  summarizeSourceContentRecords(sourceRecords),
  {
    projects: 1,
    writing: 1,
    published_writing: 1,
    visible_projects: 0,
  },
  "generated source content projection must preserve admin summary counts",
);

const hiddenProject = sourceRecords.find(
  (record) => record.id === "projects.hidden-lab",
);
assert.ok(hiddenProject, "hidden project source record must be projected");
assert.equal(hiddenProject.status, "hidden");
assert.equal(hiddenProject.source_ref, "content/public/projects/hidden-lab.md");
assert.equal(hiddenProject.body_state, "frontmatter only");
assert.equal(hiddenProject.body_preview, "no markdown body yet");

const writingRecord = sourceRecords.find(
  (record) => record.id === "writing.control-plane",
);
assert.ok(writingRecord, "writing source record must be projected");
assert.equal(writingRecord.status, "published");
assert.equal(writingRecord.body_section_count, 1);
assert.ok(
  writingRecord.fields.some(
    (field) => field.path === "tags" && field.value === "agents, admin",
  ),
  "generated source content projection must preserve list frontmatter fields",
);
assert.ok(
  writingRecord.body_preview.includes("admin app should render source-backed"),
  "generated source content projection must expose a markdown body preview",
);

assert.throws(
  () => sourceContentRecordsFromProjection([{ surface: "invalid" }]),
  /surface is invalid/,
  "invalid generated source records must fail closed",
);

assert.equal(contentInventorySource.mode, "canonical_source_plus_d1_drafts");
assert.equal(
  rootContentInventorySource.mode,
  "canonical_source_plus_d1_drafts",
);

const systemsContent = normalizeSystemsPageContent({});
assert.deepEqual(validateSystemsPageContent(systemsContent), { ok: true });
assert.equal("lifecycle" in systemsContent, false);
assert.equal("map_nodes" in systemsContent, false);
const lifecyclePage = readFileSync("apps/www/src/pages/systems.astro", "utf8");
assert.ok(lifecyclePage.includes("workflow={content.workflow}"));
assert.equal(lifecyclePage.includes("content.lifecycle"), false);
assert.deepEqual(
  validateSystemsPageContent({ ...systemsContent, lifecycle: null }),
  { ok: true },
  "experimental lifecycle does not constrain public workflow",
);
const workflow = systemsContent.workflow;
assert.equal(
  workflow.outro,
  "this is how i direct traces of context that my agents can use to better drive work forward, leaving me with way more time for the work i care about and people that are important",
);
assert.equal(workflow.intro.split(/\n\s*\n/).filter(Boolean).length, 2);
assert.ok(
  lifecyclePage.indexOf("content.workflow.outro") >
    lifecyclePage.indexOf("<SystemMap"),
  "closing copy follows the map",
);
const { outro: omittedOutro, ...workflowWithoutOutro } = workflow;
assert.equal(
  validateSystemsPageContent({
    ...systemsContent,
    workflow: normalizeSystemsPageContent({ workflow: workflowWithoutOutro })
      .workflow,
  }).ok,
  true,
  "legacy records remain valid without closing copy",
);
assert.equal(workflow.steps.length, 4);
assert.deepEqual(workflow.sources, [
  "messages",
  "gmail",
  "calendar",
  "notes",
  "youtube",
  "spotify",
  "x",
  "instagram",
  "whatsapp",
  "chrome",
  "linkedin",
  "granola",
  "mercury",
  "stripe",
]);
assert.deepEqual(
  workflow.steps.map((step) => step.marks),
  [
    ["mac-mini", "github", "linear"],
    ["tailscale", "1password", "obsidian"],
    ["codex", "claude"],
    ["github", "linear"],
  ],
);
const legacyWorkflow = { ...workflow };
delete legacyWorkflow.sources;
legacyWorkflow.steps = workflow.steps.map(({ marks, ...step }) => step);
assert.deepEqual(
  normalizeSystemsPageContent({ workflow: legacyWorkflow }).workflow,
  workflow,
);
assert.equal(
  validateSystemsPageContent(
    normalizeSystemsPageContent({
      workflow: { ...workflow, steps: [null, ...workflow.steps.slice(1)] },
    }),
  ).ok,
  false,
  "malformed legacy steps fail validation without crashing normalization",
);
assert.deepEqual(
  normalizeSystemsPageContent({ workflow: JSON.stringify(workflow) }).workflow,
  workflow,
);
for (const invalid of [
  { ...workflow, steps: workflow.steps.slice(1) },
  {
    ...workflow,
    steps: [workflow.steps[0], workflow.steps[0], ...workflow.steps.slice(2)],
  },
  { ...workflow, intro: "" },
  { ...workflow, outro: 123 },
  { ...workflow, outro: "" },
  { ...workflow, sources: ["unknown-provider"] },
  {
    ...workflow,
    steps: workflow.steps.map((step) => ({
      ...step,
      marks: ["https://untrusted.example/logo.svg"],
    })),
  },
])
  assert.equal(
    validateSystemsPageContent({ ...systemsContent, workflow: invalid }).ok,
    false,
  );
assert.equal(
  validateSystemsPageContent(
    normalizeSystemsPageContent({ workflow: "{broken" }),
  ).ok,
  false,
);
const workflowComponent = readFileSync(
  "apps/www/src/components/SystemMap.astro",
  "utf8",
);
assert.equal(
  /\.step p\s*\{[^}]*max-width/s.test(workflowComponent),
  false,
  "step descriptions use available width in stacked and desktop layouts",
);
assert.ok(
  workflowComponent.includes("workflow.sources.map"),
  "sources must render without JavaScript",
);
assert.ok(
  workflowComponent.includes("workflow.steps.map"),
  "all steps must render without JavaScript",
);
assert.ok(
  /data-motion-toggle\s+hidden/.test(workflowComponent),
  "controls are progressively enhanced",
);
assert.equal(
  /source-heading|data-event|event-layer/.test(workflowComponent),
  false,
  "no event heading or travelling marker",
);
const workflowAnimation = readFileSync(
  "apps/www/src/scripts/workflow-animation.ts",
  "utf8",
);
assert.equal(
  /pointerenter|pointerleave|focusin|focusout|data-event/.test(
    workflowAnimation,
  ),
  false,
  "hover and focus never stop the marquee and event simulation is removed",
);
execFileSync(
  process.execPath,
  ["--experimental-strip-types", "scripts/ci/workflow-motion.test.mjs"],
  { stdio: "inherit" },
);
for (const required of [
  "prefers-reduced-motion",
  "astro:before-swap",
  "ResizeObserver",
  "IntersectionObserver",
  "visibilitychange",
  "aria-hidden",
  "listeners.abort()",
])
  assert.ok(
    workflowAnimation.includes(required),
    `animation needs ${required}`,
  );
assert.equal(
  /fetch\(|WebSocket|EventSource/.test(workflowAnimation),
  false,
  "diagram has no live data connection",
);
assert.equal(
  lifecyclePage.includes("content.map_"),
  false,
  "public lifecycle must not depend on the experimental topology",
);

assert.equal(
  execFileSync(
    process.execPath,
    [
      "-e",
      "import('@anipotts/content/admin').then((mod) => process.stdout.write(mod.contentInventorySource.mode))",
    ],
    { cwd: "apps/admin", encoding: "utf8" },
  ),
  "canonical_source_plus_d1_drafts",
  "apps/admin must be able to import @anipotts/content/admin from the built package export",
);

assert.equal(proofSource.mode, "read_only_d1_plus_runtime_metadata");
assert.equal(proofSource.live_writes, "draft_save_proof_only");

const proofEntriesWithoutDb = await readProofEntries(undefined);
assert.deepEqual(
  countProofEntries(proofEntriesWithoutDb),
  {
    total: 7,
    verified: 4,
    blocked: 1,
    pending: 2,
  },
  "proof exports must preserve read-only fallback status without an app D1 binding",
);
assert.ok(
  proofEntriesWithoutDb.some(
    (entry) =>
      entry.id === "proof.admin.content-draft-save" &&
      entry.status === "pending" &&
      entry.next_safe_action.includes("save one draft operation"),
  ),
  "proof fallback must expose the draft-save proof gate before first save",
);
assert.ok(
  proofEntriesWithoutDb.some(
    (entry) =>
      entry.id === "proof.admin.passkey-enrollment" &&
      entry.status === "blocked" &&
      entry.next_safe_action.includes("DB binding"),
  ),
  "proof fallback must keep Access removal blocked when passkey proof is unavailable",
);

assert.deepEqual(
  contentOperationTemplates.map((operation) => operation.operation_id).sort(),
  EXPECTED_OPERATION_IDS.toSorted(),
  "static content operation fallback must match seeded D1 draft operations",
);

for (const operation of contentOperationTemplates) {
  assert.equal(operation.kind, "content_draft", operation.operation_id);
  assert.equal(operation.status, "previewed", operation.operation_id);
  assert.equal(operation.redaction, "public_copy_only", operation.operation_id);
  assert.ok(
    operation.preview_targets.includes("/content/preview"),
    `${operation.operation_id} must render through the preview lane`,
  );
  assert.ok(
    operation.forbidden_actions.includes("save"),
    `${operation.operation_id} must block save`,
  );
  assert.ok(
    operation.forbidden_actions.includes("publish"),
    `${operation.operation_id} must block publish`,
  );

  const unsafeAllowed = operation.allowed_actions.filter((action) =>
    UNSAFE_ALLOWED_ACTIONS.has(action),
  );
  assert.deepEqual(
    unsafeAllowed,
    [],
    `${operation.operation_id} must not allow write, send, deploy, or sync actions`,
  );
}

assert.deepEqual(
  contentOperationTables.map((table) => [table.table, table.write_state]),
  [
    ["content_records", "schema_only"],
    ["content_draft_operations", "draft_save_only"],
    ["content_publish_events", "publish_with_proof"],
  ],
  "content operation tables must preserve selected-draft publish posture",
);
