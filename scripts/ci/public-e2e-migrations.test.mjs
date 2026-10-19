import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { readPublicE2EMigrations } from "./public-e2e-migrations.mjs";

test("a new 0003 migration joins the ordered public browser database replay", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "public-e2e-migrations-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "README.md"), "Not SQL");
  // Create out of order: replay order must follow filenames, not creation.
  writeFileSync(
    join(directory, "0002_add_schema.sql"),
    "ALTER TABLE publications ADD COLUMN schema_version INTEGER;",
  );
  writeFileSync(
    join(directory, "0001_publications.sql"),
    "CREATE TABLE publications (id TEXT PRIMARY KEY);",
  );
  const initial = readPublicE2EMigrations(directory);
  writeFileSync(
    join(directory, "0003_seed_publication.sql"),
    "INSERT INTO publications (id, schema_version) VALUES ('synthetic', 3);",
  );
  const updated = readPublicE2EMigrations(directory);
  assert.notEqual(updated, initial);
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec(updated);
  assert.equal(
    database.prepare("SELECT schema_version FROM publications").get()
      .schema_version,
    3,
  );
});

test("an empty migration inventory fails before starting the browser server", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "public-e2e-migrations-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(
    () => readPublicE2EMigrations(directory),
    /migrations are missing/,
  );
});

// Exercise the installed runner's real resolution/ownership code. These tests
// start synthetic loopback fixtures only, with no browser, model or Wrangler.
const runnerRoot = new URL("./", import.meta.resolve("e2e"));
const { loadConfigModule } = await import(
  new URL("config/load.js", runnerRoot)
);
const { resolveConfig } = await import(
  new URL("config/resolve.js", runnerRoot)
);
const { allocateAppPorts } = await import(
  new URL("run/app-ports.js", runnerRoot)
);
const { declaredCommands } = await import(
  new URL("run/declared-processes.js", runnerRoot)
);
const { ManagedProcess } = await import(
  new URL("run/managed-process.js", runnerRoot)
);
const { publicE2EWorkerArgs } = await import("./public-e2e-server.mjs");
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const configPath = join(projectRoot, "e2e.www.config.ts");

async function publicConfig(port) {
  const prior = process.env.WWW_E2E_PORT;
  if (port === undefined) delete process.env.WWW_E2E_PORT;
  else process.env.WWW_E2E_PORT = port;
  try {
    const raw = await loadConfigModule(configPath);
    return await allocateAppPorts(
      resolveConfig(raw, {
        configPath,
        projectRoot,
        env: { CI: "1" },
      }),
    );
  } finally {
    if (prior === undefined) delete process.env.WWW_E2E_PORT;
    else process.env.WWW_E2E_PORT = prior;
  }
}

test("both real browser targets resolve to one command and one explicit port without reuse", async () => {
  for (const [override, expected] of [
    [undefined, 18123],
    ["18234", 18234],
  ]) {
    const config = await publicConfig(override);
    assert.equal(config.targets.length, 2);
    const commands = declaredCommands(config.targets);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].readyUrl, `http://127.0.0.1:${expected}/`);
    assert.deepEqual(commands[0].command.args, [
      "scripts/ci/public-e2e-server.mjs",
      String(expected),
    ]);
    assert.equal(commands[0].command.reuseExisting, false);
    assert.deepEqual(config.ports, {}); // No release-before-seeding reservation.
    assert.equal(new Set(config.targets.map((t) => t.app.readyUrl)).size, 1);
  }
});

test("local port overrides reject malformed or privileged ports before process launch", async () => {
  for (const port of [
    "",
    "0",
    "1023",
    "65536",
    "18123.5",
    " 18123",
    "0x46cb",
    "18123x",
  ])
    await assert.rejects(publicConfig(port), /WWW_E2E_PORT must be an integer/);
  const args = publicE2EWorkerArgs({
    port: 18123,
    config: "synthetic.json",
    state: "synthetic-state",
  });
  assert.equal(args[args.indexOf("--port") + 1], "18123");
  assert.equal(args[args.indexOf("--inspector-port") + 1], "0");
  assert.equal(args.includes("--local"), true);
  for (const port of [0, 1023, 65536, 18123.5, NaN])
    assert.throws(() => publicE2EWorkerArgs({ port }), /pass a local port/);
});

async function listening(server, port = 0) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function closeServer(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
function fixtureDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "public-e2e-process-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("runner refuses an occupied port without spawning or terminating the foreign listener", async (t) => {
  const directory = fixtureDirectory(t);
  const marker = join(directory, "unexpected-start");
  const foreign = createServer((_req, res) => res.end("foreign-owner"));
  const port = await listening(foreign);
  t.after(() => closeServer(foreign));
  const managed = new ManagedProcess(
    "synthetic occupied port",
    {
      executable: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`,
      ],
      reuseExisting: false,
      startupTimeout: 1000,
    },
    projectRoot,
    { readyUrl: `http://127.0.0.1:${port}/` },
    { ci: true },
  );
  await assert.rejects(
    managed.start(new AbortController().signal),
    (error) => error.code === "APP_ALREADY_RUNNING",
  );
  await managed.stop();
  assert.equal(existsSync(marker), false);
  assert.equal(foreign.listening, true);
  assert.equal(
    await (await fetch(`http://127.0.0.1:${port}/`)).text(),
    "foreign-owner",
  );
});

test("runner owns the wrapper, Worker and descendants; shutdown waits for child close", async (t) => {
  const directory = fixtureDirectory(t);
  const reservation = createServer();
  const port = await listening(reservation);
  await closeServer(reservation);
  const pids = join(directory, "pids.json");
  const finished = join(directory, "finished");
  const grandchild = join(directory, "grandchild.mjs");
  writeFileSync(
    grandchild,
    `setInterval(() => {}, 1000);
`,
  );
  const worker = join(directory, "worker.mjs");
  writeFileSync(
    worker,
    `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    import { createServer } from 'node:http';
    const child = spawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: 'ignore' });
    writeFileSync(${JSON.stringify(pids)}, JSON.stringify([process.pid, child.pid]));
    const server = createServer((_req, res) => res.end('synthetic'));
    server.listen(${port}, '127.0.0.1');
    let stopping = false;
    function stop() {
      if (stopping) return; stopping = true;
      child.kill('SIGTERM');
      child.once('close', () => server.close(() => setTimeout(() => process.exit(0), 150)));
    }
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  `,
  );
  const wrapper = join(directory, "wrapper.mjs");
  const implementation = new URL("./public-e2e-server.mjs", import.meta.url)
    .href;
  writeFileSync(
    wrapper,
    `
    import { servePublicE2EWorker } from ${JSON.stringify(implementation)};
    import { writeFileSync } from 'node:fs';
    const code = await servePublicE2EWorker({ cli: ${JSON.stringify(worker)}, port: ${port},
      config: 'synthetic.json', state: 'state', temporary: ${JSON.stringify(directory)}, env: process.env });
    writeFileSync(${JSON.stringify(finished)}, String(code));
  `,
  );
  const managed = new ManagedProcess(
    "synthetic public worker",
    {
      executable: process.execPath,
      args: [wrapper],
      reuseExisting: false,
      startupTimeout: 5000,
      shutdownTimeout: 3000,
      log: join(directory, "server.log"),
    },
    projectRoot,
    { readyUrl: `http://127.0.0.1:${port}/` },
    { ci: true },
  );
  t.after(() => managed.stop());
  await managed.start(new AbortController().signal);
  const childPids = JSON.parse(readFileSync(pids, "utf8"));
  await managed.stop();
  assert.equal(readFileSync(finished, "utf8"), "0");
  for (const pid of childPids) {
    let alive = true;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
        break;
      }
      await delay(25);
    }
    assert.equal(alive, false, `owned child ${pid} survived shutdown`);
  }
  const log = readFileSync(join(directory, "server.log"), "utf8");
  assert.match(
    log,
    new RegExp(
      `\\[www-e2e\\] pid=\\d+ http=127\\.0\\.0\\.1:${port} inspector=0`,
    ),
  );
});

function setupFixture(
  t,
  { hold, fail, launch = true, ignoreTermination = false } = {},
) {
  const directory = fixtureDirectory(t);
  const events = join(directory, "events.jsonl");
  const held = join(directory, "held.json");
  const finished = join(directory, "finished.json");
  const closed = join(directory, "child-closed");
  const seedIgnored = join(directory, "seed-ignored-term");
  const grandchildIgnored = join(directory, "grandchild-ignored-term");
  const migrations = join(
    directory,
    "apps/admin/migrations/content-publication",
  );
  mkdirSync(migrations, { recursive: true });
  writeFileSync(
    join(migrations, "0001_fixture.sql"),
    "CREATE TABLE synthetic (id TEXT);\n",
  );
  const seedDir = join(directory, "scripts/content");
  mkdirSync(seedDir, { recursive: true });
  const grandchild = join(directory, "grandchild.mjs");
  writeFileSync(
    grandchild,
    `
    import { writeFileSync } from 'node:fs';
    if (${ignoreTermination}) process.on('SIGTERM', () => writeFileSync(${JSON.stringify(grandchildIgnored)}, 'ignored'));
    process.send('ready'); setInterval(() => {}, 1000);
    `,
  );
  const cli = join(directory, "cli.mjs");
  writeFileSync(
    cli,
    `
    import { spawn } from 'node:child_process';
    import { once } from 'node:events';
    import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
    import { dirname, join } from 'node:path';
    const args = process.argv.slice(2);
    const phase = args[0] === 'd1' ? 'migration' : args[0] === 'dev' ? 'serve' : args.includes('--upload-media') ? 'upload' : 'apply';
    const state = args[args.indexOf('--persist-to') + 1];
    const temporary = dirname(state);
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, 'synthetic-state'), 'temporary synthetic D1/R2 state');
    appendFileSync(${JSON.stringify(events)}, JSON.stringify({ phase, args, temporary }) + ${JSON.stringify("\n")});
    if (phase === ${JSON.stringify(hold)}) {
      const child = spawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      let stopping = false;
      function stop() {
        if (${ignoreTermination}) { writeFileSync(${JSON.stringify(seedIgnored)}, 'ignored'); return; }
        if (stopping) return; stopping = true;
        child.once('close', () => {
          writeFileSync(${JSON.stringify(closed)}, String(existsSync(temporary)));
          setTimeout(() => process.exit(0), 75);
        });
        child.kill('SIGTERM');
      }
      process.on('SIGTERM', stop); process.on('SIGINT', stop);
      await once(child, 'message');
      writeFileSync(${JSON.stringify(held)}, JSON.stringify({ pids: [process.pid, child.pid], temporary }));
    } else if (phase === ${JSON.stringify(fail)}) { process.exitCode = 17; }
  `,
  );
  // Both normal seed invocations use the production argument construction and
  // execute the synthetic CLI, without adding test flags to the real harness.
  writeFileSync(
    join(seedDir, "seed-content-d1.mjs"),
    `import ${JSON.stringify(pathToFileURL(cli).href)};\n`,
  );
  const wrapper = join(directory, "wrapper.mjs");
  const implementation = new URL("./public-e2e-server.mjs", import.meta.url)
    .href;
  writeFileSync(
    wrapper,
    `
    import { runPublicE2EServer } from ${JSON.stringify(implementation)};
    import { writeFileSync } from 'node:fs';
    try {
      const code = await runPublicE2EServer({ port: 18123, root: ${JSON.stringify(directory)}, cli: ${JSON.stringify(cli)} });
      writeFileSync(${JSON.stringify(finished)}, JSON.stringify({ code }));
    } catch (error) {
      writeFileSync(${JSON.stringify(finished)}, JSON.stringify({ error: error.message }));
      process.exitCode = 1;
    }
  `,
  );
  const child = launch
    ? spawn(process.execPath, [wrapper], { stdio: "ignore" })
    : undefined;
  const exited = child ? once(child, "close") : undefined;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([exited, delay(2000)]);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
    // Preserve cleanup even when an assertion fails in this lifecycle test.
    if (existsSync(held)) {
      const record = JSON.parse(readFileSync(held, "utf8"));
      try {
        process.kill(-record.pids[0], "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      rmSync(record.temporary, { recursive: true, force: true });
    }
  });
  return {
    child,
    exited,
    events,
    held,
    finished,
    closed,
    seedIgnored,
    grandchildIgnored,
    wrapper,
    directory,
  };
}
async function waitForFixture(path, fixture) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
    if (existsSync(fixture.finished))
      assert.fail(readFileSync(fixture.finished, "utf8"));
    await delay(20);
  }
  assert.fail(`synthetic child did not reach ${path}`);
}
async function closedFixture(fixture) {
  const result = await Promise.race([
    fixture.exited,
    delay(4000, undefined, { ref: false }).then(() => "timeout"),
  ]);
  assert.notEqual(result, "timeout", "owned wrapper failed to close");
  return result;
}

for (const phase of ["migration", "upload", "apply"]) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    test(`cancellation during ${phase} via ${signal} closes descendants before removing temporary state`, async (t) => {
      const fixture = setupFixture(t, { hold: phase });
      const record = await waitForFixture(fixture.held, fixture);
      // Signal only the wrapper, not the seed process group. The harness must
      // forward cancellation and reap both owned descendants itself.
      fixture.child.kill(signal);
      assert.deepEqual(await closedFixture(fixture), [0, null]);
      assert.deepEqual(JSON.parse(readFileSync(fixture.finished, "utf8")), {
        code: 0,
      });
      assert.equal(
        readFileSync(fixture.closed, "utf8"),
        "true",
        "state removed before delayed child close",
      );
      assert.equal(existsSync(record.temporary), false);
      const phases = readFileSync(fixture.events, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).phase);
      assert.deepEqual(
        phases,
        ["migration", "upload", "apply"].slice(
          0,
          ["migration", "upload", "apply"].indexOf(phase) + 1,
        ),
      );
      for (const pid of record.pids)
        assert.throws(
          () => process.kill(pid, 0),
          (error) => error.code === "ESRCH",
        );
    });
  }
}

test("successful setup preserves migration, media upload, apply and serve order and local seed arguments", async (t) => {
  const fixture = setupFixture(t);
  assert.deepEqual(await closedFixture(fixture), [0, null]);
  const events = readFileSync(fixture.events, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((event) => event.phase),
    ["migration", "upload", "apply", "serve"],
  );
  for (const event of events) {
    assert.equal(event.args.includes("--local"), true);
    assert.equal(existsSync(event.temporary), false);
    assert.equal(event.temporary, events[0].temporary);
  }
  assert.equal(events[0].args.includes("--file"), true);
  assert.equal(events[1].args.includes("--upload-media"), true);
  assert.equal(events[2].args.includes("--media-ready"), true);
  assert.equal(
    events[2].args[events[2].args.indexOf("--published-at") + 1],
    "2026-09-21T00:00:00.000Z",
  );
  assert.equal(events[3].args[events[3].args.indexOf("--port") + 1], "18123");
  assert.equal(
    events[3].args[events[3].args.indexOf("--inspector-port") + 1],
    "0",
  );
});

test("failed media seeding closes the wrapper and removes state without applying or serving", async (t) => {
  const fixture = setupFixture(t, { fail: "upload" });
  assert.deepEqual(await closedFixture(fixture), [1, null]);
  const events = readFileSync(fixture.events, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((event) => event.phase),
    ["migration", "upload"],
  );
  assert.equal(existsSync(events[0].temporary), false);
  assert.match(
    JSON.parse(readFileSync(fixture.finished, "utf8")).error,
    /failed/,
  );
});

test("actual runner stop force-closes a SIGTERM-ignoring setup group before its default shutdown budget", async (t) => {
  const fixture = setupFixture(t, {
    hold: "upload",
    launch: false,
    ignoreTermination: true,
  });
  const managed = new ManagedProcess(
    "synthetic uncooperative setup",
    {
      executable: process.execPath,
      args: [fixture.wrapper],
      startupTimeout: 20_000,
      // Leave shutdownTimeout unset: exercise the installed runner's 10s default.
      log: join(fixture.directory, "runner.log"),
    },
    projectRoot,
    {},
    { ci: true },
  );
  const startup = managed.start(new AbortController().signal).then(
    () => undefined,
    (error) => error,
  );
  let record;
  try {
    record = await waitForFixture(fixture.held, fixture);
    const start = performance.now();
    await managed.stop();
    const elapsed = performance.now() - start;
    assert.equal(await startup, undefined);
    assert.ok(
      elapsed >= 4_500,
      `forced escalation was not exercised (${elapsed}ms)`,
    );
    assert.ok(
      elapsed < 10_000,
      `shutdown exceeded runner budget (${elapsed}ms)`,
    );
    assert.equal(readFileSync(fixture.seedIgnored, "utf8"), "ignored");
    assert.equal(readFileSync(fixture.grandchildIgnored, "utf8"), "ignored");
    assert.deepEqual(JSON.parse(readFileSync(fixture.finished, "utf8")), {
      code: 0,
    });
    assert.equal(existsSync(record.temporary), false);
    assert.equal(
      existsSync(fixture.closed),
      false,
      "cooperative shutdown unexpectedly ran",
    );
    for (const pid of record.pids)
      assert.throws(
        () => process.kill(pid, 0),
        (error) => error.code === "ESRCH",
      );
    const phases = readFileSync(fixture.events, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).phase);
    assert.deepEqual(phases, ["migration", "upload"]);
    t.diagnostic(
      `owned setup group forced closed in ${Math.round(elapsed)}ms (runner budget 10000ms)`,
    );
  } finally {
    await managed.stop();
    // Only fixture-owned IDs are eligible for fallback cleanup, including when
    // a failing assertion leaves the wrapper or detached setup group alive.
    record ??= existsSync(fixture.held)
      ? JSON.parse(readFileSync(fixture.held, "utf8"))
      : undefined;
    if (record) {
      try {
        process.kill(-record.pids[0], "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      rmSync(record.temporary, { recursive: true, force: true });
    }
    await startup;
  }
});
