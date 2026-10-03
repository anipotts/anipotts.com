import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const ts = createRequire(import.meta.url)("typescript");

function compile(file, imports, dev = false) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
    .replaceAll("import.meta.env.DEV", JSON.stringify(dev))
    .replaceAll("import.meta.env.PUBLIC_RELEASE_SHA", '"test"');
  const context = {
    exports: {},
    URL,
    Response,
    require(name) {
      assert.ok(name in imports, `unexpected dependency: ${name}`);
      return imports[name];
    },
  };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}

function middleware(dev) {
  return compile(
    "../src/middleware.ts",
    {
      "astro:middleware": { defineMiddleware: (handler) => handler },
      "@anipotts/content/public": {
        siteConfig: {
          newsletterUrl: "https://news.anipotts.com",
          adminUrl: "https://admin.anipotts.com",
        },
      },
      "./lib/content-paths": compile("../src/lib/content-paths.ts", {}),
      "./lib/runtime-contract": { reportRuntimeContract() {} },
      "./lib/runtime-env": {
        runtimeEnv: (locals) => locals.env,
        executionContext: () => undefined,
      },
      "./lib/security-headers": compile("../src/lib/security-headers.ts", {}),
      "./lib/static-assets": {},
      "./lib/published-runtime": {
        publicContentContext() {
          assert.fail("the public entry must not read CMS or private data");
        },
      },
    },
    dev,
  ).onRequest;
}

function context(path, { prerendered = false, assetStatus = 404 } = {}) {
  const url = new URL(path, "https://anipotts.com");
  return {
    url,
    request: new Request(url),
    isPrerendered: prerendered,
    locals: {
      env: {
        ASSETS: {
          fetch: async (request) => {
            assert.equal(new URL(request.url).origin, url.origin);
            return new Response("public entry", { status: assetStatus });
          },
        },
      },
    },
    redirect: (location, status) =>
      new Response(null, { status, headers: { location } }),
  };
}

test("the entry renders on the public origin in dev, prerender and deployment", async () => {
  for (const mode of [
    { dev: true },
    { dev: false, prerendered: true },
    { dev: false, assetStatus: 200 },
    { dev: false, assetStatus: 404 },
  ]) {
    for (const path of ["/admin", "/admin?theme=dark"]) {
      const response = await middleware(mode.dev)(
        context(path, mode),
        async () => new Response("public entry"),
      );
      assert.equal(response.status, 200, `${path}: ${JSON.stringify(mode)}`);
      assert.equal(response.headers.has("location"), false);
      assert.equal(await response.text(), "public entry");
    }
  }
});

test("the entry trailing slash canonicalizes without crossing origins", async () => {
  for (const dev of [false, true]) {
    const response = await middleware(dev)(context("/admin/?theme=dark"), () =>
      assert.fail("canonical redirect must finish before rendering"),
    );
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "/admin?theme=dark");
  }
});

test("legacy deep links retain their protected destination and query", async () => {
  for (const dev of [false, true]) {
    const origin = dev ? "http://localhost:4311" : "https://admin.anipotts.com";
    for (const path of [
      "/content",
      "/auth/logout?theme=light",
      "/observability/status",
    ]) {
      const response = await middleware(dev)(context(`/admin${path}`), () =>
        assert.fail("deep admin links must not render on the public app"),
      );
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), `${origin}${path}`);
    }
  }
});

test("ambiguous entry paths retain the canonical path guard", async () => {
  for (const path of ["/admin%2f", "/admin%252f", "/admin%5c"]) {
    const response = await middleware(true)(context(path), () =>
      assert.fail("ambiguous paths must not render"),
    );
    assert.equal(response.status, 400, path);
  }
});
