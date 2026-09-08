import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import {
  checkOrigin,
  checkRateLimit,
} from "../../workers/newsletter/src/guards.ts";

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
    "x-newsletter-client-ip": "192.0.2.1",
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
  { "x-real-ip": "198.51.100.3", "x-newsletter-client-ip": " " },
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
  new Request(request.url, {
    headers: { "x-newsletter-client-ip": "2001:db8::1" },
  }),
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

// Execute the real route/storage/queue modules with SQLite and an isolated
// transport. No test can access Cloudflare, subscribers, or a real mail service.
const ts = createRequire(resolve("apps/www/package.json"))("typescript");
let sends = 0;
let transportFails = false;
function endpoint(file) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    crypto,
    atob,
    btoa,
    Date,
    console: { error() {} },
    fetch: async (url) => {
      assert.equal(url, "https://api.resend.com/emails");
      sends++;
      return Response.json(
        transportFails ? { message: "test outage" } : { id: "test-email" },
        { status: transportFails ? 503 : 200 },
      );
    },
    require(name) {
      if (name === "cloudflare:workers") return { WorkerEntrypoint: class {} };
      if (name.startsWith("."))
        return endpoint(resolve(dirname(file), `${name}.ts`));
      return createRequire(resolve(file))(name);
    },
  };
  runInNewContext(compiled, context);
  return context.exports;
}
const sql = new DatabaseSync(":memory:");
sql.exec(readFileSync("drizzle/migrations/0005_newsletter_system.sql", "utf8"));
sql.exec("CREATE TABLE rate_limits (key TEXT, ts INTEGER)");
const db = {
  prepare(query) {
    const statement = sql.prepare(query);
    return {
      bind(...args) {
        return {
          async first() {
            return statement.get(...args) ?? null;
          },
          async run() {
            return { success: true, meta: statement.run(...args) };
          },
        };
      },
    };
  },
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sql.exec("COMMIT");
      return results;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  },
};
const messages = [];
const env = {
  DB: db,
  NEWSLETTER_QUEUE: {
    async send(message) {
      messages.push(message);
    },
  },
  NEWSLETTER_BASE_URL: "https://news.anipotts.com",
};
const { handleNewsletterRequest } = endpoint("workers/newsletter/src/http.ts");
const { forwardNewsletter } = endpoint("apps/www/src/lib/newsletter.ts");
const subscribe = endpoint("apps/www/src/pages/api/newsletter/subscribe.ts");
const alias = endpoint("apps/www/src/pages/api/subscribe.ts");
const service = { fetch: (request) => handleNewsletterRequest(request, env) };
for (const route of [subscribe, alias]) {
  assert.equal(route.prerender, false);
  for (const [payload, origin, expected] of [
    [{}, "https://anipotts.com", 400],
    [{ email: "test@example.com" }, "https://invalid.example", 403],
    [
      { email: "test@example.com", website: "spam" },
      "https://anipotts.com",
      400,
    ],
    [{ email: "test@example.com" }, "https://anipotts.com", 200],
  ]) {
    sql.exec("DELETE FROM rate_limits");
    const before = messages.length;
    const response = await route.POST({
      request: new Request(request.url, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.1",
          "x-newsletter-client-ip": "spoofed",
        },
        body: JSON.stringify(payload),
      }),
      locals: { runtime: { env: { NEWSLETTER: service } } },
    });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(messages.length - before, expected === 200 ? 1 : 0);
    const buckets = sql.prepare("SELECT DISTINCT key FROM rate_limits").all();
    assert.ok(buckets.every((row) => row.key === "contact:192.0.2.1"));
  }
}
const rawWebhook = '{ "type": "email.bounced" }\n';
await forwardNewsletter({
  request: new Request(
    "https://news.anipotts.com/api/newsletter/webhooks/resend?test=1",
    {
      method: "POST",
      body: rawWebhook,
      headers: {
        cookie: "private",
        authorization: "private",
        "svix-id": "event",
        "cf-connecting-ip": "192.0.2.2",
      },
    },
  ),
  locals: {
    runtime: {
      env: {
        NEWSLETTER: {
          async fetch(forwarded) {
            assert.equal(
              forwarded.url,
              "https://news.anipotts.com/api/newsletter/webhooks/resend?test=1",
            );
            assert.equal(forwarded.method, "POST");
            assert.equal(await forwarded.text(), rawWebhook);
            assert.equal(forwarded.headers.get("cookie"), null);
            assert.equal(forwarded.headers.get("authorization"), null);
            assert.equal(forwarded.headers.get("svix-id"), "event");
            assert.equal(
              forwarded.headers.get("x-newsletter-client-ip"),
              "192.0.2.2",
            );
            return Response.json({ ok: true });
          },
        },
      },
    },
  },
});
assert.equal(
  (await forwardNewsletter({ request, locals: { runtime: { env: {} } } }))
    .status,
  503,
);
assert.equal(
  (
    await handleNewsletterRequest(
      new Request("https://news.anipotts.com/unknown"),
      env,
    )
  ).status,
  404,
);

const storage = endpoint("workers/newsletter/src/storage.ts");
const pending = messages[0];
assert.equal(await storage.confirmSubscriber(db, pending.token), "confirmed");
assert.equal(await storage.confirmSubscriber(db, pending.token), "used");
assert.equal(await storage.confirmSubscriber(db, "unknown"), "invalid");
for (const expiry of [
  new Date(Date.now() - 1000).toISOString(),
  "invalid-date",
]) {
  const token = await storage.createToken(db, {
    subscriberId: pending.subscriberId,
    email: pending.email,
    purpose: "confirm",
    ttlMs: 1000,
  });
  sql
    .prepare(
      "UPDATE newsletter_tokens SET expires_at = ? WHERE used_at IS NULL",
    )
    .run(expiry);
  assert.equal(await storage.confirmSubscriber(db, token), "expired");
}
const unsubscribeToken = await storage.createToken(db, {
  subscriberId: pending.subscriberId,
  email: pending.email,
  purpose: "unsubscribe",
  ttlMs: 60000,
});
assert.equal(
  await storage.unsubscribeByToken(db, unsubscribeToken),
  "unsubscribed",
);
assert.equal(
  await storage.unsubscribeByToken(db, unsubscribeToken),
  "unsubscribed",
);
assert.equal(
  sql
    .prepare("SELECT status FROM newsletter_subscribers WHERE id = ?")
    .get(pending.subscriberId).status,
  "unsubscribed",
);
await storage.suppressEmail(db, {
  email: pending.email,
  reason: "complained",
  provider: "resend",
});
await storage.unsubscribeByToken(db, unsubscribeToken);
assert.equal(
  sql
    .prepare("SELECT reason FROM newsletter_suppressions WHERE email = ?")
    .get(pending.email).reason,
  "complained",
);
assert.equal(
  sql
    .prepare("SELECT status FROM newsletter_subscribers WHERE id = ?")
    .get(pending.subscriberId).status,
  "suppressed",
);
const beforeSuppression = messages.length;
await storage.createDoubleOptIn(env, request, pending.email);
assert.equal(messages.length, beforeSuppression);

const secretBytes = new TextEncoder().encode("local-test-signing-material");
const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;
const key = await crypto.subtle.importKey(
  "raw",
  secretBytes,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
async function signedWebhook(
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`event.${timestamp}.${rawWebhook}`),
    ),
  );
  return new Request(
    "https://news.anipotts.com/api/newsletter/webhooks/resend",
    {
      method: "POST",
      body: rawWebhook,
      headers: {
        "svix-id": "event",
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${btoa(String.fromCharCode(...signature))}`,
      },
    },
  );
}
assert.equal(
  await storage.verifyResendWebhook(await signedWebhook(), secret, rawWebhook),
  true,
);
assert.equal(
  await storage.verifyResendWebhook(
    await signedWebhook(),
    secret,
    `${rawWebhook} `,
  ),
  false,
);
assert.equal(
  await storage.verifyResendWebhook(
    await signedWebhook("1"),
    secret,
    rawWebhook,
  ),
  false,
);
assert.equal(
  await storage.verifyResendWebhook(
    await signedWebhook(String(Math.floor(Date.now() / 1000) + 601)),
    secret,
    rawWebhook,
  ),
  false,
);
assert.equal(
  await storage.verifyResendWebhook(request, secret, rawWebhook),
  false,
);
const verified = await handleNewsletterRequest(await signedWebhook(), {
  ...env,
  RESEND_WEBHOOK_SECRET: secret,
});
assert.equal(verified.status, 200);
await handleNewsletterRequest(await signedWebhook(), {
  ...env,
  RESEND_WEBHOOK_SECRET: secret,
});
assert.equal(
  sql
    .prepare(
      "SELECT count(*) AS count FROM newsletter_events WHERE provider_event_id = 'event'",
    )
    .get().count,
  1,
);

const worker = endpoint("workers/newsletter/src/index.ts").default;
assert.equal(
  await (await worker.fetch(request)).text(),
  "newsletter worker ok",
);
assert.equal(
  (
    await forwardNewsletter({
      request: new Request("https://anipotts.com/api/subscribe", {
        method: "POST",
        body: "x".repeat(1024 * 1024 + 1),
      }),
      locals: {
        runtime: {
          env: {
            NEWSLETTER: {
              fetch() {
                throw new Error("oversize body must not cross the binding");
              },
            },
          },
        },
      },
    })
  ).status,
  413,
);
let acknowledgements = 0;
let retries = 0;
const batch = {
  messages: [
    {
      body: pending,
      ack() {
        acknowledgements++;
      },
      retry(options) {
        assert.equal(options.delaySeconds, 60);
        retries++;
      },
    },
  ],
};
transportFails = true;
await worker.queue(batch, { ...env, RESEND_API_KEY: "local-test-only" });
assert.equal(acknowledgements, 0);
assert.equal(retries, 1);
transportFails = false;
await worker.queue(batch, { ...env, RESEND_API_KEY: "local-test-only" });
assert.equal(acknowledgements, 1);
assert.equal(retries, 1);
await worker.queue(batch, env);
assert.equal(acknowledgements, 1);
assert.equal(retries, 2);
assert.equal(sends, 2);
sql.close();
console.log(
  "newsletter: real SQLite consent/token/suppression behavior, raw service forwarding, webhook verification, and isolated queue retry passed",
);
