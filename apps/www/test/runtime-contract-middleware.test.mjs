import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Compile the real middleware and contract modules, substituting only Astro's
// virtual module and the shared site config. Each load is a fresh isolate.
const ts = createRequire(import.meta.url)("typescript");
const RELEASE = "0123456789abcdef0123456789abcdef01234567";
const CANARY = "synthetic-canary-value";

function compile(file, replacements, imports, console) {
  let source = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    console,
    URL,
    Response,
    require(name) {
      if (!(name in imports))
        throw new Error(`unexpected middleware dependency: ${name}`);
      return imports[name];
    },
  };
  runInNewContext(output, context);
  return context.exports;
}

function loadMiddleware({ dev = false } = {}) {
  const lines = { info: [], warn: [], error: [] };
  const console = {
    info: (line) => lines.info.push(String(line)),
    warn: (line) => lines.warn.push(String(line)),
    error: (line) => lines.error.push(String(line)),
    log: (line) => lines.info.push(String(line)),
  };
  const contract = compile("../src/lib/runtime-contract.ts", [], {}, console);
  const headers = compile("../src/lib/security-headers.ts", [], {}, console);
  const { onRequest } = compile(
    "../src/middleware.ts",
    [
      ["import.meta.env.DEV", JSON.stringify(dev)],
      ["import.meta.env.PUBLIC_RELEASE_SHA", JSON.stringify(RELEASE)],
    ],
    {
      "astro:middleware": { defineMiddleware: (handler) => handler },
      "@anipotts/content/public": {
        siteConfig: {
          newsletterUrl: "https://news.anipotts.com",
          adminUrl: "https://admin.anipotts.com",
        },
      },
      "./lib/runtime-contract": contract,
      "./lib/security-headers": headers,
    },
    console,
  );
  return { onRequest, lines };
}

function context(path, { env, prerendered = false, method = "GET" } = {}) {
  const url = new URL(path, "https://anipotts.com");
  const locals = {};
  let runtimeReads = 0;
  Object.defineProperty(locals, "runtime", {
    get() {
      runtimeReads += 1;
      return { env };
    },
  });
  return {
    get runtimeReads() {
      return runtimeReads;
    },
    url,
    request: new Request(url, { method }),
    isPrerendered: prerendered,
    locals,
    redirect: (location, status) =>
      new Response(null, { status, headers: { location } }),
  };
}

const next = async () =>
  new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("dynamic routes report the contract once per isolate without blocking", async () => {
  const { onRequest, lines } = loadMiddleware();
  const env = {
    DB: { prepare() {} },
    RESEND_WEBHOOK_SECRET: `whsec_${CANARY}`,
  };
  const health = await onRequest(context("/api/health", { env }), next);
  assert.equal(health.status, 200, "a missing binding never returns a 503");
  assert.equal(lines.warn.length, 1);
  assert.equal(lines.info.length, 0);
  const line = JSON.parse(lines.warn[0]);
  assert.equal(line.event, "runtime_contract");
  assert.equal(line.app, "www");
  assert.equal(line.release, RELEASE);
  assert.equal(line.ok, false);
  assert.deepEqual(line.missing, ["ASSETS"]);
  assert.deepEqual(line.features.confirmation_email.missing, [
    "NEWSLETTER_QUEUE",
  ]);
  assert.equal(lines.warn[0].includes(CANARY), false);

  const redirect = await onRequest(context("/thoughts/example", { env }), next);
  assert.equal(redirect.status, 301);
  const second = await onRequest(context("/api/search", { env }), next);
  assert.equal(second.status, 200);
  assert.equal(lines.warn.length + lines.info.length, 1);
  assert.deepEqual(lines.error, []);
});

test("the report is logged before a page request needs the missing binding", async () => {
  const { onRequest, lines } = loadMiddleware();
  // Page requests already fail without ASSETS; the contract adds no new status.
  await assert.rejects(onRequest(context("/work", { env: {} }), next));
  assert.equal(lines.warn.length, 1);
  assert.deepEqual(JSON.parse(lines.warn[0]).missing, ["ASSETS"]);
});

test("prerendered pages and dev skip the contract report", async () => {
  const prerendered = loadMiddleware();
  const page = context("/api/health", { prerendered: true });
  assert.equal((await prerendered.onRequest(page, next)).status, 200);
  assert.equal(page.runtimeReads, 0, "prerendering never reads runtime env");
  assert.equal(
    prerendered.lines.warn.length + prerendered.lines.info.length,
    0,
  );

  const dev = loadMiddleware({ dev: true });
  const local = context("/api/health", {});
  assert.equal((await dev.onRequest(local, next)).status, 200);
  assert.equal(local.runtimeReads, 0, "dev never reads runtime env");
  assert.equal(dev.lines.warn.length + dev.lines.info.length, 0);
});

test("a complete environment logs one info line", async () => {
  const { onRequest, lines } = loadMiddleware();
  const env = {
    ASSETS: {
      async fetch() {
        return new Response("not found", { status: 404 });
      },
    },
    DB: { prepare() {} },
    NEWSLETTER_QUEUE: { send() {} },
    RESEND_WEBHOOK_SECRET: `whsec_${CANARY}`,
  };
  const page = await onRequest(context("/missing-page", { env }), next);
  assert.equal(page.status, 200);
  await onRequest(context("/api/health", { env }), next);
  assert.equal(lines.warn.length, 0);
  assert.equal(lines.info.length, 1);
  assert.equal(JSON.parse(lines.info[0]).ok, true);
  assert.equal(lines.info[0].includes(CANARY), false);
});
