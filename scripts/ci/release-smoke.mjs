#!/usr/bin/env node

import { ADMIN_PROTECTED_SMOKE_ROUTES } from "./admin-route-inventory.mjs";
import { PUBLIC_SMOKE_ROUTES } from "./public-route-inventory.mjs";

const ADMIN_WRITE_PROBES = [
  "/api/admin/content/draft-operation",
  "/api/admin/passkey/register-options",
];

const ADMIN_PUBLIC_AUTH_ROUTES = ["/auth/passkey"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url, init, options) {
  let last;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      last = await options.fetchImpl(url, init);
      if (options.accept(last)) return last;
    } catch (error) {
      last = error;
    }
    if (attempt < options.attempts) await sleep(options.delayMs);
  }
  const detail =
    last instanceof Response ? `HTTP ${last.status}` : String(last);
  throw new Error(`smoke failed for ${url}: ${detail}`);
}

function authenticatedHeaders(env) {
  const required = [
    "ADMIN_CI_ACCESS_CLIENT_ID",
    "ADMIN_CI_ACCESS_CLIENT_SECRET",
    "ADMIN_CI_READ_TOKEN",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `authenticated smoke identity is not installed: ${missing.join(", ")}`,
    );
  }
  return {
    "CF-Access-Client-Id": env.ADMIN_CI_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": env.ADMIN_CI_ACCESS_CLIENT_SECRET,
    Authorization: `Bearer ${env.ADMIN_CI_READ_TOKEN}`,
  };
}

export function healthRequestInit(target, env = process.env) {
  // Health proves the release identity, independently of unauthenticated
  // route probes. Never forward this identity through an Access redirect.
  return target === "admin"
    ? { headers: authenticatedHeaders(env), redirect: "manual" }
    : { redirect: "manual" };
}

async function verifyHealth(
  baseUrl,
  expectedSha,
  fetchImpl,
  { allowUnversioned, attempts, delayMs, requestInit, target },
) {
  let lastHealth;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/health`, requestInit);
      if (response.status === 200) {
        const health = await response.json();
        lastHealth = health;
        const versionMatches = allowUnversioned
          ? !health.release_sha
          : health.release_sha === expectedSha;
        const schemaMatches =
          target === "www" ||
          allowUnversioned ||
          Boolean(health.schema_version);
        if (versionMatches && schemaMatches) return health;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = String(error);
    }
    if (attempt < attempts) await sleep(delayMs);
  }

  if (allowUnversioned) {
    throw new Error(
      `unversioned rollback did not stabilize at ${baseUrl}: received ${lastHealth?.release_sha || lastError || "missing health"}`,
    );
  }
  if (lastHealth?.release_sha !== expectedSha) {
    throw new Error(
      `release SHA mismatch at ${baseUrl}: expected ${expectedSha}, received ${lastHealth?.release_sha || lastError || "missing"}`,
    );
  }
  throw new Error(`schema version missing at ${baseUrl}`);
}

export async function smokeRelease(options) {
  const {
    target,
    baseUrl,
    expectedSha,
    mode = "unauthenticated",
    fetchImpl = fetch,
    env = process.env,
    allowUnversioned = false,
    healthAttempts = 6,
    retryDelayMs = 10_000,
  } = options;
  if (!expectedSha && !allowUnversioned) {
    throw new Error("expected release SHA is required");
  }

  const health = await verifyHealth(baseUrl, expectedSha, fetchImpl, {
    target,
    allowUnversioned,
    attempts: healthAttempts,
    delayMs: retryDelayMs,
    requestInit: healthRequestInit(target, env),
  });
  const checks = [];

  if (target === "www") {
    for (const path of PUBLIC_SMOKE_ROUTES) {
      const response = await requestWithRetry(
        `${baseUrl}${path}`,
        {},
        {
          attempts: 6,
          delayMs: 10_000,
          fetchImpl,
          accept: (candidate) => candidate.status === 200,
        },
      );
      checks.push({ path, status: response.status });
    }
  } else if (target === "admin" && mode === "unauthenticated") {
    for (const path of ADMIN_PROTECTED_SMOKE_ROUTES) {
      const response = await requestWithRetry(
        `${baseUrl}${path}`,
        {
          redirect: "manual",
        },
        {
          attempts: 6,
          delayMs: 10_000,
          fetchImpl,
          accept: (candidate) =>
            path === "/auth/passkey"
              ? [200, 302, 401, 403].includes(candidate.status)
              : [302, 401, 403].includes(candidate.status),
        },
      );
      checks.push({ path, status: response.status });
    }
    for (const path of ADMIN_PUBLIC_AUTH_ROUTES) {
      const response = await requestWithRetry(
        `${baseUrl}${path}`,
        { redirect: "manual" },
        {
          attempts: 6,
          delayMs: 10_000,
          fetchImpl,
          accept: (candidate) =>
            [200, 302, 401, 403].includes(candidate.status),
        },
      );
      checks.push({ path, status: response.status, auth_boundary: true });
    }
  } else if (target === "admin" && mode === "authenticated") {
    const headers = authenticatedHeaders(env);
    for (const path of ADMIN_PROTECTED_SMOKE_ROUTES) {
      const response = await requestWithRetry(
        `${baseUrl}${path}`,
        { headers, redirect: "manual" },
        {
          attempts: 6,
          delayMs: 10_000,
          fetchImpl,
          accept: (candidate) => candidate.status === 200,
        },
      );
      checks.push({ path, status: response.status });
    }
    for (const path of ADMIN_WRITE_PROBES) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        redirect: "manual",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      });
      if (![401, 403, 405].includes(response.status)) {
        throw new Error(`read-only identity was allowed to write ${path}`);
      }
      checks.push({ path, status: response.status, write_rejected: true });
    }
  } else {
    throw new Error(`unsupported smoke target or mode: ${target}/${mode}`);
  }

  return {
    schema_version: 1,
    target,
    mode,
    base_url: baseUrl,
    release_sha: health.release_sha || "unversioned",
    database_schema: health.schema_version || "unversioned",
    rollback_unversioned: allowUnversioned,
    checks,
  };
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  smokeRelease({
    target: argument("target"),
    baseUrl: argument("base-url"),
    expectedSha: argument("expected-sha"),
    mode: argument("mode") || "unauthenticated",
    allowUnversioned: process.argv.includes("--allow-unversioned"),
  })
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
