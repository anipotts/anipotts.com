import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

const sentinel = "/_astro/astro-module-sentinel.js";
const requireApp = createRequire(resolve("apps/www/package.json"));
const astroRoot = dirname(requireApp.resolve("astro/package.json"));
const source = readFileSync(
  join(astroRoot, "dist/transitions/router.js"),
  "utf8",
);
const start = source.indexOf("function runScripts() {");
const end = source.indexOf("\n// Add a new entry", start);
assert.ok(
  start >= 0 && end > start,
  "inspect the actual installed Astro runScripts",
);
const runScriptsSource = source.slice(start, end);

function fixture(definitions) {
  const inserted = [];
  const replaced = [];
  const scripts = [];
  const make = (properties = {}, text = "") => {
    const attributes = Object.entries(properties).map(([name, value]) => ({
      name,
      value,
    }));
    const script = {
      attributes,
      dataset: {},
      innerHTML: text,
      getAttribute(name) {
        return attributes.find((attr) => attr.name === name)?.value ?? null;
      },
      setAttribute(name, value) {
        attributes.push({ name, value });
      },
      replaceWith(next) {
        replaced.push(next);
        scripts.splice(scripts.indexOf(script), 1, next);
      },
    };
    return script;
  };
  scripts.push(...definitions.map(([props, text]) => make(props, text)));
  const document = {
    getElementsByTagName(name) {
      assert.equal(name, "script");
      return scripts;
    },
    createElement(name) {
      assert.equal(name, "script");
      return make();
    },
    body: {
      insertAdjacentHTML(position, html) {
        assert.equal(position, "beforeend");
        inserted.push(html);
        assert.equal(html, `<script type="module" src="${sentinel}"/>`);
        scripts.push(make({ type: "module", src: sentinel }));
      },
    },
  };
  const run = runInNewContext(`${runScriptsSource}; runScripts`, { document });
  return { inserted, replaced, run };
}

test("the exact Astro patch only changes its module barrier URL and both apps serve identical empty JavaScript", () => {
  const patch = readFileSync("patches/astro@7.4.0.patch", "utf8");
  const removed = patch
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---"));
  const added = patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  assert.equal(removed.length, 1);
  assert.equal(added.length, 1);
  assert.equal(
    added[0].slice(1),
    removed[0].slice(1).replace("data:application/javascript,", sentinel),
  );
  assert.ok(
    runScriptsSource.includes(sentinel),
    "installed Astro must include the registered patch",
  );
  assert.ok(!runScriptsSource.includes("data:application/javascript,"));
  const requireAdmin = createRequire(resolve("apps/admin/package.json"));
  const adminAstroRoot = dirname(requireAdmin.resolve("astro/package.json"));
  const adminSource = readFileSync(
    join(adminAstroRoot, "dist/transitions/router.js"),
    "utf8",
  );
  assert.ok(
    adminSource.includes(runScriptsSource),
    "both Astro app contexts must apply the same router patch",
  );
  const expected =
    "// Intentionally empty: same-origin load barrier for Astro inline modules.\n";
  for (const app of ["www", "admin"])
    assert.equal(
      readFileSync(`apps/${app}/public${sentinel}`, "utf8"),
      expected,
    );
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    manifest.pnpm.patchedDependencies["astro@7.4.0"],
    "patches/astro@7.4.0.patch",
  );
  const hash = createHash("sha256").update(patch).digest("hex");
  assert.ok(readFileSync("pnpm-lock.yaml", "utf8").includes(`hash: ${hash}`));
});

for (const outcome of ["onload", "onerror"])
  test(`inline module barrier preserves pending completion until ${outcome}`, async () => {
    const current = fixture([
      [{ type: "module" }, "window.syntheticInline = true"],
    ]);
    let complete = false;
    const waiting = current.run().then(() => {
      complete = true;
    });
    await Promise.resolve();
    assert.equal(complete, false);
    assert.equal(current.inserted.length, 1);
    assert.equal(current.replaced.length, 2);
    assert.equal(
      current.replaced[0].innerHTML,
      "window.syntheticInline = true",
    );
    assert.equal(current.replaced[1].getAttribute("src"), sentinel);
    current.replaced[1][outcome]();
    await waiting;
    assert.equal(complete, true);
  });

test("an existing final external module keeps its own barrier with no added sentinel", async () => {
  const current = fixture([
    [{ type: "module" }, "inline"],
    [{ type: "module", src: "/actual-module.js" }, ""],
  ]);
  const waiting = current.run();
  assert.equal(current.inserted.length, 0);
  assert.equal(current.replaced[1].getAttribute("src"), "/actual-module.js");
  current.replaced[1].onload();
  await waiting;
});

test("classic scripts do not gain a module barrier", async () => {
  const current = fixture([[{}, "classic"]]);
  await current.run();
  assert.equal(current.inserted.length, 0);
  assert.equal(current.replaced.length, 1);
});
