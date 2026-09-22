#!/usr/bin/env node

import assert from "node:assert/strict";
import { SECURITY_HEADERS } from "../../apps/www/src/lib/security-headers.ts";
import { smokeRelease } from "./release-smoke.mjs";
import { activeVersion, previousReleaseSha } from "./worker-version.mjs";

const expectedSha = "b".repeat(40);
const smokeIdentity = {
  ADMIN_CI_ACCESS_CLIENT_ID: "test-client",
  ADMIN_CI_ACCESS_CLIENT_SECRET: "test-secret",
  ADMIN_CI_READ_TOKEN: "test-read-token",
};
const response = (status, body = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const healthyDatabase = {
  ok: true,
  d1: "connected",
  tables_ok: true,
  schema_version: "0043",
};

const ASSET =
  "/_astro/AmbientFlow.astro_astro_type_script_index_0_lang.CoN_yWV8.js";
const secured = (status, body, headers = {}) =>
  new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });

/** A www release that serves the header set on pages, assets and redirects.
 *  `overrides` replaces the response for one pathname. */
function wwwSite(health, overrides = {}) {
  return async (url, init = {}) => {
    const { pathname } = new URL(url);
    if (pathname === "/api/health") return response(200, health());
    if (overrides[pathname]) return overrides[pathname](init);
    if (pathname === "/")
      return secured(200, `<script type="module" src="${ASSET}"></script>`, {
        "content-type": "text/html; charset=utf-8",
      });
    if (pathname === "/thoughts") {
      assert.equal(init.redirect, "manual", "the redirect itself is checked");
      return secured(301, null, { location: "/writing" });
    }
    return secured(200, "{}", { "content-type": "application/json" });
  };
}
const currentHealth = () => ({ ...healthyDatabase, release_sha: expectedSha });

const publicReceipt = await smokeRelease({
  target: "www",
  baseUrl: "https://example.test",
  expectedSha,
  retryDelayMs: 0,
  fetchImpl: wwwSite(currentHealth),
});
assert.equal(publicReceipt.release_sha, expectedSha);
assert.ok(publicReceipt.checks.length > 10);
assert.deepEqual(
  publicReceipt.checks.filter((check) => check.security_headers),
  [
    { path: "/", status: 200, security_headers: true },
    { path: ASSET, status: 200, security_headers: true },
    { path: "/thoughts", status: 301, security_headers: true },
  ],
);

const withoutHeader = (name, status, body, headers = {}) => {
  const response = secured(status, body, headers);
  response.headers.delete(name);
  return response;
};
for (const [label, overrides, pattern] of [
  [
    "a page without HSTS",
    {
      "/": () =>
        withoutHeader(
          "Strict-Transport-Security",
          200,
          `<link rel="stylesheet" href="${ASSET}">`,
        ),
    },
    /example\.test\/: HTTP 200, Strict-Transport-Security missing/,
  ],
  [
    "an asset with a duplicated X-Frame-Options",
    {
      [ASSET]: () => {
        const response = secured(200, "x");
        response.headers.append("X-Frame-Options", "DENY");
        return response;
      },
    },
    /X-Frame-Options unexpected value/,
  ],
  [
    "a redirect with a weaker CSP",
    {
      "/thoughts": () =>
        secured(301, null, {
          location: "/writing",
          "Content-Security-Policy": "default-src *",
        }),
    },
    /thoughts: HTTP 301, Content-Security-Policy unexpected value/,
  ],
  [
    "a redirect without any header",
    {
      "/thoughts": () =>
        new Response(null, { status: 301, headers: { location: "/writing" } }),
    },
    /X-Content-Type-Options missing, X-Frame-Options missing/,
  ],
  [
    "a home page without a hashed asset",
    { "/": () => secured(200, "<p>no assets</p>") },
    /no hashed \/_astro asset linked/,
  ],
]) {
  await assert.rejects(
    smokeRelease({
      target: "www",
      baseUrl: "https://example.test",
      expectedSha,
      healthAttempts: 1,
      retryDelayMs: 0,
      fetchImpl: wwwSite(currentHealth, overrides),
    }),
    pattern,
    label,
  );
}

assert.equal(
  await previousReleaseSha("https://admin.example.test", "admin", {
    env: smokeIdentity,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://admin.example.test/api/health");
      assert.equal(init.redirect, "manual");
      assert.equal(init.headers.Authorization, "Bearer test-read-token");
      assert.equal(init.headers["CF-Access-Client-Secret"], "test-secret");
      return response(200, { release_sha: expectedSha });
    },
  }),
  expectedSha,
);
await assert.rejects(
  previousReleaseSha("https://admin.example.test", "admin", {
    env: {},
    fetchImpl: async () => {
      throw new Error("must not fetch without an identity");
    },
  }),
  /identity is not installed/,
);
await assert.rejects(
  previousReleaseSha("https://admin.example.test", "admin", {
    env: smokeIdentity,
    fetchImpl: async () => response(302),
  }),
  /HTTP 302/,
);
assert.equal(
  await previousReleaseSha("https://www.example.test", "www", {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers, undefined);
      return response(200);
    },
  }),
  "unknown",
);

const adminReceipt = await smokeRelease({
  target: "admin",
  baseUrl: "https://admin.example.test",
  expectedSha,
  retryDelayMs: 0,
  env: smokeIdentity,
  healthAttempts: 1,
  fetchImpl: async (url, init = {}) => {
    if (url.endsWith("/api/health")) {
      assert.equal(init.headers?.Authorization, "Bearer test-read-token");
      assert.equal(init.headers?.["CF-Access-Client-Id"], "test-client");
      assert.equal(init.redirect, "manual");
      return response(200, {
        release_sha: expectedSha,
        schema_version: "0042",
      });
    }
    assert.equal(
      init.headers,
      undefined,
      "negative route probes remain unauthenticated",
    );
    return response(302);
  },
});
assert.ok(adminReceipt.checks.every((check) => check.status === 302));

const publicAuthReceipt = await smokeRelease({
  target: "admin",
  baseUrl: "https://admin.example.test",
  expectedSha,
  retryDelayMs: 0,
  env: smokeIdentity,
  fetchImpl: async (url) => {
    if (url.endsWith("/api/health")) {
      return response(200, {
        release_sha: expectedSha,
        schema_version: "0042",
      });
    }
    return response(url.endsWith("/auth") ? 200 : 302);
  },
});
assert.equal(
  publicAuthReceipt.checks.find((check) => check.path === "/auth")?.status,
  200,
);

let healthAttempts = 0;
const propagatedReceipt = await smokeRelease({
  target: "www",
  baseUrl: "https://example.test",
  expectedSha,
  retryDelayMs: 0,
  fetchImpl: wwwSite(() => {
    healthAttempts += 1;
    return {
      ...healthyDatabase,
      release_sha: healthAttempts === 1 ? "stale" : expectedSha,
      schema_version: "0042",
    };
  }),
});
assert.equal(propagatedReceipt.release_sha, expectedSha);
assert.equal(healthAttempts, 2);

const unversionedRollbackReceipt = await smokeRelease({
  target: "www",
  baseUrl: "https://example.test",
  allowUnversioned: true,
  retryDelayMs: 0,
  fetchImpl: async () => response(200, healthyDatabase),
});
assert.equal(unversionedRollbackReceipt.release_sha, "unversioned");
assert.equal(unversionedRollbackReceipt.rollback_unversioned, true);
assert.equal(
  unversionedRollbackReceipt.checks.some((check) => check.security_headers),
  false,
  "an unversioned rollback predates the header contract",
);

await assert.rejects(
  smokeRelease({
    target: "www",
    baseUrl: "https://example.test",
    expectedSha,
    healthAttempts: 2,
    retryDelayMs: 0,
    fetchImpl: async (url) =>
      url.endsWith("/api/health")
        ? response(200, { release_sha: "wrong", schema_version: "0042" })
        : response(200),
  }),
  /release SHA mismatch/,
);

await assert.rejects(
  smokeRelease({
    target: "admin",
    mode: "authenticated",
    baseUrl: "https://admin.example.test",
    expectedSha,
    retryDelayMs: 0,
    env: {},
    fetchImpl: async (url) =>
      url.endsWith("/api/health")
        ? response(200, { release_sha: expectedSha, schema_version: "0042" })
        : response(200),
  }),
  /authenticated smoke identity is not installed/,
);

await assert.rejects(
  smokeRelease({
    target: "admin",
    mode: "authenticated",
    baseUrl: "https://admin.example.test",
    expectedSha,
    retryDelayMs: 0,
    env: {
      ADMIN_CI_ACCESS_CLIENT_ID: "test-client",
      ADMIN_CI_ACCESS_CLIENT_SECRET: "test-secret",
      ADMIN_CI_READ_TOKEN: "test-read-token",
    },
    fetchImpl: async (url, init = {}) => {
      assert.equal(
        init.redirect,
        "manual",
        "authenticated probes cannot follow a login redirect or forward credentials",
      );
      if (url.endsWith("/api/health")) {
        return response(200, {
          release_sha: expectedSha,
          schema_version: "0042",
        });
      }
      return response(init.method === "POST" ? 200 : 200);
    },
  }),
  /read-only identity was allowed to write/,
);

assert.throws(
  () => activeVersion({ versions: [{ version_id: "split", percentage: 50 }] }),
  /single active Worker version/,
);
assert.equal(
  activeVersion({ versions: [{ version_id: "current", percentage: 100 }] }),
  "current",
);

console.log("release smoke tests passed");

for (const unhealthy of [
  { ...healthyDatabase, ok: false },
  { ...healthyDatabase, d1: "error" },
  { ...healthyDatabase, tables_ok: false },
]) {
  await assert.rejects(
    smokeRelease({
      target: "www",
      baseUrl: "https://example.test",
      expectedSha,
      healthAttempts: 1,
      retryDelayMs: 0,
      fetchImpl: async () =>
        response(200, { ...unhealthy, release_sha: expectedSha }),
    }),
    /newsletter database unavailable/,
  );
}
