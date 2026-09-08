import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_CMS_PROJECTS,
  DEFAULT_WORK_INDEX_CONTENT,
  normalizeCmsProject,
  validateCmsProject,
  validateListingPageContent,
} from "../../packages/content/dist/public/index.js";
import { PUBLIC_SMOKE_ROUTES } from "./public-route-inventory.mjs";

assert.equal(DEFAULT_WORK_INDEX_CONTENT.hero_title, "work");
assert.deepEqual(validateListingPageContent(DEFAULT_WORK_INDEX_CONTENT), {
  ok: true,
});
const record = DEFAULT_CMS_PROJECTS.find(
  (project) => project.kind === "project",
);
const legacy = normalizeCmsProject({
  ...record,
  homepage_placement: "making",
  detail_path: `/projects/${record.slug}`,
});
assert.equal(legacy.homepage_placement, "work");
assert.equal(legacy.detail_path, `/work/${record.slug}`);
assert.equal(validateCmsProject(legacy).ok, true);
assert.equal(
  validateCmsProject({ ...legacy, detail_path: "/work/../private" }).ok,
  false,
);
const visible = DEFAULT_CMS_PROJECTS.filter(
  (project) => project.public_state !== "hidden",
);
assert.deepEqual(
  PUBLIC_SMOKE_ROUTES.filter((route) => route.startsWith("/work/")).sort(),
  visible.map((project) => project.detail_path).sort(),
);
const projection = JSON.parse(
  readFileSync("packages/content/generated/admin-public-content.json", "utf8"),
);
const workPage = projection.records.find(
  (record) => record.entity_id === "public-page:making",
);
assert.equal(workPage.route, "/work");
assert.equal(workPage.source_ref, "content/public/pages/work.md");
const middleware = readFileSync("apps/www/src/middleware.ts", "utf8");
for (const from of ["making", "projects", "shipping", "running"])
  assert.ok(middleware.includes(`"/${from}": "/work"`));
assert.ok(!middleware.includes('"/work": "/making"'));
assert.ok(middleware.includes("`${to}${search}`"));
const route = readFileSync("apps/www/src/pages/work/[slug].astro", "utf8");
// Missing/hidden 404 behavior is exercised against the built worker by
// public-built-output.test.mjs; detail routes now enumerate only public entries.
assert.ok(route.includes("getStaticPaths"));
assert.ok(route.includes("await visibleProjects()"));
assert.ok(!route.includes("Astro.redirect"));
console.log(
  "work migration: legacy inputs, stable IDs, hidden records, smoke coverage passed",
);
