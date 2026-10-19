import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
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
