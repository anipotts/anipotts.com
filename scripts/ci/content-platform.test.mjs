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
  DEFAULT_CMS_PROJECTS,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_SYSTEMS_CONTENT,
  normalizeHomepageContent,
  normalizeSystemsPageContent,
  segmentHomepageSummaryParagraph,
  validateSystemsPageContent,
} from "../../packages/content/dist/index.js";

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

const homepageSource = readFileSync(
  "apps/www/src/components/HomePage.astro",
  "utf8",
);
assert.ok(
  readFileSync("apps/www/src/pages/index.astro", "utf8").includes("<HomePage"),
);
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

const prettierIgnore = readFileSync(".prettierignore", "utf8");
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

assert.equal(
  DEFAULT_CMS_PROJECTS.find(
    (project) => project.slug === "pgi-research-platform",
  )?.story.length,
  4,
  "structured project story arrays must survive generation intact",
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
    readFileSync("content/public/projects/agents.md", "utf8")
      .replace(/^---\n/, "---\nslug: route-name\n")
      .replace("detail_path: /work/agents", "detail_path: /work/route-name"),
  );
  execFileSync(
    process.execPath,
    [resolve("scripts/content/generate-public-content.mjs")],
    { cwd: alternateSlugRoot, stdio: "ignore" },
  );
  const alternateGenerated = readFileSync(
    join(alternateSlugRoot, "packages/content/src/public/generated.ts"),
    "utf8",
  );
  assert.match(
    alternateGenerated,
    /slug: "route-name",[\s\S]*?detail_path: "\/work\/route-name"/,
    "a frontmatter slug must name the generated record and its route",
  );
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
    validAlternate.replaceAll("route-name", "agents"),
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
      "import('@anipotts/content/public').then((mod) => process.stdout.write(typeof mod.normalizeHomepageContent))",
    ],
    { cwd: "apps/admin", encoding: "utf8" },
  ),
  "function",
  "apps/admin must be able to import @anipotts/content/public from the built package export",
);
