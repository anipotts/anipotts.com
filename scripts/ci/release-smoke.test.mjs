#!/usr/bin/env node

import assert from "node:assert/strict";
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

const publicReceipt = await smokeRelease({
  target: "www",
  baseUrl: "https://example.test",
  expectedSha,
  retryDelayMs: 0,
  fetchImpl: async (url) =>
    url.endsWith("/api/health")
      ? response(200, { release_sha: expectedSha, ok: true })
      : response(200),
});
assert.equal(publicReceipt.release_sha, expectedSha);
assert.ok(publicReceipt.checks.length > 10);

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

const publicPasskeyReceipt = await smokeRelease({
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
    return response(url.endsWith("/auth/passkey") ? 200 : 302);
  },
});
assert.equal(
  publicPasskeyReceipt.checks.find((check) => check.path === "/auth/passkey")
    ?.status,
  200,
);

let healthAttempts = 0;
const propagatedReceipt = await smokeRelease({
  target: "www",
  baseUrl: "https://example.test",
  expectedSha,
  retryDelayMs: 0,
  fetchImpl: async (url) => {
    if (!url.endsWith("/api/health")) return response(200);
    healthAttempts += 1;
    return response(200, {
      release_sha: healthAttempts === 1 ? "stale" : expectedSha,
      schema_version: "0042",
    });
  },
});
assert.equal(propagatedReceipt.release_sha, expectedSha);
assert.equal(healthAttempts, 2);

const unversionedRollbackReceipt = await smokeRelease({
  target: "www",
  baseUrl: "https://example.test",
  allowUnversioned: true,
  retryDelayMs: 0,
  fetchImpl: async () => response(200, { ok: true }),
});
assert.equal(unversionedRollbackReceipt.release_sha, "unversioned");
assert.equal(unversionedRollbackReceipt.rollback_unversioned, true);

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
