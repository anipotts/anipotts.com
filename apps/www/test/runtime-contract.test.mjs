import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RUNTIME_CONTRACT,
  RUNTIME_FEATURES,
  RUNTIME_REQUIRED,
  evaluateRuntimeContract,
} from "../src/lib/runtime-contract.ts";

const RELEASE = "0123456789abcdef0123456789abcdef01234567";
// Synthetic canaries only. None of these is a real credential.
const CANARY = "synthetic-canary-value";

function binding(method, marker = CANARY) {
  return { [method]() {}, marker };
}

function completeEnv(overrides = {}) {
  return {
    ASSETS: binding("fetch"),
    DB: binding("prepare"),
    NEWSLETTER_QUEUE: binding("send"),
    RESEND_WEBHOOK_SECRET: `whsec_${CANARY}`,
    ...overrides,
  };
}

let fresh = 0;
async function loadReporter() {
  fresh += 1;
  const module = await import(
    `../src/lib/runtime-contract.ts?isolate=${fresh}`
  );
  return module.reportRuntimeContract;
}

function sink() {
  const lines = { info: [], warn: [] };
  return {
    lines,
    info: (line) => lines.info.push(line),
    warn: (line) => lines.warn.push(line),
  };
}

test("a complete environment satisfies the contract and every feature", () => {
  const report = evaluateRuntimeContract(completeEnv());
  assert.equal(report.ok, true);
  assert.deepEqual(report.missing, []);
  for (const feature of Object.keys(RUNTIME_FEATURES)) {
    assert.deepEqual(report.features[feature], {
      state: "available",
      missing: [],
    });
  }
});

test("a missing required binding produces the bounded failure", () => {
  for (const assets of [undefined, null, "", CANARY, {}, { fetch: CANARY }]) {
    const report = evaluateRuntimeContract(completeEnv({ ASSETS: assets }));
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, ["ASSETS"]);
    for (const feature of Object.values(report.features)) {
      assert.equal(feature.state, "available");
    }
  }
});

test("feature bindings degrade their feature and never fail the contract", () => {
  const withoutQueue = evaluateRuntimeContract(
    completeEnv({ NEWSLETTER_QUEUE: undefined }),
  );
  assert.equal(withoutQueue.ok, true);
  assert.deepEqual(withoutQueue.features.confirmation_email, {
    state: "unavailable",
    missing: ["NEWSLETTER_QUEUE"],
  });
  assert.equal(withoutQueue.features.database.state, "available");
  assert.equal(withoutQueue.features.resend_webhook.state, "available");

  for (const secret of [undefined, "", "   ", 42, { value: CANARY }]) {
    const report = evaluateRuntimeContract(
      completeEnv({ RESEND_WEBHOOK_SECRET: secret }),
    );
    assert.equal(report.ok, true);
    assert.deepEqual(report.features.resend_webhook, {
      state: "unavailable",
      missing: ["RESEND_WEBHOOK_SECRET"],
    });
    assert.equal(report.features.confirmation_email.state, "available");
  }

  const withoutDatabase = evaluateRuntimeContract(
    completeEnv({ DB: { prepare: CANARY } }),
  );
  assert.equal(withoutDatabase.ok, true);
  assert.deepEqual(withoutDatabase.features, {
    database: { state: "unavailable", missing: ["DB"] },
    confirmation_email: { state: "unavailable", missing: ["DB"] },
    resend_webhook: { state: "unavailable", missing: ["DB"] },
  });
});

test("absent and hostile environments are reported without throwing", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error(`private provider failure ${CANARY}`);
      },
    },
  );
  const throwingBinding = {
    get fetch() {
      throw new Error(`private binding failure ${CANARY}`);
    },
  };
  for (const env of [
    undefined,
    null,
    CANARY,
    42,
    hostile,
    completeEnv({ ASSETS: throwingBinding }),
  ]) {
    const report = evaluateRuntimeContract(env);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, ["ASSETS"]);
    assert.equal(JSON.stringify(report).includes(CANARY), false);
    assert.equal(JSON.stringify(report).includes("private"), false);
  }
});

test("reports contain only contract names and bounded states, never values", () => {
  const names = new Set(Object.keys(RUNTIME_CONTRACT));
  const allowedStrings = new Set([
    ...names,
    ...Object.keys(RUNTIME_FEATURES),
    "available",
    "unavailable",
    "ok",
    "missing",
    "features",
    "state",
  ]);
  const envs = [
    completeEnv({ EXTRA_SECRET: CANARY, RESEND_API_KEY: CANARY }),
    completeEnv({ ASSETS: CANARY, DB: CANARY, NEWSLETTER_QUEUE: CANARY }),
    completeEnv({ RESEND_WEBHOOK_SECRET: { toString: () => CANARY } }),
  ];
  for (const env of envs) {
    const text = JSON.stringify(evaluateRuntimeContract(env));
    assert.equal(text.includes(CANARY), false, text);
    assert.equal(text.includes("EXTRA_SECRET"), false, text);
    assert.equal(text.includes("RESEND_API_KEY"), false, text);
    for (const token of text.match(/"[^"]*"/g) ?? []) {
      assert.ok(allowedStrings.has(JSON.parse(token)), token);
    }
  }
});

test("the reporter logs one line per isolate and never throws", async () => {
  const reportRuntimeContract = await loadReporter();
  const first = sink();
  reportRuntimeContract(completeEnv(), RELEASE, first);
  reportRuntimeContract(completeEnv({ ASSETS: undefined }), RELEASE, first);
  assert.equal(first.lines.warn.length, 0);
  assert.equal(first.lines.info.length, 1);
  assert.deepEqual(JSON.parse(first.lines.info[0]), {
    event: "runtime_contract",
    app: "www",
    entry: "middleware",
    release: RELEASE,
    ok: true,
    missing: [],
    features: {
      database: { state: "available", missing: [] },
      confirmation_email: { state: "available", missing: [] },
      resend_webhook: { state: "available", missing: [] },
    },
  });

  const degradedReporter = await loadReporter();
  const degraded = sink();
  degradedReporter(
    completeEnv({ ASSETS: undefined, RESEND_WEBHOOK_SECRET: undefined }),
    `not-a-sha ${CANARY}`,
    degraded,
  );
  assert.equal(degraded.lines.info.length, 0);
  assert.equal(degraded.lines.warn.length, 1);
  const line = JSON.parse(degraded.lines.warn[0]);
  assert.equal(line.release, "dev");
  assert.equal(line.ok, false);
  assert.deepEqual(line.missing, ["ASSETS"]);
  assert.equal(line.features.resend_webhook.state, "unavailable");
  assert.equal(degraded.lines.warn[0].includes(CANARY), false);

  const throwingReporter = await loadReporter();
  assert.doesNotThrow(() =>
    throwingReporter(completeEnv(), RELEASE, {
      info() {
        throw new Error("sink failure");
      },
      warn() {
        throw new Error("sink failure");
      },
    }),
  );
});

// Every binding name must match wrangler.toml, and every binding wrangler.toml
// declares must be in the closed table. Secrets are set with `wrangler secret
// put`, so they must never appear in the committed config at all.
function wranglerBindings(text) {
  const sections = new Map();
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) {
      section = header[1].trim();
      continue;
    }
    const value = line.match(/^binding\s*=\s*"([^"]+)"$/);
    if (value) {
      sections.set(section, [...(sections.get(section) ?? []), value[1]]);
    }
  }
  return sections;
}

const SOURCE_SECTIONS = {
  assets: "assets",
  d1: "d1_databases",
  queue_producer: "queues.producers",
};

test("the contract matches apps/www/wrangler.toml", () => {
  const wrangler = readFileSync(
    new URL("../wrangler.toml", import.meta.url),
    "utf8",
  );
  const envTypes = readFileSync(
    new URL("../src/env.d.ts", import.meta.url),
    "utf8",
  );
  const declared = wranglerBindings(wrangler);

  for (const [name, { source }] of Object.entries(RUNTIME_CONTRACT)) {
    assert.match(envTypes, new RegExp(`\\b${name}\\??:`), `${name} typed`);
    if (source === "secret") {
      assert.equal(
        wrangler.includes(name),
        false,
        `${name} is a Worker secret and stays out of wrangler.toml`,
      );
      continue;
    }
    const section = SOURCE_SECTIONS[source];
    assert.ok(section, `${name} has a known source`);
    assert.ok(
      (declared.get(section) ?? []).includes(name),
      `${name} is declared under [${section}] in wrangler.toml`,
    );
  }

  for (const section of Object.values(SOURCE_SECTIONS)) {
    for (const name of declared.get(section) ?? []) {
      assert.ok(name in RUNTIME_CONTRACT, `${name} is in the runtime contract`);
    }
  }

  for (const name of RUNTIME_REQUIRED) assert.ok(name in RUNTIME_CONTRACT);
  for (const { needs } of Object.values(RUNTIME_FEATURES)) {
    for (const name of needs) assert.ok(name in RUNTIME_CONTRACT);
  }
});
