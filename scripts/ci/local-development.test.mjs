import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const read = (path) => readFileSync(path, "utf8");

const rootPackage = readJson("package.json");
const publicPackage = readJson("apps/www/package.json");
const adminPackage = readJson("apps/admin/package.json");
const guide = read("docs/local-development.md");
const agentGuide = read("AGENTS.md");
const adminPolicy = read("apps/admin/src/lib/admin-access-policy.ts");

assert.equal(rootPackage.scripts["dev:www"], "pnpm --filter @anipotts/www dev");
assert.equal(
  rootPackage.scripts["dev:admin"],
  "pnpm --filter @anipotts/admin dev",
);
assert.equal(
  rootPackage.scripts["dev:all"],
  "pnpm --parallel --filter @anipotts/www --filter @anipotts/admin run dev",
);
assert.equal(rootPackage.devDependencies?.portless, undefined);
assert.equal(rootPackage.scripts["dev:status"], undefined);
assert.equal(rootPackage.scripts["dev:stop"], undefined);

assert.equal(
  publicPackage.scripts.dev,
  "astro dev --host 127.0.0.1 --port 4321",
);
assert.equal(
  adminPackage.scripts.dev,
  "astro dev --host 127.0.0.1 --port 4322",
);

for (const source of [guide, agentGuide]) {
  assert.match(source, /http:\/\/localhost:4321\//);
  assert.match(source, /http:\/\/localhost:4322\//);
  assert.doesNotMatch(source, /Portless|anipotts\.localhost|:1355/);
}

assert.match(adminPolicy, /http:\/\/localhost:4322/);
assert.match(adminPolicy, /http:\/\/127\.0\.0\.1:4322/);
assert.doesNotMatch(adminPolicy, /Portless|anipotts\.localhost|1355/);

console.log("local development contract passed");
