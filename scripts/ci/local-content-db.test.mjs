import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PROBE_SQL,
  VERSION_SQL,
  bootstrapPlan,
  ensureLocalContentDatabase,
  localArgs,
} from "../dev/local-content-db.mjs";

test("the plan migrates and seeds only what a local database lacks", () => {
  assert.deepEqual(bootstrapPlan(undefined, null), {
    migrations: ["0001", "0002"],
    seed: true,
  });
  assert.deepEqual(bootstrapPlan({ inventory: 1, schema_version: 0 }, 3), {
    migrations: ["0002"],
    seed: false,
  });
  assert.deepEqual(bootstrapPlan({ inventory: 1, schema_version: 1 }, 0), {
    migrations: [],
    seed: true,
  });
  assert.deepEqual(bootstrapPlan({ inventory: 1, schema_version: 1 }, 1), {
    migrations: [],
    seed: false,
  });
});

test("wrangler arguments are always local and never remote", () => {
  assert.deepEqual(localArgs(["d1", "execute", "x"], "/state"), [
    "d1",
    "execute",
    "x",
    "--local",
    "--persist-to",
    "/state",
  ]);
  for (const flag of ["--remote", "--env"])
    assert.throws(() => localArgs(["d1", flag], "/state"), /never runs/);
});

function recorder(results) {
  const calls = [];
  const run = (_node, args) => {
    calls.push(args);
    const sql = args[args.indexOf("--command") + 1];
    const rows = args.includes("--command") ? results[sql] : undefined;
    return {
      status: 0,
      stdout: rows ? JSON.stringify([{ results: rows }]) : "",
    };
  };
  return { calls, run };
}

test("a fresh local database is migrated and seeded, all locally", () => {
  const { calls, run } = recorder({
    [PROBE_SQL]: [{ inventory: 0, schema_version: 0 }],
  });
  const lines = [];
  const plan = ensureLocalContentDatabase({
    appDir: "/tmp/app",
    run,
    log: (line) => lines.push(line),
  });
  assert.deepEqual(plan, { migrations: ["0001", "0002"], seed: true });
  // probe, two migrations, then the two seed steps
  assert.equal(calls.length, 5);
  for (const args of calls) {
    assert.ok(args.includes("--local"), args.join(" "));
    assert.equal(args.includes("--remote"), false, args.join(" "));
    assert.equal(
      args[args.indexOf("--persist-to") + 1],
      "/tmp/app/.wrangler/state",
    );
  }
  assert.match(lines[0], /bootstrapping/);
});

test("a ready local database is only probed", () => {
  const { calls, run } = recorder({
    [PROBE_SQL]: [{ inventory: 1, schema_version: 1 }],
    [VERSION_SQL]: [{ version: 1 }],
  });
  const lines = [];
  ensureLocalContentDatabase({
    appDir: "/tmp/app",
    run,
    log: (line) => lines.push(line),
  });
  assert.equal(calls.length, 2);
  assert.match(lines[0], /ready/);
});

test("dev bindings stay local: no remote bindings in either app", () => {
  for (const app of ["www", "admin"]) {
    const config = readFileSync(`apps/${app}/astro.config.mjs`, "utf8");
    assert.match(config, /remoteBindings: false/, `${app} astro.config.mjs`);
    const toml = readFileSync(`apps/${app}/wrangler.toml`, "utf8")
      .split("\n")
      .map((line) => line.replace(/#.*$/, ""))
      .join("\n");
    assert.doesNotMatch(toml, /\bremote\s*=\s*true/, `${app} wrangler.toml`);
  }
  const manager = readFileSync("scripts/dev/dev-servers.mjs", "utf8");
  assert.match(manager, /ensureLocalContentDatabase\(\{ appDir: app\.cwd \}\)/);
});
