import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const adminSource = join(root, "apps/admin/src");
const productionFiles = collect(adminSource).filter(
  (file) =>
    !file.endsWith(".test.ts") &&
    !file.endsWith(".test.tsx") &&
    !file.endsWith(".test-fixtures.ts") &&
    !file.includes("/dev-"),
);

// Synthetic and replayed data reach the overview, Data and Observability
// only through lib/shell-fixtures.ts, which loads them dynamically under
// import.meta.env.DEV. No other production module may import a fixture.
const FIXTURE_IMPORT =
  /(?:from\s+|import\s*\(\s*)["'][^"']*(?:\/fixtures\/|dev-review-catalog|\.synthetic(?:\.json)?["'])/;
const shellFixtures = join(adminSource, "lib/shell-fixtures.ts");
const fixtureImporters = productionFiles.filter((file) =>
  FIXTURE_IMPORT.test(readFileSync(file, "utf8")),
);
assert.deepEqual(
  fixtureImporters
    .map((file) => relative(root, file))
    .filter(
      (file) =>
        file !== relative(root, shellFixtures) &&
        // The dev-only component catalog is guarded and checked below.
        file !== "apps/admin/src/dev/dev-catalog.astro",
    ),
  [],
  "only lib/shell-fixtures.ts may load fixture data",
);
assert.ok(
  fixtureImporters.includes(shellFixtures),
  "the fixture import scan must see lib/shell-fixtures.ts",
);
const loader = readFileSync(shellFixtures, "utf8");
assert.match(
  loader,
  /=\s*import\.meta\.env\.DEV\s*\?/,
  "shell-fixtures must choose its loader on import.meta.env.DEV",
);
assert.doesNotMatch(
  loader,
  /^import\s(?!type\b)[^;]*["'](?:node:|\.\.\/fixtures\/)/m,
  "shell-fixtures must not statically import node modules or fixtures",
);
// Everything the loader reads sits inside its DEV branch, so a build drops it.
const devBranch = loader.slice(
  loader.search(/=\s*import\.meta\.env\.DEV\s*\?/),
  loader.search(/:\s*async\s*\(\)\s*=>\s*undefined;\s*$/),
);
for (const fixture of [
  "ops_v1.sample.json",
  "ops_events_v1.synthetic.json",
  "data_v1.synthetic.json",
])
  assert.ok(
    devBranch.includes(`import("../fixtures/${fixture}")`),
    `shell-fixtures must load ${fixture} dynamically inside its DEV branch`,
  );
assert.ok(
  devBranch.includes('await import("node:fs/promises")') &&
    devBranch.includes(".local/replay/"),
  "shell-fixtures must read replay files through a dynamic node:fs import inside its DEV branch",
);
assert.match(
  loader,
  /:\s*async\s*\(\)\s*=>\s*undefined;\s*$/,
  "the production loader must return no fixtures",
);

// A built admin bundle must hold none of it. CI builds before this runs;
// locally the scan covers whatever dist exists.
const dist = join(root, "apps/admin/dist");
let distFiles = 0;
if (existsSync(dist)) {
  const leaks = [
    /ops_v1\.sample/,
    /ops_events_v1\.synthetic/,
    /data_v1\.synthetic/,
    /\.local\/replay/,
    /["']node:fs(?:\/promises)?["']/,
  ];
  for (const file of collectBuilt(dist)) {
    distFiles += 1;
    const text = readFileSync(file, "utf8");
    for (const leak of leaks)
      assert.doesNotMatch(
        text,
        leak,
        `${relative(root, file)} ships development fixture code (${leak})`,
      );
  }
}

const editorialLayout = readFileSync(
  join(adminSource, "layouts/EditorialLayout.astro"),
  "utf8",
);
assert.match(editorialLayout, /Astro\.slots\.has\("default"\)/);
assert.doesNotMatch(
  editorialLayout,
  /Astro\.slots\.render\s*\(/,
  "checking slotted content must not consume nested island hydration before rendering",
);

// The catalog is injected under astro dev only, so a build never compiles it.
assert.equal(
  existsSync(join(adminSource, "pages/content/dev-catalog.astro")),
  false,
  "the component catalog must stay out of the file-routed pages",
);
assert.match(
  readFileSync(join(root, "apps/admin/astro.config.mjs"), "utf8"),
  /if \(command === "dev"\)\s*injectRoute\(\{\s*pattern: "\/content\/dev-catalog"/,
  "the component catalog route must exist only under astro dev",
);
const catalogRoute = readFileSync(
  join(adminSource, "dev/dev-catalog.astro"),
  "utf8",
);
assert.match(catalogRoute, /if \(!import\.meta\.env\.DEV\)\s*\{/);
assert.match(catalogRoute, /return new Response\(null,\s*\{\s*status: 404/);
assert.match(catalogRoute, /inventoryProjection=\{inventoryProjection\}/);
assert.doesNotMatch(catalogRoute, /loadEditorialInventory\s*\(/);
const catalogConsumers = collect(adminSource).filter((file) => {
  if (file.endsWith(".test.tsx")) return false;
  return /from\s+["'][^"']*dev-review-catalog["']/.test(
    readFileSync(file, "utf8"),
  );
});
assert.deepEqual(catalogConsumers, [
  join(adminSource, "dev/dev-catalog.astro"),
]);
const catalogFixture = readFileSync(
  join(adminSource, "components/astryx/dev-review-catalog.tsx"),
  "utf8",
);
assert.doesNotMatch(
  catalogFixture,
  /\b(?:fetch|localStorage|sessionStorage|indexedDB|localDraftStorage)\b/,
  "the review catalog must not call private APIs or persist synthetic drafts",
);

console.log(
  `admin fixture boundary passed for ${productionFiles.length} production modules` +
    (existsSync(dist) ? ` and ${distFiles} built files` : " (no dist built)"),
);

function collectBuilt(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectBuilt(path);
    return [".js", ".mjs", ".html", ".json"].includes(extname(path))
      ? [path]
      : [];
  });
}

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return [".astro", ".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}
