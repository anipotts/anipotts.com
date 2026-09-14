import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Run the real endpoint and storage modules against in-memory SQLite with a
// recording queue. Nothing here reaches Cloudflare, Resend or real addresses.
const WWW = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(WWW, "../..");
const PACKAGES = {
  "@anipotts/content/public": await import("@anipotts/content/public"),
  zod: await import("zod"),
};
const modules = new Map();

function load(file) {
  const cached = modules.get(file);
  if (cached) return cached.exports;
  const module = { exports: {} };
  modules.set(file, module);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const requireModule = (name) => {
    if (name.startsWith(".")) return load(resolve(dirname(file), `${name}.ts`));
    if (name in PACKAGES) return PACKAGES[name];
    throw new Error(`unexpected endpoint dependency: ${name}`);
  };
  new Function("exports", "require", "module", outputText)(
    module.exports,
    requireModule,
    module,
  );
  return module.exports;
}

const api = load(resolve(WWW, "src/lib/api.ts"));
const newsletter = load(resolve(WWW, "src/lib/newsletter.ts"));
const route = (path) => load(resolve(WWW, "src/pages/api", path));
const subscribe = route("newsletter/subscribe.ts");
const confirm = route("newsletter/confirm.ts");
const unsubscribe = route("newsletter/unsubscribe.ts");
const webhook = route("newsletter/webhooks/resend.ts");

function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      resolve(REPO, "drizzle/migrations/0005_newsletter_system.sql"),
      "utf8",
    ),
  );
  sql.exec(
    "CREATE TABLE rate_limits (key TEXT NOT NULL, ts INTEGER NOT NULL); CREATE INDEX idx_rate_limits_key_ts ON rate_limits(key, ts);",
  );
  const faults = { fail: null };
  const statement = (query, args = []) => {
    const execute = (method) => {
      if (faults.fail?.(query)) throw new Error("injected database failure");
      return sql.prepare(query)[method](...args);
    };
    return {
      bind: (...next) => statement(query, next),
      async first() {
        return execute("get") ?? null;
      },
      async all() {
        return { results: execute("all") };
      },
      async run() {
        const meta = execute("run");
        return { success: true, meta: { changes: Number(meta.changes) } };
      },
    };
  };
  return {
    sql,
    faults,
    prepare: (query) => statement(query),
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function environment(db, extra = {}) {
  const messages = [];
  return {
    messages,
    env: {
      DB: db,
      NEWSLETTER_BASE_URL: "https://news.anipotts.com",
      NEWSLETTER_QUEUE: {
        async send(message) {
          messages.push(message);
        },
      },
      ...extra,
    },
  };
}

const locals = (env) => ({ runtime: { env } });
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const hash = (token) => createHash("sha256").update(token).digest("hex");
const count = (db, query, ...args) =>
  Number(db.sql.prepare(query).get(...args).cnt);

function seedSubscriber(db, email, status, extra = {}) {
  const id = crypto.randomUUID();
  db.sql
    .prepare(
      "INSERT INTO newsletter_subscribers (id, email, status, source, subscribed_at, suppressed_at, suppression_reason, created_at, updated_at) VALUES (?, ?, ?, 'website', ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      email,
      status,
      iso(-60_000),
      extra.suppressedAt ?? null,
      extra.suppressionReason ?? null,
      iso(-60_000),
      iso(-60_000),
    );
  return id;
}

function seedToken(db, subscriberId, email, purpose, options = {}) {
  const token = randomBytes(32).toString("base64url");
  db.sql
    .prepare(
      "INSERT INTO newsletter_tokens (id, subscriber_id, email, purpose, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      crypto.randomUUID(),
      subscriberId,
      email,
      purpose,
      hash(token),
      options.expiresAt ?? iso(60 * 60 * 1000),
      options.usedAt ?? null,
      options.createdAt ?? iso(),
    );
  return token;
}

function seedSuppression(db, email, reason, createdAt = iso(-30_000)) {
  db.sql
    .prepare(
      "INSERT INTO newsletter_suppressions (email, subscriber_id, reason, provider, created_at, metadata) VALUES (?, NULL, ?, ?, ?, '{}')",
    )
    .run(
      email,
      reason,
      reason === "user_unsubscribe" ? "first_party" : "resend",
      createdAt,
    );
}

const subscriber = (db, email) =>
  db.sql
    .prepare(
      "SELECT id, status, suppressed_at FROM newsletter_subscribers WHERE email = ?",
    )
    .get(email);
const suppression = (db, email) =>
  db.sql
    .prepare(
      "SELECT reason, created_at FROM newsletter_suppressions WHERE email = ?",
    )
    .get(email);

let clientAddress = 0;
function subscribeRequest(body) {
  clientAddress += 1;
  return new Request("https://anipotts.com/api/newsletter/subscribe", {
    method: "POST",
    headers: {
      origin: "https://anipotts.com",
      "content-type": "application/json",
      "cf-connecting-ip": `198.18.${Math.floor(clientAddress / 250)}.${clientAddress % 250}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const formPost = (url, token) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });

const WEBHOOK_KEY = randomBytes(24);
const WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY.toString("base64")}`;

function signedDelivery(body, options = {}) {
  const id = options.id ?? `msg_${randomBytes(8).toString("hex")}`;
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", WEBHOOK_KEY)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const headers = {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
    ...options.headers,
  };
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) delete headers[name];
  }
  return new Request(
    "https://news.anipotts.com/api/newsletter/webhooks/resend",
    { method: "POST", headers, body },
  );
}

const bounce = (email, extra = {}) =>
  JSON.stringify({
    type: "email.bounced",
    created_at: iso(),
    data: { email_id: "email-test", to: [email], ...extra },
  });

async function deliver(env, request) {
  return webhook.POST({ request, locals: locals(env) });
}

test("webhook timestamps must be integer seconds inside five minutes", async () => {
  const db = database();
  const { env } = environment(db, { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET });
  seedSubscriber(db, "reader@example.com", "confirmed");
  const now = Math.floor(Date.now() / 1000);
  for (const [timestamp, status] of [
    [String(now - 330), 401],
    [String(now + 330), 401],
    [`${now}.5`, 400],
    [`${now}abc`, 400],
    ["", 400],
  ]) {
    const response = await deliver(
      env,
      signedDelivery(bounce("reader@example.com"), {
        timestamp,
        headers: timestamp ? {} : { "svix-timestamp": undefined },
      }),
    );
    assert.equal(response.status, status, `timestamp ${timestamp}`);
  }
  for (const headers of [
    { "svix-id": undefined },
    { "svix-signature": undefined },
  ]) {
    const response = await deliver(
      env,
      signedDelivery(bounce("reader@example.com"), { headers }),
    );
    assert.equal(response.status, 400);
  }
  const forged = await deliver(
    env,
    signedDelivery(bounce("reader@example.com"), {
      headers: { "svix-signature": `v1,${randomBytes(32).toString("base64")}` },
    }),
  );
  assert.equal(forged.status, 401);
  assert.equal(count(db, "SELECT COUNT(*) AS cnt FROM newsletter_events"), 0);
  assert.equal(suppression(db, "reader@example.com"), undefined);

  const recent = await deliver(
    env,
    signedDelivery(bounce("reader@example.com"), {
      timestamp: String(now - 270),
    }),
  );
  assert.equal(recent.status, 200);
  assert.equal(suppression(db, "reader@example.com").reason, "bounced");
});

test("webhook bodies are byte capped and schema checked without echoing input", async () => {
  const db = database();
  const { env } = environment(db, { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET });
  const oversized = await deliver(
    env,
    signedDelivery(bounce("big@example.com", { padding: "x".repeat(70_000) })),
  );
  assert.equal(oversized.status, 413);
  for (const body of [
    JSON.stringify({ type: 42, data: { to: ["shape@example.com"] } }),
    JSON.stringify({
      type: "email.bounced",
      data: { to: "shape@example.com" },
    }),
    "shape@example.com is not json",
  ]) {
    const response = await deliver(env, signedDelivery(body));
    assert.equal(response.status, 400, body);
    assert.equal((await response.text()).includes("shape@example.com"), false);
  }
  assert.equal(count(db, "SELECT COUNT(*) AS cnt FROM newsletter_events"), 0);
  assert.equal(
    count(db, "SELECT COUNT(*) AS cnt FROM newsletter_suppressions"),
    0,
  );
});

test("a redelivered suppression is applied atomically and idempotently", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const db = database();
  const { env } = environment(db, { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET });
  seedSubscriber(db, "bounced@example.com", "confirmed");
  const body = bounce("bounced@example.com");
  const id = "msg_partial_failure";

  db.faults.fail = (query) => query.includes("newsletter_suppressions");
  const failed = await deliver(env, signedDelivery(body, { id })).catch(
    () => undefined,
  );
  assert.ok(!failed || failed.status === 500);
  db.faults.fail = null;
  assert.equal(
    count(db, "SELECT COUNT(*) AS cnt FROM newsletter_events"),
    0,
    "a failed suppression leaves no event behind to block the retry",
  );

  const retried = await deliver(env, signedDelivery(body, { id }));
  assert.equal(retried.status, 200);
  assert.equal(suppression(db, "bounced@example.com").reason, "bounced");
  assert.equal(subscriber(db, "bounced@example.com").status, "suppressed");
  const first = suppression(db, "bounced@example.com");

  const duplicate = await deliver(env, signedDelivery(body, { id }));
  assert.equal(duplicate.status, 200);
  assert.deepEqual(suppression(db, "bounced@example.com"), first);
  assert.equal(count(db, "SELECT COUNT(*) AS cnt FROM newsletter_events"), 1);
});

test("a duplicate delivery after an earlier partial write still suppresses", async () => {
  const db = database();
  const { env } = environment(db, { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET });
  seedSubscriber(db, "complained@example.com", "confirmed");
  const id = "msg_recorded_before_suppression";
  db.sql
    .prepare(
      "INSERT INTO newsletter_events (id, email, type, provider, provider_event_id, payload, created_at) VALUES (?, ?, 'email.complained', 'resend', ?, '{}', ?)",
    )
    .run(crypto.randomUUID(), "complained@example.com", id, iso(-5_000));
  const body = JSON.stringify({
    type: "email.complained",
    data: { to: ["complained@example.com"] },
  });
  const response = await deliver(env, signedDelivery(body, { id }));
  assert.equal(response.status, 200);
  assert.equal(suppression(db, "complained@example.com").reason, "complained");
  assert.equal(subscriber(db, "complained@example.com").status, "suppressed");
  assert.equal(count(db, "SELECT COUNT(*) AS cnt FROM newsletter_events"), 1);
});

test("subscribe responds identically for every address state", async () => {
  const db = database();
  const { env, messages } = environment(db);
  seedSubscriber(db, "pending@example.com", "pending");
  seedSubscriber(db, "confirmed@example.com", "confirmed");
  seedSubscriber(db, "suppressed@example.com", "suppressed", {
    suppressedAt: iso(-30_000),
    suppressionReason: "bounced",
  });
  seedSuppression(db, "suppressed@example.com", "bounced");
  seedSubscriber(db, "unsubscribed@example.com", "unsubscribed");
  seedSuppression(db, "unsubscribed@example.com", "user_unsubscribe");

  const responses = [];
  for (const email of [
    "new@example.com",
    "pending@example.com",
    "confirmed@example.com",
    "suppressed@example.com",
    "unsubscribed@example.com",
  ]) {
    const response = await subscribe.POST({
      request: subscribeRequest({ email }),
      locals: locals(env),
    });
    responses.push(`${response.status} ${await response.text()}`);
  }
  assert.equal(new Set(responses).size, 1, responses.join("\n"));
  assert.match(responses[0], /^200 /);
  assert.deepEqual(messages.map((message) => message.email).sort(), [
    "new@example.com",
    "pending@example.com",
    "unsubscribed@example.com",
  ]);
});

test("confirmation sends are throttled per address", async () => {
  const db = database();
  const { env, messages } = environment(db);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await subscribe.POST({
      request: subscribeRequest({ email: "Repeat@Example.com" }),
      locals: locals(env),
    });
    assert.equal(response.status, 200);
  }
  assert.equal(messages.length, 3);
  assert.equal(
    count(
      db,
      "SELECT COUNT(*) AS cnt FROM newsletter_tokens WHERE email = ? AND purpose = 'confirm'",
      "repeat@example.com",
    ),
    3,
  );
});

test("subscribe rejects malformed and oversized bodies with bounded errors", async () => {
  const db = database();
  const { env, messages } = environment(db);
  const malformed = await subscribe.POST({
    request: subscribeRequest('{"email": "broken@example.com"'),
    locals: locals(env),
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.text()).includes("broken@example.com"), false);
  const oversized = await subscribe.POST({
    request: subscribeRequest({
      email: "large@example.com",
      padding: "x".repeat(10_000),
    }),
    locals: locals(env),
  });
  assert.equal(oversized.status, 413);
  assert.equal(messages.length, 0);
  assert.equal(
    count(db, "SELECT COUNT(*) AS cnt FROM newsletter_subscribers"),
    0,
  );
});

test("confirm GET renders a POST form and only POST confirms", async () => {
  const db = database();
  const { env } = environment(db);
  const id = seedSubscriber(db, "confirm@example.com", "pending");
  const token = seedToken(db, id, "confirm@example.com", "confirm");
  const url = `https://news.anipotts.com/api/newsletter/confirm?token=${token}`;

  const page = await confirm.GET({
    request: new Request(url),
    locals: locals(env),
  });
  assert.equal(page.status, 200);
  const markup = await page.text();
  assert.match(markup, /<form method="post">/);
  assert.ok(markup.includes(`name="token" value="${token}"`));
  assert.doesNotMatch(markup, /[–—]/);
  assert.equal(subscriber(db, "confirm@example.com").status, "pending");
  assert.equal(
    count(
      db,
      "SELECT COUNT(*) AS cnt FROM newsletter_tokens WHERE used_at IS NOT NULL",
    ),
    0,
  );

  const missing = await confirm.GET({
    request: new Request("https://news.anipotts.com/api/newsletter/confirm"),
    locals: locals(env),
  });
  assert.equal(missing.status, 400);

  const posted = await confirm.POST({
    request: formPost(url, token),
    locals: locals(env),
  });
  assert.equal(posted.status, 200);
  assert.doesNotMatch(await posted.text(), /[–—]/);
  assert.equal(subscriber(db, "confirm@example.com").status, "confirmed");
  const reused = await confirm.POST({
    request: formPost(url, token),
    locals: locals(env),
  });
  assert.equal(reused.status, 200);
  const invalid = await confirm.POST({
    request: formPost(
      "https://news.anipotts.com/api/newsletter/confirm",
      "not-a-token",
    ),
    locals: locals(env),
  });
  assert.equal(invalid.status, 400);
});

async function unsubscribeWithToken(env, db, email, subscriberId) {
  const token = seedToken(db, subscriberId, email, "unsubscribe");
  const response = await unsubscribe.POST({
    request: formPost(
      "https://news.anipotts.com/api/newsletter/unsubscribe",
      token,
    ),
    locals: locals(env),
  });
  assert.equal(response.status, 200);
  assert.equal(suppression(db, email).reason, "user_unsubscribe");
  assert.equal(subscriber(db, email).status, "unsubscribed");
}

test("confirmation links issued before an unsubscribe cannot reverse it", async () => {
  const db = database();
  const { env } = environment(db);
  const id = seedSubscriber(db, "stale@example.com", "confirmed");
  const staleConfirm = seedToken(db, id, "stale@example.com", "confirm", {
    createdAt: iso(-10_000),
  });
  await unsubscribeWithToken(env, db, "stale@example.com", id);
  assert.notEqual(
    await newsletter.confirmSubscriber(db, staleConfirm),
    "confirmed",
  );
  assert.equal(suppression(db, "stale@example.com").reason, "user_unsubscribe");
  assert.equal(subscriber(db, "stale@example.com").status, "unsubscribed");
});

test("re-confirming after unsubscribe clears only the unsubscribe suppression", async () => {
  const db = database();
  const { env, messages } = environment(db);
  const id = seedSubscriber(db, "returning@example.com", "confirmed");
  await unsubscribeWithToken(env, db, "returning@example.com", id);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const again = await subscribe.POST({
    request: subscribeRequest({ email: "returning@example.com" }),
    locals: locals(env),
  });
  assert.equal(again.status, 200);
  assert.equal(messages.length, 1);
  assert.equal(
    await newsletter.confirmSubscriber(db, messages[0].token),
    "confirmed",
  );
  assert.equal(subscriber(db, "returning@example.com").status, "confirmed");
  assert.equal(suppression(db, "returning@example.com"), undefined);
});

test("provider suppressions survive unsubscribe and resubscribe", async () => {
  const db = database();
  const { env, messages } = environment(db, {
    RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });
  const id = seedSubscriber(db, "hard@example.com", "confirmed");
  const unsubscribeToken = seedToken(db, id, "hard@example.com", "unsubscribe");
  assert.equal(
    (await deliver(env, signedDelivery(bounce("hard@example.com")))).status,
    200,
  );
  await unsubscribe.POST({
    request: formPost(
      "https://news.anipotts.com/api/newsletter/unsubscribe",
      unsubscribeToken,
    ),
    locals: locals(env),
  });
  assert.equal(suppression(db, "hard@example.com").reason, "bounced");
  assert.equal(subscriber(db, "hard@example.com").status, "suppressed");

  await subscribe.POST({
    request: subscribeRequest({ email: "hard@example.com" }),
    locals: locals(env),
  });
  assert.equal(messages.length, 0);
  const lateToken = seedToken(db, id, "hard@example.com", "confirm", {
    createdAt: iso(60_000),
  });
  await newsletter.confirmSubscriber(db, lateToken);
  assert.equal(suppression(db, "hard@example.com").reason, "bounced");
  assert.equal(subscriber(db, "hard@example.com").status, "suppressed");
});

test("rows left by the older unsubscribe override stay suppressed", async () => {
  const db = database();
  const { env, messages } = environment(db);
  // Before this fix, unsubscribe replaced a complaint with an unsubscribe row
  // and reset the subscriber status.
  const id = seedSubscriber(db, "legacy@example.com", "unsubscribed", {
    suppressedAt: iso(-60_000),
    suppressionReason: "complained",
  });
  seedSuppression(db, "legacy@example.com", "user_unsubscribe");
  await subscribe.POST({
    request: subscribeRequest({ email: "legacy@example.com" }),
    locals: locals(env),
  });
  assert.equal(messages.length, 0);
  const token = seedToken(db, id, "legacy@example.com", "confirm", {
    createdAt: iso(60_000),
  });
  await newsletter.confirmSubscriber(db, token);
  assert.ok(suppression(db, "legacy@example.com"));
  assert.notEqual(subscriber(db, "legacy@example.com").status, "confirmed");
});

test("malformed token expiry fails closed", async () => {
  for (const expiresAt of ["not-a-date", ""]) {
    const db = database();
    const id = seedSubscriber(db, "expiry@example.com", "pending");
    const confirmToken = seedToken(db, id, "expiry@example.com", "confirm", {
      expiresAt,
    });
    assert.equal(
      await newsletter.confirmSubscriber(db, confirmToken),
      "expired",
    );
    assert.equal(subscriber(db, "expiry@example.com").status, "pending");
    const unsubscribeToken = seedToken(
      db,
      id,
      "expiry@example.com",
      "unsubscribe",
      { expiresAt },
    );
    assert.equal(
      await newsletter.unsubscribeByToken(db, unsubscribeToken),
      "expired",
    );
    assert.equal(suppression(db, "expiry@example.com"), undefined);
  }
});

test("rate limiting clears a bounded batch of expired client rows", async () => {
  const db = database();
  const expired = Date.now() - 11 * 60 * 1000;
  const insert = db.sql.prepare(
    "INSERT INTO rate_limits (key, ts) VALUES (?, ?)",
  );
  for (let index = 0; index < 250; index += 1) {
    insert.run(`contact:203.0.113.${index}`, expired);
  }
  for (let index = 0; index < 5; index += 1) {
    insert.run("admin-public:device:source", expired);
  }
  insert.run("contact:192.0.2.77", Date.now() - 1_000);
  const request = new Request("https://anipotts.com/api/subscribe", {
    headers: { "cf-connecting-ip": "192.0.2.1" },
  });
  const expiredClients = () =>
    count(
      db,
      "SELECT COUNT(*) AS cnt FROM rate_limits WHERE key LIKE 'contact:%' AND ts < ?",
      Date.now() - 10 * 60 * 1000,
    );

  assert.equal(await api.checkRateLimit(request, db), true);
  assert.equal(
    expiredClients(),
    150,
    "one request removes a bounded batch of other clients' expired rows",
  );
  for (let call = 0; call < 5; call += 1) await api.checkRateLimit(request, db);
  assert.equal(expiredClients(), 0);
  assert.equal(
    count(
      db,
      "SELECT COUNT(*) AS cnt FROM rate_limits WHERE key LIKE 'admin-public:%'",
    ),
    5,
  );
  assert.equal(
    count(
      db,
      "SELECT COUNT(*) AS cnt FROM rate_limits WHERE key = 'contact:192.0.2.77'",
    ),
    1,
  );
});
