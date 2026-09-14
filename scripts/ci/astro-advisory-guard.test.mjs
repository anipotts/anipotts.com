import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADVISORIES,
  auditAstroAdvisories,
  compareVersions,
} from "./astro-advisory-guard.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const GUARD_CLI = fileURLToPath(
  new URL("./astro-advisory-guard.mjs", import.meta.url),
);
const SECURITY_REVIEW_CLI = fileURLToPath(
  new URL("./security-review.mjs", import.meta.url),
);

const IMAGE = "GHSA-26w7-cxv4-gfx2";
const ERROR_PAGE = "GHSA-2pvr-wf23-7pc7";
const SLOT = "GHSA-8hv8-536x-4wqp";

const WWW_CONFIG = `// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "static",
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "passthrough",
  }),
});
`;

const ADMIN_CONFIG = `// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  integrations: [react()],
  vite: {
    plugins: [
      {
        load(id) {
          // A string that looks like a comment must not hide later config.
          if (id === "x") return "export const url = 'https://example.invalid';";
        },
      },
    ],
  },
  adapter: cloudflare({
    workerEntryPoint: {
      path: "./src/worker.ts",
      namedExports: ["EditorialDraftStore"],
    },
    platformProxy: { enabled: true },
    imageService: "passthrough",
  }),
});
`;

const ADMIN_WORKER = `import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { EditorialDraftStore } from "./editorial/draft-store";

export function createExports(manifest: SSRManifest) {
  return { ...createAstroExports(manifest), EditorialDraftStore };
}
`;

const EDITORIAL_LAYOUT = `---
const { hasContent } = Astro.props;
// Hard-coded slot names are not a sink.
const renderContent = hasContent && Astro.slots.has("default");
---
<!-- <div slot={Astro.url.searchParams.get("tab")}> stays inert in a comment -->
{renderContent ? (
  <EditorialApp client:load><slot /></EditorialApp>
) : (
  <EditorialApp client:load />
)}
`;

function astroPackage(version) {
  return JSON.stringify({ name: "astro", version });
}

function baseline(version = "5.18.2") {
  return {
    "apps/www/astro.config.mjs": WWW_CONFIG,
    "apps/www/node_modules/astro/package.json": astroPackage(version),
    "apps/www/src/layouts/Shell.astro":
      "---\nconst { title } = Astro.props;\n---\n<html><head><title>{title}</title></head><body><slot /></body></html>\n",
    "apps/www/src/pages/[...catchall].ts":
      'export const prerender = false;\nexport const GET = ({ locals, request }) => locals.runtime.env.ASSETS.fetch(new URL("/404.html", request.url));\n',
    "apps/admin/astro.config.mjs": ADMIN_CONFIG,
    "apps/admin/node_modules/astro/package.json": astroPackage(version),
    "apps/admin/src/worker.ts": ADMIN_WORKER,
    "apps/admin/src/layouts/EditorialLayout.astro": EDITORIAL_LAYOUT,
    "apps/admin/src/components/ArticleBody.tsx":
      "export const Body = () => <Button icon={<ImageIcon />} />;\n",
    "packages/brand/src/BrandMark.astro": "<svg aria-hidden='true'></svg>\n",
  };
}

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "astro-advisory-guard-"));
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function audit(overrides = {}, version) {
  const root = writeFixture({ ...baseline(version), ...overrides });
  try {
    return auditAstroAdvisories(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function initGit(root) {
  const init = spawnSync("git", ["init", "-q"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(init.status, 0, init.stderr);
}

function rulesFor(report, advisory) {
  return report.findings
    .filter((finding) => finding.advisory === advisory)
    .map((finding) => `${finding.file}:${finding.rule}`);
}

function assertOnly(report, advisory, expected, label) {
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.advisory !== advisory)
      .map((finding) => `${finding.advisory}:${finding.rule}`),
    [],
    label ?? "a violation must only trip its own advisory rule",
  );
  assert.deepEqual(rulesFor(report, advisory), expected, label);
}

const wwwConfig = (replace) =>
  WWW_CONFIG.replace('imageService: "passthrough",', replace);

test("the current repository keeps every tracked advisory unreachable", () => {
  const report = auditAstroAdvisories(REPO_ROOT);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(
    report.apps.map(({ app }) => app),
    ["www", "admin"],
  );
  for (const app of report.apps) {
    assert.match(app.version ?? "", /^\d+\.\d+\.\d+/, `${app.app} astro`);
  }
});

test("the baseline fixture mirrors the current shape and passes", () => {
  const report = audit();
  assert.deepEqual(report.findings, []);
  assert.equal(report.checked.length, ADVISORIES.length * 2);
  assert.deepEqual(report.skipped, []);
});

test("every rule carries its advisory id and first fixed Astro version", () => {
  assert.deepEqual(
    ADVISORIES.map(({ id, fixedIn }) => [id, fixedIn]),
    [
      [IMAGE, "7.2.8"],
      [ERROR_PAGE, "6.4.6"],
      [SLOT, "6.3.3"],
    ],
  );
  const [finding] = audit({
    "apps/www/astro.config.mjs": wwwConfig('imageService: "compile",'),
  }).findings;
  assert.equal(finding.advisory, IMAGE);
  assert.equal(finding.fixedIn, "7.2.8");
  assert.equal(finding.app, "www");
  assert.equal(finding.file, "apps/www/astro.config.mjs");
  assert.equal(finding.line, 9, "the finding points at the offending option");
});

test(`${IMAGE}: sharp-backed image services fail`, () => {
  for (const [label, config, rules] of [
    [
      "compile image service",
      wwwConfig('imageService: "compile",'),
      ["image_service_not_passthrough"],
    ],
    [
      "cloudflare image service",
      wwwConfig("imageService: 'cloudflare',"),
      ["image_service_not_passthrough"],
    ],
    [
      "adapter default (compile)",
      wwwConfig(""),
      ["image_service_not_passthrough"],
    ],
    [
      "commented-out passthrough",
      wwwConfig('// imageService: "passthrough",'),
      ["image_service_not_passthrough"],
    ],
    [
      "sharp entrypoint",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  image: { service: { entrypoint: "astro/assets/services/sharp" } },',
      ),
      ["sharp_image_service"],
    ],
    [
      "sharpImageService helper",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  image: { service: sharpImageService() },',
      ),
      ["sharp_image_service"],
    ],
    [
      "remote patterns",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  image: {\n    remotePatterns: [{ protocol: "https" }],\n  },',
      ),
      ["image_remote_sources"],
    ],
    [
      "authorized domains",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  image: { domains: ["example.invalid"] },',
      ),
      ["image_remote_sources"],
    ],
    [
      "unreadable image config",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  image: imageOptions,',
      ),
      ["image_config_unverifiable"],
    ],
  ]) {
    const report = audit({ "apps/www/astro.config.mjs": config });
    assertOnly(
      report,
      IMAGE,
      rules.map((rule) => `apps/www/astro.config.mjs:${rule}`),
    );
    assert.ok(report.findings.length > 0, label);
  }
});

test(`${IMAGE}: astro:assets, getImage, <Image>, <Picture> and sharp fail`, () => {
  for (const [file, content, rule] of [
    [
      "apps/www/src/pages/gallery.astro",
      '---\nimport { Image } from "astro:assets";\n---\n<p>gallery</p>\n',
      "astro_assets_import",
    ],
    [
      "apps/admin/src/lib/thumbnail.ts",
      "export const thumb = (src) => getImage({ src, format: 'avif' });\n",
      "get_image_call",
    ],
    [
      "apps/www/src/components/Hero.astro",
      "---\nconst { src } = Astro.props;\n---\n<Picture src={src} formats={['avif']} alt='' />\n",
      "astro_assets_component",
    ],
    [
      "packages/brand/src/Avatar.astro",
      "<Image src={Astro.props.src} alt='' />\n",
      "astro_assets_component",
    ],
    [
      "apps/admin/src/lib/decode.ts",
      'import sharp from "sharp";\nexport const decode = (bytes) => sharp(bytes).toBuffer();\n',
      "sharp_import",
    ],
  ]) {
    assertOnly(audit({ [file]: content }), IMAGE, [`${file}:${rule}`]);
  }
});

test(`${IMAGE}: nested, quoted and shorthand config keys are read at the right depth`, () => {
  for (const [label, config, rules] of [
    [
      "imageService nested under platformProxy",
      wwwConfig("").replace(
        "platformProxy: { enabled: true },",
        'platformProxy: { enabled: true, imageService: "passthrough" },',
      ),
      ["image_service_not_passthrough"],
    ],
    [
      "quoted image key",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  "image": { domains: ["example.invalid"] },',
      ),
      ["image_remote_sources"],
    ],
    [
      "quoted remotePatterns key",
      WWW_CONFIG.replace(
        'output: "static",',
        'output: "static",\n  image: { "remotePatterns": [] },',
      ),
      ["image_remote_sources"],
    ],
    [
      "shorthand image key",
      WWW_CONFIG.replace(
        "export default defineConfig({",
        'const image = { remotePatterns: [{ protocol: "https" }] };\n\nexport default defineConfig({\n  image,',
      ),
      ["image_config_unverifiable"],
    ],
  ]) {
    assertOnly(
      audit({ "apps/www/astro.config.mjs": config }),
      IMAGE,
      rules.map((rule) => `apps/www/astro.config.mjs:${rule}`),
      label,
    );
  }

  const nestedElsewhere = WWW_CONFIG.replace(
    'output: "static",',
    'output: "static",\n  vite: { build: { image: "inline-only" } },',
  );
  assert.deepEqual(
    audit({ "apps/www/astro.config.mjs": nestedElsewhere }).findings,
    [],
    "only the top-level image key is Astro's image config",
  );
});

test("a missing astro config fails the config rules for that app", () => {
  const report = audit({ "apps/www/astro.config.mjs": null });
  assert.deepEqual(
    report.findings.map(
      (finding) => `${finding.advisory}:${finding.app}:${finding.rule}`,
    ),
    [
      `${IMAGE}:www:astro_config_missing`,
      `${ERROR_PAGE}:www:astro_config_missing`,
    ],
  );
});

test("gitignored generated sources are skipped and new untracked sources are scanned", () => {
  const root = writeFixture({
    ...baseline(),
    ".gitignore": "node_modules\n/packages/content/src/public/generated.ts\n",
    "packages/content/src/public/generated.ts":
      'import { Image } from "astro:assets";\nexport const hero = await getImage({ src: "/a.avif" });\n',
    "apps/www/src/pages/fresh.astro":
      '---\nimport { Picture } from "astro:assets";\n---\n<p>fresh</p>\n',
  });
  try {
    initGit(root);
    assertOnly(auditAstroAdvisories(root), IMAGE, [
      "apps/www/src/pages/fresh.astro:astro_assets_import",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("image, render and slot code quoted inside string data is not a finding", () => {
  // Shaped like the generated public content projection, where an article
  // body can quote exactly the code the guard looks for.
  const prose = [
    "```astro",
    'import { Image } from "astro:assets";',
    "import sharp from 'sharp';",
    'const hero = await getImage({ src, format: "avif" });',
    'import { App } from "astro/app";',
    "app.render(request, { prerenderedErrorPageFetch: fetch });",
    "```",
  ].join("\n");
  const generated = [
    `export const JSON_BODY = ${JSON.stringify(prose)};`,
    `export const SINGLE_BODY = '${prose.replaceAll("'", "\\'").replaceAll("\n", "\\n")}';`,
    `export const TEMPLATE_BODY = \`${prose.replaceAll("`", "\\`")}\`;`,
    "",
  ].join("\n");
  const template = [
    "---",
    "const sample = 'import { Image } from \"astro:assets\"; Astro.slots.render(name);';",
    "---",
    '<CodeBlock code={"<div slot={Astro.url.hash}><Picture src={x} /></div>"} />',
    "<CodeBlock code={`<slot name={Astro.params.region} />`} />",
    "",
  ].join("\n");
  assert.deepEqual(
    audit({
      "packages/content/src/public/generated.ts": generated,
      "apps/admin/src/pages/sample.astro": template,
    }).findings,
    [],
  );

  assertOnly(
    audit({
      "apps/admin/src/lib/thumb.ts":
        "export const label = `thumb ${await getImage({ src })}`;\n",
    }),
    IMAGE,
    ["apps/admin/src/lib/thumb.ts:get_image_call"],
  );
});

test(`${IMAGE}: a URL or slash in JSX text does not hide code on the same line`, () => {
  const file = "apps/admin/src/components/Credit.tsx";
  for (const content of [
    "export const Credit = ({ src }) => <p>see https://x.test {getImage({ src })}</p>;\n",
    "export const Credit = ({ src }) => (\n  <p>\n    stored under: /{getImage({ src })}\n  </p>\n);\n",
  ]) {
    assertOnly(audit({ [file]: content }), IMAGE, [`${file}:get_image_call`]);
  }
});

test("symlinked source files are scanned with and without git", () => {
  for (const withGit of [false, true]) {
    const root = writeFixture({
      ...baseline(),
      "shared/decode.ts":
        'import sharp from "sharp";\nexport const decode = (bytes) => sharp(bytes);\n',
    });
    try {
      symlinkSync(
        join(root, "shared/decode.ts"),
        join(root, "apps/admin/src/decode.ts"),
      );
      if (withGit) initGit(root);
      assertOnly(auditAstroAdvisories(root), IMAGE, [
        "apps/admin/src/decode.ts:sharp_import",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test(`${ERROR_PAGE}: leaving the Cloudflare adapter fails`, () => {
  const nodeAdapter = WWW_CONFIG.replace(
    'import cloudflare from "@astrojs/cloudflare";',
    'import cloudflare from "@astrojs/node";',
  );
  const report = audit({ "apps/www/astro.config.mjs": nodeAdapter });
  assert.ok(
    rulesFor(report, ERROR_PAGE).includes(
      "apps/www/astro.config.mjs:adapter_not_cloudflare",
    ),
  );

  const dollarName = WWW_CONFIG.replace(
    'import cloudflare from "@astrojs/cloudflare";',
    'import $cf from "@astrojs/cloudflare";\nimport cf$ from "@astrojs/node";',
  );
  assert.deepEqual(
    audit({
      "apps/www/astro.config.mjs": dollarName.replace(
        "adapter: cloudflare(",
        "adapter: $cf(",
      ),
    }).findings,
    [],
    "an adapter name with $ still matches its own import",
  );
  assert.ok(
    rulesFor(
      audit({
        "apps/www/astro.config.mjs": dollarName.replace(
          "adapter: cloudflare(",
          "adapter: cf$(",
        ),
      }),
      ERROR_PAGE,
    ).includes("apps/www/astro.config.mjs:adapter_not_cloudflare"),
    "an adapter name with $ must not match another import",
  );

  const noAdapter = audit({
    "apps/admin/astro.config.mjs": 'export default { output: "server" };\n',
  });
  assert.ok(
    rulesFor(noAdapter, ERROR_PAGE).includes(
      "apps/admin/astro.config.mjs:adapter_not_cloudflare",
    ),
  );
});

test(`${ERROR_PAGE}: a custom handler calling app.render without the ASSETS fetcher fails`, () => {
  const customWorker = `import { App } from "astro/app";
export function createExports(manifest) {
  const app = new App(manifest);
  return {
    default: {
      fetch: (request, env) =>
        app.render(request, { routeData: app.match(request) }),
    },
  };
}
`;
  assertOnly(audit({ "apps/admin/src/worker.ts": customWorker }), ERROR_PAGE, [
    "apps/admin/src/worker.ts:render_without_error_page_fetch",
  ]);

  const globalFetch = customWorker.replace(
    "{ routeData: app.match(request) }",
    "{ routeData: app.match(request), prerenderedErrorPageFetch: fetch }",
  );
  assertOnly(audit({ "apps/admin/src/worker.ts": globalFetch }), ERROR_PAGE, [
    "apps/admin/src/worker.ts:global_error_page_fetch",
  ]);

  const nodeServer = `import { NodeApp } from "astro/app/node";
const app = new NodeApp(manifest);
export const handler = (req) => app.render(req);
`;
  assertOnly(audit({ "apps/www/src/server.mjs": nodeServer }), ERROR_PAGE, [
    "apps/www/src/server.mjs:render_without_error_page_fetch",
  ]);

  const assetsFetch = customWorker.replace(
    "{ routeData: app.match(request) }",
    "{\n          routeData: app.match(request),\n          prerenderedErrorPageFetch: (url) => env.ASSETS.fetch(url),\n        }",
  );
  assert.deepEqual(
    audit({ "apps/admin/src/worker.ts": assetsFetch }).findings,
    [],
  );

  for (const fetcher of [
    "(url) => fetch(url)",
    "globalThis.fetch.bind(globalThis)",
    "async (url) => {\n            return await self.fetch(url);\n          }",
  ]) {
    assertOnly(
      audit({
        "apps/admin/src/worker.ts": customWorker.replace(
          "{ routeData: app.match(request) }",
          `{\n          routeData: app.match(request),\n          prerenderedErrorPageFetch: ${fetcher},\n        }`,
        ),
      }),
      ERROR_PAGE,
      ["apps/admin/src/worker.ts:global_error_page_fetch"],
      fetcher,
    );
  }

  const namedGlobal = customWorker
    .replace(
      "export function createExports",
      "const prerenderedErrorPageFetch = (url) => fetch(url);\nexport function createExports",
    )
    .replace(
      "{ routeData: app.match(request) }",
      "{ routeData: app.match(request), prerenderedErrorPageFetch }",
    );
  assertOnly(audit({ "apps/admin/src/worker.ts": namedGlobal }), ERROR_PAGE, [
    "apps/admin/src/worker.ts:global_error_page_fetch",
  ]);
});

test(`${ERROR_PAGE}: an unverifiable worker entry fails`, () => {
  assertOnly(audit({ "apps/admin/src/worker.ts": null }), ERROR_PAGE, [
    "apps/admin/astro.config.mjs:worker_entry_unverifiable",
  ]);
  const outsideSrc = ADMIN_CONFIG.replace(
    'path: "./src/worker.ts"',
    'path: "./worker/entry.ts"',
  );
  assertOnly(
    audit({
      "apps/admin/astro.config.mjs": outsideSrc,
      "apps/admin/worker/entry.ts":
        'import { App } from "astro/app";\nexport default { fetch: (r) => new App(m).render(r) };\n',
    }),
    ERROR_PAGE,
    ["apps/admin/worker/entry.ts:render_without_error_page_fetch"],
  );

  // A worker entry outside src brings its local imports into every scan.
  const report = audit({
    "apps/admin/astro.config.mjs": outsideSrc,
    "apps/admin/worker/entry.ts":
      'export { createExports } from "../server/entry";\n',
    "apps/admin/server/entry.ts":
      'import { App } from "astro/app";\nimport sharp from "sharp";\nexport function createExports(m) {\n  return { default: { fetch: (r) => new App(m).render(r) } };\n}\n',
  });
  assert.deepEqual(
    report.findings.map(
      (finding) => `${finding.advisory}:${finding.file}:${finding.rule}`,
    ),
    [
      `${IMAGE}:apps/admin/server/entry.ts:sharp_import`,
      `${ERROR_PAGE}:apps/admin/server/entry.ts:render_without_error_page_fetch`,
    ],
  );
});

test(`${SLOT}: dynamic slot names and lookups fail`, () => {
  for (const [content, rule] of [
    [
      '<EditorialApp client:load>\n  <div slot={Astro.url.searchParams.get("panel")}>x</div>\n</EditorialApp>\n',
      "dynamic_slot_name",
    ],
    [
      "<AdminShell client:only='react'><p slot=`tab-${Astro.params.id}`>x</p></AdminShell>\n",
      "dynamic_slot_name",
    ],
    [
      "---\nconst html = await Astro.slots.render(Astro.params.section);\n---\n<Fragment set:html={html} />\n",
      "dynamic_slot_lookup",
    ],
    [
      "---\nconst name = Astro.url.hash;\nconst shown = Astro.slots.has(name);\n---\n",
      "dynamic_slot_lookup",
    ],
    ["<slot name={Astro.params.region} />\n", "dynamic_slot_lookup"],
    [
      '<X client:load>{"<!--"}<div slot={Astro.url.hash}>x</div>{"-->"}</X>\n',
      "dynamic_slot_name",
    ],
    [
      "<X client:load>{/* a */ Astro.props.title}<div slot={Astro.url.hash}>x</div>{/* b */}</X>\n",
      "dynamic_slot_name",
    ],
    [
      '<X client:load><div class="a"slot={Astro.url.hash}>x</div></X>\n',
      "dynamic_slot_name",
    ],
    [
      "<head><script is:inline set:html={prepaint} /></head>\n<X client:load><div slot={Astro.url.hash}>x</div></X>\n",
      "dynamic_slot_name",
    ],
    [
      "<script>const a = 1;\n<X client:load><div slot={Astro.url.hash}>x</div></X>\n",
      "dynamic_slot_name",
    ],
  ]) {
    const file = "apps/admin/src/pages/panel.astro";
    assertOnly(audit({ [file]: content }), SLOT, [`${file}:${rule}`]);
  }

  assert.deepEqual(
    audit({
      "apps/admin/src/pages/literal.astro":
        '---\nconst a = await Astro.slots.render("aside");\nconst b = Astro.slots.has(\'footer\');\n---\n<EditorialApp client:load><div slot="aside">{a}</div><p slot={"footer"}>{b}</p><slot name="aside" /></EditorialApp>\n',
      "apps/admin/src/pages/tabs.astro":
        '<div id="tabs"></div>\n<script>\n  const id = "one";\n  const slot = `panel-${id}`;\n</script>\n<style>\n  [slot="a"] { color: red; }\n</style>\n',
    }).findings,
    [],
    "client scripts and styles do not set component slots",
  );
});

test("a self-closing tag inside an expression leaves later markup readable", () => {
  for (const expression of [
    '{robots && <meta name="robots" content={robots} />}',
    "{items.map((item) => <WritingRow item={item} />)}",
    "{open ? <Panel id={id} /> : null}",
  ]) {
    const layout = [
      "---",
      "const { robots, items, open, id } = Astro.props;",
      "---",
      "<html>",
      "<head>",
      expression,
      "</head>",
      "<body>",
      "<!-- og images are static files; getImage() is off until astro 7 -->",
      "<!-- <aside slot={section}>later</aside> -->",
      "<slot />",
      "<script>",
      "  const slot = { start: performance.now(), end: 0 };",
      "</script>",
      "<style>",
      '  [slot="a"] { color: red; }',
      "</style>",
      "</body>",
      "</html>",
      "",
    ].join("\n");
    assert.deepEqual(
      audit({ "apps/www/src/layouts/Shell.astro": layout }).findings,
      [],
      `comments, scripts and styles after ${expression}`,
    );

    const file = "apps/admin/src/pages/sources.astro";
    const page = [
      expression,
      "<p>Sources live in <code>apps/*/src</code>.</p>",
      "<X client:load><div slot={tab}>x</div></X>",
      "",
    ].join("\n");
    assertOnly(
      audit({ [file]: page }),
      SLOT,
      [`${file}:dynamic_slot_name`],
      `a slot after ${expression}`,
    );
  }

  const file = "apps/admin/src/pages/progress.astro";
  assertOnly(
    audit({
      [file]:
        "<ul>{items.map((item) => <li>{item.done}/<X client:load><div slot={item.tab}>x</div></X></li>)}</ul>\n",
    }),
    SLOT,
    [`${file}:dynamic_slot_name`],
    "a slash after a brace in markup text is not a regular expression",
  );
});

test("an expression the scanner cannot close is read as markup", () => {
  const file = "apps/admin/src/pages/notes.astro";
  assertOnly(
    audit({
      [file]: [
        "{show && <code>apps/*/src</code>}",
        "<X client:load><div slot={tab}>x</div></X>",
        "",
      ].join("\n"),
    }),
    SLOT,
    [`${file}:dynamic_slot_name`],
    "a glob in expression text must not hide the rest of the file",
  );
  assert.deepEqual(
    audit({
      [file]: [
        "{show && <p>Ani's notes</p>}<p>it's here</p>",
        "<!-- getImage() stays off until astro 7 -->",
        "<script>",
        "  const slot = { id: 1 };",
        "</script>",
        "",
      ].join("\n"),
    }).findings,
    [],
    "apostrophes in expression text must not hide later comments or scripts",
  );
});

test("HTML comments inside markup expressions are ignored", () => {
  const file = "apps/admin/src/pages/overlays.astro";
  assert.deepEqual(
    audit({
      [file]: [
        "{rows.length > 0 && (",
        "  <X client:load>",
        "    <td>{row.ahead} / {row.behind}</td>",
        "    <!-- getImage() stays off until astro 7 -->",
        "    <!-- <div slot={Astro.url.hash}>later</div> -->",
        "  </X>",
        ")}",
        "",
      ].join("\n"),
    }).findings,
    [],
  );
  assertOnly(
    audit({
      [file]:
        "{open && (\n  <X client:load><!-- tab panel --><div slot={tab}>x</div></X>\n)}\n",
    }),
    SLOT,
    [`${file}:dynamic_slot_name`],
    "a comment in an expression must not hide the slot after it",
  );
});

test(`${IMAGE}: regular expressions in inline config plugins keep the config readable`, () => {
  const withPlugin = (body) =>
    ADMIN_CONFIG.replace(
      "    plugins: [\n",
      `    plugins: [\n      {\n        name: "rewrite-local-imports",\n        apply: "build",\n        transform(code, id) {\n          if (!id.includes("/editorial/")) return;\n          ${body}\n        },\n      },\n`,
    );
  for (const body of [
    "return code.replace(/from\\s+[\"']\\.\\/local[\"']/g, 'from \"./remote\"');",
    "if (/\\{$/.test(code)) return;",
    'return code.replace(/url\\(([^)]+)\\)/g, "$1");',
    'return code.replace(/[\'"`]/g, "");',
  ]) {
    const config = withPlugin(body);
    assert.notEqual(config, ADMIN_CONFIG, "the plugin fixture must apply");
    assert.deepEqual(
      audit({ "apps/admin/astro.config.mjs": config }).findings,
      [],
      body,
    );
    const compile = config.replace(
      'imageService: "passthrough",',
      'imageService: "compile",',
    );
    const report = audit({ "apps/admin/astro.config.mjs": compile });
    assertOnly(
      report,
      IMAGE,
      ["apps/admin/astro.config.mjs:image_service_not_passthrough"],
      body,
    );
    assert.equal(
      report.findings[0].line,
      compile.split("\n").findIndex((line) => line.includes('"compile"')) + 1,
      body,
    );
  }
});

test("each rule skips itself once the installed Astro reaches its fix", () => {
  const violations = {
    "apps/www/astro.config.mjs": wwwConfig('imageService: "compile",'),
    "apps/admin/src/worker.ts":
      'import { App } from "astro/app";\nexport default { fetch: (r) => new App(m).render(r) };\n',
    "apps/admin/src/pages/panel.astro":
      "<X client:load><p slot={name} /></X>\n",
  };
  const advisoriesAt = (version) =>
    [
      ...new Set(
        audit(violations, version).findings.map((finding) => finding.advisory),
      ),
    ].sort();

  assert.deepEqual(advisoriesAt("5.18.2"), [IMAGE, ERROR_PAGE, SLOT].sort());
  assert.deepEqual(advisoriesAt("6.3.2"), [IMAGE, ERROR_PAGE, SLOT].sort());
  assert.deepEqual(advisoriesAt("6.3.3"), [IMAGE, ERROR_PAGE].sort());
  assert.deepEqual(advisoriesAt("6.4.6"), [IMAGE]);
  assert.deepEqual(advisoriesAt("7.2.8-beta.1"), [IMAGE]);
  assert.deepEqual(advisoriesAt("7.2.8"), []);

  const upgraded = audit(violations, "7.2.8");
  assert.deepEqual(upgraded.checked, []);
  assert.equal(upgraded.skipped.length, ADVISORIES.length * 2);
  assert.ok(
    upgraded.skipped.every(
      ({ app, version }) =>
        ["www", "admin"].includes(app) && version === "7.2.8",
    ),
  );
});

test("the skip decision is per app and falls back to the lockfile", () => {
  const lockfile = (www, admin) => `lockfileVersion: '9.0'

importers:

  apps/admin:
    dependencies:
      astro:
        specifier: ^5.16.0
        version: ${admin}(@types/node@22.19.19)(typescript@5.9.3)

  apps/www:
    dependencies:
      '@astrojs/cloudflare':
        specifier: ^12.6.0
        version: 12.6.13(astro@${admin})
      astro:
        specifier: ^5.16.0
        version: ${www}(@types/node@22.19.19)(typescript@5.9.3)

packages:

  astro@${www}:
    resolution: {integrity: sha512-fixture}
`;
  const report = audit({
    "apps/www/node_modules/astro/package.json": null,
    "apps/admin/node_modules/astro/package.json": null,
    "pnpm-lock.yaml": lockfile("7.2.8", "5.18.2"),
    "apps/www/astro.config.mjs": wwwConfig('imageService: "compile",'),
    "apps/admin/src/pages/panel.astro":
      "<X client:load><p slot={name} /></X>\n",
  });
  assert.deepEqual(
    report.apps.map(({ app, version, source }) => [app, version, source]),
    [
      ["www", "7.2.8", "pnpm-lock.yaml"],
      ["admin", "5.18.2", "pnpm-lock.yaml"],
    ],
  );
  assert.deepEqual(
    report.findings.map((finding) => `${finding.app}:${finding.rule}`),
    ["admin:dynamic_slot_name"],
  );

  const unknown = audit({
    "apps/www/node_modules/astro/package.json": null,
    "apps/www/astro.config.mjs": wwwConfig('imageService: "compile",'),
  });
  assert.equal(unknown.apps[0].version, null);
  assert.deepEqual(
    unknown.findings.map((finding) => `${finding.app}:${finding.rule}`),
    ["www:image_service_not_passthrough"],
    "an unresolvable Astro version must keep the rules active",
  );
});

test("version comparison orders releases and prereleases", () => {
  assert.equal(compareVersions("5.18.2", "7.2.8") < 0, true);
  assert.equal(compareVersions("7.2.8", "7.2.8"), 0);
  assert.equal(compareVersions("7.10.0", "7.2.8") > 0, true);
  assert.equal(compareVersions("7.2.8-beta.1", "7.2.8") < 0, true);
  assert.equal(compareVersions("8.0.0", "7.2.8") > 0, true);
});

function runCli(script, files, args = []) {
  const root = writeFixture(files);
  try {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the guard CLI exits non-zero with advisory-coded findings", () => {
  const clean = runCli(GUARD_CLI, baseline());
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /astro advisory guard passed/);

  const failing = runCli(GUARD_CLI, {
    ...baseline(),
    "apps/www/astro.config.mjs": wwwConfig('imageService: "compile",'),
  });
  assert.equal(failing.status, 1);
  assert.match(
    failing.stderr,
    /apps\/www\/astro\.config\.mjs:9 GHSA-26w7-cxv4-gfx2 image_service_not_passthrough: .*7\.2\.8/,
  );
});

test("the required Security Review check runs the guard on every pull request", () => {
  const listFile = "security-files.txt";
  const clean = runCli(SECURITY_REVIEW_CLI, { ...baseline(), [listFile]: "" }, [
    listFile,
  ]);
  assert.equal(clean.status, 0, clean.stderr);

  const failing = runCli(
    SECURITY_REVIEW_CLI,
    {
      ...baseline(),
      [listFile]: "apps/admin/src/pages/panel.astro\n",
      "apps/admin/src/pages/panel.astro":
        "<X client:load><p slot={Astro.url.search} /></X>\n",
    },
    [listFile],
  );
  assert.equal(failing.status, 1);
  assert.match(
    failing.stderr,
    /apps\/admin\/src\/pages\/panel\.astro:1 GHSA-8hv8-536x-4wqp dynamic_slot_name/,
  );
});
