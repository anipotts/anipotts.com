import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import config from "../../apps/admin/astro.config.mjs";

for (const [name, options] of Object.entries({
  client: config.vite.optimizeDeps,
  ssr: config.vite.environments.ssr.optimizeDeps,
})) {
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
