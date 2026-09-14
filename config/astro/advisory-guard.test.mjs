import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, describe, test } from "node:test";
import astroAdvisoryGuard, {
  AstroAdvisoryError,
  CLOUDFLARE_ADAPTER,
  ERROR_PAGE_SSRF,
  FIRST_FIXED,
  PASSTHROUGH_IMAGE_SERVICE,
  SHARP_DECODING,
  SLOT_NAME_XSS,
  activeAdvisories,
  checkResolvedConfig,
  findSlotViolations,
  guardedSource,
  installedAstroVersion,
  reachesVersion,
} from "./advisory-guard.mjs";

const INSTALLED = "5.18.2";
const ALL = activeAdvisories(INSTALLED);

const repo = realpathSync(mkdtempSync(join(tmpdir(), "astro-advisory-guard-")));
after(() => rmSync(repo, { recursive: true, force: true }));

function write(path, content = "") {
  const absolute = join(repo, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

const files = {
  wwwPage: write("apps/www/src/pages/index.astro", "<main />\n"),
  adminModule: write("apps/admin/src/lib/render.ts", "export {};\n"),
  packageModule: write("packages/content/src/public/index.ts", "export {};\n"),
  markdownPage: write("apps/www/src/pages/notes.md", "# notes\n"),
  svgAsset: write("apps/admin/src/assets/mark.svg", "<svg />\n"),
  tsxComponent: write("apps/admin/src/components/Panel.tsx", "export {};\n"),
  mjsModule: write("packages/content/src/public/helpers.mjs", "export {};\n"),
  mdxPage: write("apps/www/src/pages/notes.mdx", "# notes\n"),
  astroRuntime: write("node_modules/astro/dist/content/runtime.js"),
  appDependency: write("apps/www/node_modules/astro/dist/assets/endpoint.js"),
  srcDependency: write("apps/www/src/node_modules/vendor/index.js"),
  generated: write("apps/www/.astro/content-assets.mjs"),
  script: write("scripts/dev/tool.mjs"),
  packageDist: write("packages/content/dist/index.js"),
  astroVersion: write(
    "apps/www/node_modules/astro/package.json",
    JSON.stringify({ name: "astro", version: INSTALLED }),
  ),
  appManifest: write("apps/www/package.json", "{}"),
};
// pnpm links workspace packages into app node_modules. The real path decides.
mkdirSync(join(repo, "apps/admin/node_modules/@anipotts"), { recursive: true });
symlinkSync(
  join(repo, "packages/content"),
  join(repo, "apps/admin/node_modules/@anipotts/content"),
);
const linkedPackageModule = join(
  repo,
  "apps/admin/node_modules/@anipotts/content/src/public/index.ts",
);

function cloudflareConfig(overrides = {}) {
  return {
    root: pathToFileURL(join(repo, "apps/www/")),
    adapter: { name: CLOUDFLARE_ADAPTER, hooks: {} },
    image: {
      service: { entrypoint: PASSTHROUGH_IMAGE_SERVICE, config: {} },
      domains: [],
      remotePatterns: [],
    },
    ...overrides,
  };
}

function setup(options = {}) {
  const integration = astroAdvisoryGuard({
    astroVersion: INSTALLED,
    repoRoot: repo,
    ...options,
  });
  const updates = [];
  integration.hooks["astro:config:setup"]({
    config: cloudflareConfig(),
    command: "build",
    updateConfig: (update) => updates.push(update),
  });
  const plugin = updates.flatMap((update) => update.vite?.plugins ?? [])[0];
  return { integration, updates, plugin };
}

function pluginContext() {
  return {
    error(message) {
      throw new Error(typeof message === "string" ? message : message.message);
    },
  };
}

function configDone(integration, config) {
  return () => integration.hooks["astro:config:done"]({ config });
}

describe("version gating", () => {
  test("rules stay on below each first fixed version", () => {
    assert.deepEqual(
      [...ALL].sort(),
      [ERROR_PAGE_SSRF, SHARP_DECODING, SLOT_NAME_XSS].sort(),
    );
    assert.equal(reachesVersion("6.3.3-beta.1", "6.3.3"), false);
    assert.equal(reachesVersion("6.3.2", "6.3.3"), false);
  });

  test("each rule turns off at its own fixed version", () => {
    assert.deepEqual(
      [...activeAdvisories("6.3.3")].sort(),
      [SHARP_DECODING, ERROR_PAGE_SSRF].sort(),
    );
    assert.deepEqual([...activeAdvisories("6.4.6")], [SHARP_DECODING]);
    assert.deepEqual([...activeAdvisories("7.2.8")], []);
    assert.deepEqual([...activeAdvisories("8.0.0")], []);
    assert.equal(FIRST_FIXED[SHARP_DECODING], "7.2.8");
  });

  test("an unreadable version keeps every rule on", () => {
    assert.equal(activeAdvisories(null).size, 3);
    assert.equal(activeAdvisories("workspace:*").size, 3);
    assert.equal(installedAstroVersion("file:///nonexistent/app/"), null);
  });

  test("the installed version is read from the app root", () => {
    assert.equal(
      installedAstroVersion(pathToFileURL(join(repo, "apps/www/"))),
      INSTALLED,
    );
    const integration = astroAdvisoryGuard({ repoRoot: repo });
    const updates = [];
    integration.hooks["astro:config:setup"]({
      config: cloudflareConfig(),
      updateConfig: (update) => updates.push(update),
    });
    assert.equal(updates.length, 1);
  });

  test("a fixed astro adds no plugin and accepts any config", () => {
    const { integration, updates } = setup({ astroVersion: "7.2.8" });
    assert.equal(updates.length, 0);
    assert.doesNotThrow(
      configDone(integration, {
        adapter: { name: "@astrojs/node" },
        image: {
          service: { entrypoint: "astro/assets/services/sharp" },
          remotePatterns: [{ hostname: "example.com" }],
        },
      }),
    );
    const partial = setup({ astroVersion: "6.4.6" });
    assert.throws(
      configDone(
        partial.integration,
        cloudflareConfig({ adapter: { name: "@astrojs/node" } }),
      ),
      (error) =>
        error.message.startsWith(`${SHARP_DECODING}: resolved adapter`) &&
        !error.message.includes(ERROR_PAGE_SSRF),
    );
  });
});

describe("resolved config", () => {
  test("the cloudflare passthrough config passes", () => {
    const { integration } = setup();
    assert.doesNotThrow(configDone(integration, cloudflareConfig()));
    assert.doesNotThrow(
      configDone(
        integration,
        cloudflareConfig({
          image: { service: { entrypoint: PASSTHROUGH_IMAGE_SERVICE } },
        }),
      ),
    );
  });

  test("a different adapter fails with both adapter advisories", () => {
    const { integration } = setup();
    assert.throws(
      configDone(
        integration,
        cloudflareConfig({ adapter: { name: "@astrojs/node" } }),
      ),
      (error) => {
        assert.ok(error instanceof AstroAdvisoryError);
        assert.match(
          error.message,
          new RegExp(
            `^${ERROR_PAGE_SSRF}, ${SHARP_DECODING}: resolved adapter is "@astrojs/node"`,
          ),
        );
        assert.match(error.hint, /imageService: "passthrough"/);
        assert.deepEqual(error.advisories, [ERROR_PAGE_SSRF, SHARP_DECODING]);
        return true;
      },
    );
    assert.throws(
      configDone(integration, cloudflareConfig({ adapter: undefined })),
      /resolved adapter is null/,
    );
  });

  test("the sharp entrypoint from imageService compile fails", () => {
    const { integration } = setup();
    assert.throws(
      configDone(
        integration,
        cloudflareConfig({
          image: {
            service: { entrypoint: "astro/assets/services/sharp", config: {} },
            endpoint: { entrypoint: "@astrojs/cloudflare/image-endpoint" },
            domains: [],
            remotePatterns: [],
          },
        }),
      ),
      new RegExp(
        `^\\w*Error: ${SHARP_DECODING}: resolved image service is "astro/assets/services/sharp"`,
      ),
    );
    assert.throws(
      configDone(
        integration,
        cloudflareConfig({
          image: {
            service: { entrypoint: "@astrojs/cloudflare/image-service" },
          },
        }),
      ),
      /not astro\/assets\/services\/noop/,
    );
  });

  test("remote image sources fail", () => {
    const { integration } = setup();
    assert.throws(
      configDone(
        integration,
        cloudflareConfig({
          image: {
            service: { entrypoint: PASSTHROUGH_IMAGE_SERVICE },
            domains: [],
            remotePatterns: [{ protocol: "https", hostname: "**" }],
          },
        }),
      ),
      new RegExp(
        `^\\w*Error: ${SHARP_DECODING}: image\\.remotePatterns allows`,
      ),
    );
    const findings = checkResolvedConfig(
      cloudflareConfig({
        image: {
          service: { entrypoint: "astro/assets/services/sharp" },
          domains: ["example.com"],
          remotePatterns: [{ hostname: "example.com" }],
        },
      }),
      ALL,
    );
    assert.equal(findings.length, 3);
  });
});

describe("module resolution", () => {
  const { plugin } = setup();
  const resolve = (source, importer) =>
    plugin.resolveId.call(pluginContext(), source, importer, {});

  test("the plugin runs before Astro's own resolvers", () => {
    assert.equal(plugin.enforce, "pre");
  });

  for (const source of [
    "astro:assets",
    "astro/assets",
    "astro/assets/services/sharp",
    "sharp",
  ]) {
    test(`${source} from app or package source fails`, () => {
      for (const importer of [
        files.wwwPage,
        files.adminModule,
        files.packageModule,
        linkedPackageModule,
        `${files.wwwPage}?astro&type=script&index=0&lang.ts`,
        files.mdxPage,
        files.tsxComponent,
        files.mjsModule,
      ]) {
        assert.throws(
          () => resolve(source, importer),
          new RegExp(
            `^\\w*Error: ${SHARP_DECODING}: (?:apps|packages)/[^ ]+ imports`,
          ),
          importer,
        );
      }
    });
  }

  for (const source of ["astro/app", "astro/app/node"]) {
    test(`${source} from app source fails`, () => {
      assert.throws(
        () => resolve(source, files.adminModule),
        new RegExp(
          `^\\w*Error: ${ERROR_PAGE_SSRF}: apps/admin/src/lib/render\\.ts imports "${source}"`,
        ),
      );
    });
  }

  // Astro compiles `.md` pages and `.svg` imports into modules that import
  // `astro:assets` or `astro/assets/runtime` themselves.
  test("the same imports from Astro internals and outside src pass", () => {
    for (const source of ["astro:assets", "sharp", "astro/app"]) {
      for (const importer of [
        undefined,
        "\0astro:content",
        "\0virtual:astro:assets/fonts/internal",
        "astro:content",
        "virtual:image-service",
        files.astroRuntime,
        files.appDependency,
        files.srcDependency,
        files.generated,
        files.script,
        files.packageDist,
        files.markdownPage,
        files.svgAsset,
        `${files.svgAsset}?url`,
        join(repo, "apps/www/src/pages/missing.astro"),
        join(repo, "apps/www/src/pages"),
      ]) {
        assert.equal(
          resolve(source, importer),
          null,
          `${source} <- ${importer}`,
        );
      }
    }
  });

  test("unrelated Astro modules pass from source", () => {
    for (const source of [
      "astro:content",
      "astro:middleware",
      "astro:transitions",
      "astro/loaders",
      "astro/config",
      "astro/assets/runtime",
      "astro/assets/utils",
      "astro/application",
      "sharpen",
      "@anipotts/content/assets",
    ]) {
      assert.equal(resolve(source, files.wwwPage), null, source);
    }
  });

  test("guarded source paths are repository relative", () => {
    assert.deepEqual(guardedSource(linkedPackageModule, repo), {
      file: "packages/content/src/public/index.ts",
      absolute: files.packageModule,
    });
    assert.equal(
      guardedSource(`/@fs${files.wwwPage}`, repo).file,
      "apps/www/src/pages/index.astro",
    );
    assert.equal(guardedSource("apps/www/src/pages/index.astro", repo), null);
  });

  test("resolution rules turn off with their advisories", () => {
    const fixed = setup({ astroVersion: "6.4.6" }).plugin;
    assert.equal(
      fixed.resolveId.call(pluginContext(), "astro/app", files.adminModule),
      null,
    );
    assert.throws(
      () => fixed.resolveId.call(pluginContext(), "sharp", files.adminModule),
      new RegExp(SHARP_DECODING),
    );
  });
});

describe("slot names", () => {
  const astroFile = (path, source) => ({ path: write(path, source), source });

  test("a dynamic slot attribute fails the transform", () => {
    const { plugin } = setup();
    const file = astroFile(
      "apps/admin/src/layouts/Dynamic.astro",
      '---\nconst panel = Astro.url.searchParams.get("panel");\n---\n<App client:load>\n  <div slot={panel}>body</div>\n</App>\n',
    );
    assert.throws(
      () =>
        plugin.transform.call(pluginContext(), "compiled output", file.path),
      new RegExp(
        `^\\w*Error: ${SLOT_NAME_XSS}: apps/admin/src/layouts/Dynamic\\.astro:5 slot attribute value is not a string literal`,
      ),
    );
    // Sub-requests and files outside src are not checked.
    assert.equal(
      plugin.transform.call(
        pluginContext(),
        "",
        `${file.path}?astro&type=style&index=0&lang.css`,
      ),
      null,
    );
    const outside = write("node_modules/pkg/Dynamic.astro", file.source);
    assert.equal(plugin.transform.call(pluginContext(), "", outside), null);
  });

  test("the transform reads the file, not the code it is given", () => {
    const { plugin } = setup();
    const file = astroFile(
      "apps/www/src/components/Literal.astro",
      '<Card><div slot="footer">ok</div></Card>\n',
    );
    assert.equal(
      plugin.transform.call(pluginContext(), "<div slot={x}></div>", file.path),
      null,
    );
  });

  test("literal slot names pass", () => {
    assert.deepEqual(
      findSlotViolations(
        [
          "---",
          "const slot = { name: 'frontmatter' };",
          "const hasFooter = Astro.slots.has('footer');",
          "---",
          '<App client:load><div slot="footer">a</div></App>',
          "<App client:load><div slot='footer'>a</div></App>",
          '<App client:load><div slot={"footer"}>a</div></App>',
          "<App client:load><div slot=`footer`>a</div></App>",
          "<div data-slot={panel} aria-describedby={slot}>a</div>",
          "<slot />",
          '<slot name="footer" />',
          '{Astro.slots.has("default") && Astro.slots.render("default", [1])}',
          "<script>const slot = { open: true }; let slot2 = `${a}`;</script>",
        ].join("\n"),
      ),
      [],
    );
  });

  test("dynamic slot names fail, including a ternary of literals", () => {
    const cases = [
      "<App client:load><div slot={panel}>a</div></App>",
      "<App client:load><div slot = {panel}>a</div></App>",
      '<App client:load><div slot={open ? "a" : "b"}>a</div></App>',
      "<App client:load><div slot={`${panel}`}>a</div></App>",
      "<App client:load><div slot=`tab-${panel}`>a</div></App>",
      '<slot name="x" slot={Astro.params.name} />',
      "{Astro.slots.render(name)}",
      "{await Astro.slots.render(`${name}`)}",
      '---\nconst ok = Astro.slots.has(Astro.url.searchParams.get("s"));\n---\n',
    ];
    for (const source of cases) {
      const findings = findSlotViolations(source);
      assert.equal(findings.length, 1, source);
      assert.equal(findings[0].advisory, SLOT_NAME_XSS);
    }
  });

  test("line numbers survive frontmatter blanking", () => {
    const [finding] = findSlotViolations(
      "---\nconst a = 1;\nconst b = 2;\n---\n\n<A client:idle><p slot={b}>x</p></A>\n",
    );
    assert.equal(finding.line, 6);
  });

  test("the slot rule turns off at astro 6.3.3", () => {
    const { plugin } = setup({ astroVersion: "6.3.3" });
    const file = astroFile(
      "apps/admin/src/layouts/Gated.astro",
      "<App client:load><div slot={panel}>body</div></App>\n",
    );
    assert.equal(plugin.transform.call(pluginContext(), "", file.path), null);
  });
});
