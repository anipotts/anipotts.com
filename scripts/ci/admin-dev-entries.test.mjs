import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { adminDependencyDiscovery } from "../dev/admin-dependency-discovery.mjs";

for (const [name, options] of Object.entries(adminDependencyDiscovery)) {
  test(`admin ${name} discovery includes real views and excludes test-only tooling`, () => {
    const patterns = options.entries.filter((entry) => !entry.startsWith("!"));
    const exclude = options.entries
      .filter((entry) => entry.startsWith("!"))
      .map((entry) => entry.slice(1));
    const files = [
      ...globSync(patterns, { cwd: resolve("apps/admin"), exclude }),
    ];
    assert.ok(files.includes("src/components/astryx/HomeEditor.tsx"));
    assert.ok(
      files.some(
        (file) => file.startsWith("src/pages/") && file.endsWith(".astro"),
      ),
    );
    assert.ok(
      files.length > 20,
      "discovery must include the real app rather than disable scanning",
    );
    for (const file of files)
      assert.doesNotMatch(
        file,
        /(?:\.test\.|\.spec\.|__tests__|astro\.config)/,
      );
    assert.equal(
      files.includes("src/lib/retired-route.test.ts"),
      false,
      "the test that imports Astro configuration must never become a runtime optimizer entry",
    );
    if (name === "ssr")
      assert.ok(
        files.includes("src/worker.ts"),
        "the actual server entry must remain discoverable",
      );
  });
}

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { previewPublicAssets } from "../admin/preview-public-assets.mjs";

test("preview package contains only preview-route CSS and its explicitly approved fonts/public scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "preview-public-package-"));
  try {
    await mkdir(join(root, "_astro"));
    await writeFile(
      join(root, "_astro/record.synthetic.css"),
      "body{color:red}@font-face{src:url(/_astro/instrument-sans-latin-wght-normal.synthetic.woff2)}",
    );
    await writeFile(
      join(root, "_astro/instrument-sans-latin-wght-normal.synthetic.woff2"),
      new Uint8Array([119, 79, 70, 50]),
    );
    const integration = previewPublicAssets();
    integration.hooks["astro:build:ssr"]({
      manifest: {
        routes: [
          {
            routeData: { route: "/preview/record" },
            styles: [{ type: "external", src: "_astro/record.synthetic.css" }],
          },
          {
            routeData: { route: "/content/new" },
            styles: [{ type: "external", src: "_astro/private.synthetic.css" }],
          },
        ],
        entryModules: {
          "/synthetic/apps/www/src/components/Nav.astro?astro&type=script":
            "_astro/Nav.synthetic.js",
          "/synthetic/apps/admin/src/components/EditorialApp.tsx":
            "_astro/private.synthetic.js",
        },
      },
    });
    await integration.hooks["astro:build:done"]({
      dir: pathToFileURL(root + "/"),
    });
    const value = JSON.parse(
      await readFile(join(root, "__preview/public-assets.json"), "utf8"),
    );
    assert.deepEqual(
      value.styles.map((style) => style.path),
      ["/_astro/record.synthetic.css"],
    );
    assert.deepEqual(value.scripts, ["/_astro/Nav.synthetic.js"]);
    assert.equal(value.fonts.length, 1);
    assert.equal(value.fonts[0].data, "d09GMg==");
    await writeFile(
      join(root, "_astro/record.synthetic.css"),
      "body{background:url(https://private.example/data)}",
    );
    await assert.rejects(
      () =>
        integration.hooks["astro:build:done"]({
          dir: pathToFileURL(root + "/"),
        }),
      /Unapproved/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
