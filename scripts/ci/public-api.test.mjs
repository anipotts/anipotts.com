import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as guards from "../../apps/www/src/lib/api.ts";
import { checkOrigin, checkRateLimit } from "../../apps/www/src/lib/api.ts";

function database(...options) {
  const count = options.length ? options[0] : 1;
  const failure = options[1] ?? false;
  const keys = [];
  return {
    keys,
    prepare() {
      return {
        bind(key) {
          keys.push(key);
          return {
            async first() {
              return count === null ? null : { cnt: count };
            },
          };
        },
      };
    },
    async batch() {
      if (failure) throw new Error("database unavailable");
    },
  };
}
const request = new Request("https://anipotts.com/api/subscribe", {
  headers: {
    "cf-connecting-ip": "192.0.2.1",
    "x-forwarded-for": "198.51.100.1, 203.0.113.1",
  },
});
const valid = database();
assert.equal(await checkRateLimit(request, valid), true);
assert.deepEqual(
  [...new Set(valid.keys)],
  ["contact:192.0.2.1"],
  "client-controlled forwarding headers cannot select the production rate-limit bucket",
);
assert.equal(await checkRateLimit(request, database(6)), false);
assert.equal(await checkRateLimit(request, database(5)), true);
await assert.rejects(
  checkRateLimit(request, database(1, true)),
  /database unavailable/,
);
await assert.rejects(
  checkRateLimit(request, undefined),
  /database unavailable/,
);
for (const count of [null, undefined, "1", -1, 0, NaN, Infinity, 1.5]) {
  await assert.rejects(
    checkRateLimit(request, database(count)),
    /count unavailable/,
  );
}
for (const headers of [
  { "x-forwarded-for": "198.51.100.2" },
  { "x-real-ip": "198.51.100.3", "cf-connecting-ip": " " },
]) {
  const missingIdentity = database();
  assert.equal(
    await checkRateLimit(
      new Request(request.url, { headers }),
      missingIdentity,
    ),
    true,
  );
  assert.deepEqual([...new Set(missingIdentity.keys)], ["contact:unknown"]);
}
const ipv6 = database();
await checkRateLimit(
  new Request(request.url, { headers: { "cf-connecting-ip": "2001:db8::1" } }),
  ipv6,
);
assert.deepEqual([...new Set(ipv6.keys)], ["contact:2001:db8::1"]);
assert.equal(
  checkOrigin(
    new Request(request.url, {
      headers: { origin: "https://invalid.example" },
    }),
  )?.status,
  403,
);
assert.equal(
  checkOrigin(
    new Request(request.url, { headers: { origin: "https://anipotts.com" } }),
  ),
  null,
);
assert.equal(
  checkOrigin(
    new Request("http://localhost:1355/api/subscribe", {
      headers: { origin: "http://localhost:1355" },
    }),
  ),
  null,
);
console.log(
  "public API: trusted client IP, fail-closed rate limits, and legitimate origins passed",
);

// Compile the actual Astro endpoint modules, substituting only the outbound
// boundary. Neither endpoint test can reach a real queue or subscriber table.
const ts = createRequire(resolve("apps/www/package.json"))("typescript");
let outboundCalls = 0;
function endpoint(file, imports) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    console: { error() {} },
    require(name) {
      if (!(name in imports))
        throw new Error(`unexpected endpoint dependency: ${name}`);
      return imports[name];
    },
  };
  runInNewContext(compiled, context);
  return context.exports;
}
const newsletter = endpoint("apps/www/src/lib/newsletter.ts", {
  "./api": guards,
  zod: createRequire(resolve("apps/www/package.json"))("zod"),
});
const subscribe = endpoint("apps/www/src/pages/api/newsletter/subscribe.ts", {
  "../../../lib/api": guards,
  "../../../lib/newsletter": {
    ...newsletter,
    async createDoubleOptIn() {
      outboundCalls++;
      return { queued: true, mock: true };
    },
  },
});
const alias = endpoint("apps/www/src/pages/api/subscribe.ts", {
  "./newsletter/subscribe": subscribe,
});
for (const route of [subscribe, alias]) {
  assert.equal(route.prerender, false);
  for (const [db, payload, origin, expected] of [
    [
      database(1, true),
      { email: "test@example.com" },
      "https://anipotts.com",
      500,
    ],
    [
      database(null),
      { email: "test@example.com" },
      "https://anipotts.com",
      500,
    ],
    [undefined, { email: "test@example.com" }, "https://anipotts.com", 500],
    [database(6), { email: "test@example.com" }, "https://anipotts.com", 429],
    [database(), {}, "https://anipotts.com", 400],
    [database(), { email: "test@example.com" }, "https://invalid.example", 403],
    [database(), { email: "test@example.com" }, "https://anipotts.com", 200],
  ]) {
    const before = outboundCalls;
    const response = await route.POST({
      request: new Request(request.url, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.1",
        },
        body: JSON.stringify(payload),
      }),
      locals: { runtime: { env: { DB: db } } },
    });
    assert.equal(response.status, expected);
    assert.equal(outboundCalls - before, expected === 200 ? 1 : 0);
  }
}
console.log(
  "subscribe and legacy alias: success, validation, origin, unavailable guard, and exceeded-limit behavior passed without outbound effects",
);
