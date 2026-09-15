import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { LOCAL_OWNER_MARKERS, verifyBuild } from "./admin-local-owner-leak.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "admin-local-owner-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test("a deployable bundle passes only without every local owner marker", () => {
  const clean = fixture({
    "_worker.js/index.js": "export default {};",
    "_astro/app.js": 'const env = {"MODE": "production"};',
  });
  const leaked = fixture({
    "_worker.js/chunks/middleware.mjs":
      'const email = "local-owner@localhost";',
    "_astro/editorial.js": 'jsx("div", { "data-admin-local-owner": "true" })',
  });
  try {
    assert.equal(verifyBuild(clean, "absent").ok, true);
    assert.equal(verifyBuild(clean, "present").ok, false);
    const result = verifyBuild(leaked, "absent");
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems.sort(), [
      "_astro/editorial.js contains local owner marker data-admin-local-owner",
      "_worker.js/chunks/middleware.mjs contains local owner marker local-owner@localhost",
    ]);
    assert.equal(verifyBuild(leaked, "present").ok, true);
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(leaked, { recursive: true, force: true });
  }
});

test("any surviving flag reference fails both build kinds", () => {
  for (const source of [
    'if (process.env.ADMIN_LOCAL_OWNER === "1") {}',
    "if (__LOCAL_OWNER_BUILD__) {}",
  ]) {
    const deployable = fixture({ "_worker.js/index.js": source });
    const local = fixture({
      "_worker.js/index.js": `${source}\n${LOCAL_OWNER_MARKERS.join("\n")}`,
    });
    try {
      assert.deepEqual(verifyBuild(deployable, "absent").problems, [
        "_worker.js/index.js references the local owner flag at runtime",
      ]);
      assert.deepEqual(verifyBuild(local, "present").problems, [
        "_worker.js/index.js references the local owner flag at runtime",
      ]);
    } finally {
      rmSync(deployable, { recursive: true, force: true });
      rmSync(local, { recursive: true, force: true });
    }
  }
});

test("a missing build fails unless the caller allows an unbuilt target", () => {
  const missing = join(tmpdir(), "admin-local-owner-missing-build");
  assert.equal(verifyBuild(missing, "absent").ok, false);
  assert.deepEqual(verifyBuild(missing, "absent", { allowMissing: true }), {
    ok: true,
    skipped: true,
    problems: [],
  });
  const empty = fixture({});
  try {
    assert.equal(verifyBuild(empty, "absent").ok, false);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("every release job refuses the flag and admin scans its exact bundle", () => {
  const deploy = parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const guard = "Refuse the local owner build flag";
  for (const [name, job] of Object.entries(deploy.jobs)) {
    if (name === "release-summary") continue;
    assert.equal(job.steps[0].name, guard, `${name} must refuse first`);
    assert.equal(job.steps[0].if, undefined, `${name} guard is unconditional`);
    assert.match(job.steps[0].run, /ADMIN_LOCAL_OWNER\+x/);
    assert.match(job.steps[0].run, /exit 1/);
  }
  const admin = deploy.jobs["deploy-admin"].steps;
  const build = admin.findIndex((step) => step.name === "Build admin");
  const scan = admin.findIndex(
    (step) => step.name === "Verify the admin bundle excludes the local owner",
  );
  const release = admin.findIndex(
    (step) => step.name === "Deploy to Cloudflare Workers",
  );
  assert.ok(build >= 0 && build < scan && scan < release);
  assert.equal(
    admin[scan].run,
    "node scripts/ci/admin-local-owner-leak.mjs --expect absent apps/admin/dist",
  );
  assert.equal(admin[build].env.ADMIN_LOCAL_OWNER, undefined);

  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.ok(
    ci.includes(
      "node scripts/ci/admin-local-owner-leak.mjs --expect absent --allow-missing apps/admin/dist",
    ),
    "pull request validation must scan any Admin build it produced",
  );
  assert.ok(
    ci.indexOf("admin-local-owner-leak.mjs") >
      ci.indexOf("pnpm turbo build --affected"),
  );
});

test("the flag is a local build-time constant that release builds never see", () => {
  const config = readFileSync("apps/admin/astro.config.mjs", "utf8");
  assert.ok(
    config.includes("__LOCAL_OWNER_BUILD__: JSON.stringify(adminLocalOwner)"),
  );
  assert.ok(config.includes('process.env.GITHUB_ACTIONS === "true"'));
  assert.ok(config.includes('outDir: "./.local/local-owner-dist"'));
  assert.equal(config.includes("import.meta.env.ADMIN_LOCAL_OWNER"), false);

  // Turbo strict environment mode drops unlisted variables from release builds.
  const turbo = JSON.parse(readFileSync("turbo.json", "utf8"));
  assert.equal(turbo.envMode ?? "strict", "strict");
  assert.equal(
    turbo.tasks["@anipotts/admin#build"].env.includes("ADMIN_LOCAL_OWNER"),
    false,
  );
  assert.equal(
    (turbo.globalEnv ?? []).includes("ADMIN_LOCAL_OWNER") ||
      (turbo.globalPassThroughEnv ?? []).includes("ADMIN_LOCAL_OWNER"),
    false,
  );
});

// Owner mode trusts request headers and never sees the peer address, so the
// dev server it runs in must never listen beyond loopback.
const loopbackGuard = () => import("../dev/admin-local-owner-host.mjs");

test("only a loopback dev server host counts as loopback", async () => {
  const { isLoopbackDevHost } = await loopbackGuard();
  // undefined and false are Vite's own localhost default.
  for (const host of [
    undefined,
    false,
    "localhost",
    "LOCALHOST",
    "127.0.0.1",
    "127.0.0.2",
    "127.255.255.254",
    "::1",
    "[::1]",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isLoopbackDevHost(host), true, JSON.stringify(host));
  }
  for (const host of [
    true,
    null,
    0,
    "",
    " ",
    "0.0.0.0",
    "::",
    "[::]",
    "0:0:0:0:0:0:0:0",
    "192.168.1.20",
    "10.0.0.5",
    "172.16.4.2",
    "100.101.102.103",
    "fe80::1",
    "::ffff:192.168.1.20",
    "127.0.0.256",
    "127.1",
    "0177.0.0.1",
    "admin.anipotts.localhost",
    "localhost.example.com",
    "example.com",
    ["127.0.0.1"],
  ]) {
    assert.equal(isLoopbackDevHost(host), false, JSON.stringify(host));
  }
});

test("a local owner dev server refuses a non-loopback host before it listens", async () => {
  const { localOwnerLoopbackGuard } = await loopbackGuard();
  const guard = localOwnerLoopbackGuard({ enabled: true });
  const configSetup = guard.hooks["astro:config:setup"];
  const serverSetup = guard.hooks["astro:server:setup"];
  const refusal = (error) =>
    error instanceof Error &&
    error.message.includes("ADMIN_LOCAL_OWNER=1") &&
    error.message.includes("loopback");

  // `astro dev --host` is true; `--host 0.0.0.0`, `::` and a LAN address
  // arrive as strings. Astro merges CLI flags before config setup runs.
  for (const host of [true, "0.0.0.0", "::", "192.168.1.20", ""]) {
    for (const command of ["dev", "preview"]) {
      assert.throws(
        () => configSetup({ command, config: { server: { host } } }),
        refusal,
        `${command} ${JSON.stringify(host)}`,
      );
    }
    // Vite's resolved host catches a vite.server.host or plugin override.
    assert.throws(
      () => serverSetup({ server: { config: { server: { host } } } }),
      refusal,
      `vite ${JSON.stringify(host)}`,
    );
  }

  // Builds never listen. The dev server manager and owner scripts pass 127.0.0.1.
  for (const command of ["build", "sync"]) {
    configSetup({ command, config: { server: { host: "0.0.0.0" } } });
  }
  configSetup({ command: "dev", config: { server: { host: "127.0.0.1" } } });
  serverSetup({ server: { config: { server: { host: "127.0.0.1" } } } });
});

test("without the flag the loopback guard never interferes", async () => {
  const { localOwnerLoopbackGuard } = await loopbackGuard();
  const guard = localOwnerLoopbackGuard({ enabled: false });
  for (const host of [true, "0.0.0.0", "192.168.1.20"]) {
    guard.hooks["astro:config:setup"]({
      command: "dev",
      config: { server: { host } },
    });
    guard.hooks["astro:server:setup"]({
      server: { config: { server: { host } } },
    });
  }
  assert.throws(() => localOwnerLoopbackGuard({ enabled: "1" }), /boolean/);
});

test("Admin installs the loopback guard after every other integration", () => {
  const config = readFileSync("apps/admin/astro.config.mjs", "utf8");
  const guard = config.indexOf(
    "localOwnerLoopbackGuard({ enabled: adminLocalOwner })",
  );
  assert.ok(guard > 0, "astro.config.mjs must install the loopback guard");
  assert.ok(guard > config.indexOf("icon({ include:"));
  assert.ok(config.indexOf("],", guard) < config.indexOf("server: {", guard));
  assert.ok(config.includes('host: "127.0.0.1"'));
});
