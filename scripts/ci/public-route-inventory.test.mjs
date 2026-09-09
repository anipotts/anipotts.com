#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_CMS_PROJECTS,
  DEFAULT_CMS_WRITING,
} from "../../packages/content/src/public/generated.ts";
import { isPublicProject } from "../../packages/content/src/public/visibility.ts";
import {
  PUBLIC_ROUTE_INVENTORY,
  PUBLIC_SMOKE_ROUTES,
  validatePublicRouteInventory,
} from "./public-route-inventory.mjs";

assert.ok(PUBLIC_ROUTE_INVENTORY.length >= 5);
for (const route of ["/", "/work", "/writing", "/systems", "/links"])
  assert.ok(PUBLIC_SMOKE_ROUTES.includes(route));
for (const route of ["/newsletter", "/newsletter/archive"])
  assert.equal(PUBLIC_SMOKE_ROUTES.includes(route), false);
assert.deepEqual(
  PUBLIC_SMOKE_ROUTES,
  PUBLIC_ROUTE_INVENTORY.map((record) => record.route),
);
assert.equal(new Set(PUBLIC_SMOKE_ROUTES).size, PUBLIC_SMOKE_ROUTES.length);
assert.equal(Object.isFrozen(PUBLIC_ROUTE_INVENTORY), true);
assert.equal(Object.isFrozen(PUBLIC_SMOKE_ROUTES), true);

for (const record of PUBLIC_ROUTE_INVENTORY) {
  assert.deepEqual(Object.keys(record), ["route", "file"]);
  assert.equal(Object.isFrozen(record), true);
  assert.ok(existsSync(record.file), `${record.route} missing ${record.file}`);
}

assert.equal(
  PUBLIC_ROUTE_INVENTORY.filter(
    (record) => record.file === "apps/www/src/pages/work/[slug].astro",
  ).length,
  DEFAULT_CMS_PROJECTS.filter(isPublicProject).length,
);
assert.equal(
  PUBLIC_ROUTE_INVENTORY.filter(
    (record) => record.file === "apps/www/src/pages/writing/[slug].astro",
  ).length,
  DEFAULT_CMS_WRITING.filter((item) => item.visible).length,
);

const cli = spawnSync(
  process.execPath,
  ["scripts/ci/public-route-inventory.mjs"],
  {
    encoding: "utf8",
  },
);
assert.equal(cli.status, 0, cli.stderr);
assert.equal(cli.stderr, "");
assert.equal(cli.stdout, `${PUBLIC_SMOKE_ROUTES.join("\n")}\n`);

for (const unsafeRoute of [
  "relative",
  "/white space",
  "/new\nline",
  "/control\tcharacter",
  "//double",
  "/a//b",
  "/./x",
  "/../x",
  "/trailing/",
  "/query?value",
  "/hash#value",
  "/semi;colon",
  "/dollar$sign",
  "/back`tick",
  "/pipe|value",
]) {
  assert.throws(
    () =>
      validatePublicRouteInventory([
        { route: unsafeRoute, file: "apps/www/src/pages/index.astro" },
      ]),
    /unsafe route/,
  );
}

assert.throws(
  () =>
    validatePublicRouteInventory([
      { route: "/", file: "apps/www/src/pages/index.astro" },
      { route: "/", file: "apps/www/src/pages/index.astro" },
    ]),
  /duplicate public route/,
);
assert.throws(() => validatePublicRouteInventory(null), /must be an array/);
assert.throws(() => validatePublicRouteInventory([]), /must not be empty/);
assert.throws(() => validatePublicRouteInventory([null]), /must be an object/);
assert.throws(
  () =>
    validatePublicRouteInventory([
      {
        route: "/",
        file: "apps/www/src/pages/index.astro",
        smoke: true,
      },
    ]),
  /invalid shape/,
);
assert.throws(
  () => validatePublicRouteInventory([{ route: "/", file: "" }]),
  /invalid file/,
);
for (const unsafeFile of [
  "/apps/www/src/pages/index.astro",
  "apps/admin/src/pages/index.astro",
  "apps/www/src/pages/../secret.astro",
  "apps/www/src/pages//index.astro",
  "apps/www/src/pages/white space.astro",
  "apps/www/src/pages/control\nfile.astro",
  "apps/www/src/pages/index.ts",
]) {
  assert.throws(
    () => validatePublicRouteInventory([{ route: "/", file: unsafeFile }]),
    /invalid file/,
  );
}

assert.equal(
  PUBLIC_SMOKE_ROUTES.includes("/work/options-pricing-sensitivity"),
  false,
);
