import assert from "node:assert/strict";
import test from "node:test";
import * as route from "../src/pages/ingest/[...path].ts";

// Proxy contract checked against posthog-js 1.430.3, the build the Shell.astro
// snippet loads from /ingest/static/array.js. The proxy never reaches PostHog
// from these tests: every upstream call goes to the stub below.
const EVENTS = "https://us.i.posthog.com";
const ASSETS = "https://us-assets.i.posthog.com";
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const TOKEN = "phc_TestProjectToken123";

/** Mirrors astro/dist/runtime/server/endpoint.js method dispatch and the
 *  decodeURI pathname normalization in core/render-context.js
 *  createNormalizedUrl (astro 5.18.2). */
function dispatch(request) {
  const url = new URL(request.url);
  try {
    url.pathname = decodeURI(url.pathname);
  } catch {
    // Astro keeps the raw pathname when it cannot be decoded.
  }
  const method = request.method.toUpperCase();
  let handler = route[method] ?? route.ALL;
  if (!handler && method === "HEAD" && route.GET) handler = route.GET;
  if (!handler) return Promise.resolve(new Response(null, { status: 404 }));
  const rest = url.pathname.replace(/^\/ingest\/?/, "");
  return handler({
    request,
    url,
    params: { path: rest ? decodeURI(rest) : undefined },
  });
}

async function bodyBytes(body) {
  if (body === undefined || body === null) return new Uint8Array(0);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function stubUpstream(
  t,
  respond = () =>
    new Response('{"status":1}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const call = {
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: await bodyBytes(init.body),
      signal: init.signal,
    };
    calls.push(call);
    return respond(call);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

async function assertBoundedError(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { error: code });
}

const ALLOWLISTED = [
  // Shell.astro:192 snippet: api_host + "/static/array.js".
  ["GET", "/ingest/static/array.js", `${ASSETS}/static/array.js`],
  // external-scripts-loader.js:105 legacy lazy bundle with ?v=version.
  [
    "GET",
    "/ingest/static/surveys.js?v=1.430.3",
    `${ASSETS}/static/surveys.js?v=1.430.3`,
  ],
  // external-scripts-loader.js:106-112 toolbar cache buster.
  [
    "GET",
    "/ingest/static/toolbar.js?v=1.430.3&t=1757851200000",
    `${ASSETS}/static/toolbar.js?v=1.430.3&t=1757851200000`,
  ],
  // external-scripts-loader.js:128 strict_script_versioning default.
  [
    "GET",
    "/ingest/static/1.430.3/posthog-recorder.js",
    `${ASSETS}/static/1.430.3/posthog-recorder.js`,
  ],
  // The toolbar.js loader imports its app relative to its own script URL:
  // new URL(`toolbar/${name}`, document.currentScript.src). The hashed app
  // falls back to toolbar-app.js?t=<5 minute bucket>, and the app imports
  // ./chunk-*.js siblings. Names below are from the 1.430.3 CDN build.
  [
    "GET",
    "/ingest/static/1.430.3/toolbar/toolbar-app-ENWASS6E.js",
    `${ASSETS}/static/1.430.3/toolbar/toolbar-app-ENWASS6E.js`,
  ],
  [
    "GET",
    "/ingest/static/1.430.3/toolbar/toolbar-app.js?t=1757851200000",
    `${ASSETS}/static/1.430.3/toolbar/toolbar-app.js?t=1757851200000`,
  ],
  [
    "GET",
    "/ingest/static/1.430.3/toolbar/chunk-chunk-ETAZNGYK.js",
    `${ASSETS}/static/1.430.3/toolbar/chunk-chunk-ETAZNGYK.js`,
  ],
  [
    "GET",
    "/ingest/static/1.430.3/toolbar/chunk-ActionsToolbarMenu-HPFZ4FZN.js",
    `${ASSETS}/static/1.430.3/toolbar/chunk-ActionsToolbarMenu-HPFZ4FZN.js`,
  ],
  // The legacy toolbar.js?v= fallback resolves the same names one level up.
  [
    "GET",
    "/ingest/static/toolbar/toolbar-app-ENWASS6E.js",
    `${ASSETS}/static/toolbar/toolbar-app-ENWASS6E.js`,
  ],
  // remote-config.js:34 and external-scripts-loader.js:120.
  [
    "GET",
    `/ingest/array/${TOKEN}/config?ip=0&_=1757851200000&ver=1.430.3`,
    `${EVENTS}/array/${TOKEN}/config?ip=0&_=1757851200000&ver=1.430.3`,
  ],
  [
    "GET",
    `/ingest/array/${TOKEN}/config.js`,
    `${EVENTS}/array/${TOKEN}/config.js`,
  ],
  // posthog-core.js:329 analyticsDefaultEndpoint, with and without the
  // trailing slash Astro's trailingSlash "never" redirect removes.
  [
    "POST",
    "/ingest/e?ip=0&_=1757851200000&ver=1.430.3&compression=gzip-js",
    `${EVENTS}/e?ip=0&_=1757851200000&ver=1.430.3&compression=gzip-js`,
  ],
  ["POST", "/ingest/e/?ip=0&ver=1.430.3", `${EVENTS}/e/?ip=0&ver=1.430.3`],
  // posthog-core.js:1009-1011 remote config analytics.endpoint override.
  [
    "POST",
    "/ingest/i/v0/e?ip=0&ver=1.430.3&compression=gzip-js",
    `${EVENTS}/i/v0/e?ip=0&ver=1.430.3&compression=gzip-js`,
  ],
  // posthog-logs.js:71 and posthog-metrics.js:21.
  ["POST", "/ingest/i/v1/logs?token=x", `${EVENTS}/i/v1/logs?token=x`],
  ["POST", "/ingest/i/v1/metrics", `${EVENTS}/i/v1/metrics`],
  // lazy-loaded-session-recorder.js:115 BASE_ENDPOINT.
  [
    "POST",
    "/ingest/s?ip=0&ver=1.430.3&compression=gzip-js",
    `${EVENTS}/s?ip=0&ver=1.430.3&compression=gzip-js`,
  ],
  ["POST", "/ingest/s/?ver=1.430.3", `${EVENTS}/s/?ver=1.430.3`],
  // posthog-featureflags.js:960 and :1320.
  [
    "POST",
    "/ingest/flags?v=2&config=true&ip=0",
    `${EVENTS}/flags?v=2&config=true&ip=0`,
  ],
  [
    "POST",
    "/ingest/flags/?v=2&only_evaluate_survey_feature_flags=true",
    `${EVENTS}/flags/?v=2&only_evaluate_survey_feature_flags=true`,
  ],
  // posthog-surveys.js:299 and posthog-product-tours.js:108.
  [
    "GET",
    `/ingest/api/surveys?token=${TOKEN}`,
    `${EVENTS}/api/surveys?token=${TOKEN}`,
  ],
  [
    "GET",
    `/ingest/api/product_tours?token=${TOKEN}`,
    `${EVENTS}/api/product_tours?token=${TOKEN}`,
  ],
];

test("every posthog-js endpoint proxies to its host with the query intact", async (t) => {
  const calls = stubUpstream(t);
  for (const [method, path, expected] of ALLOWLISTED) {
    const request = new Request(`https://anipotts.com${path}`, {
      method,
      body: method === "POST" ? '{"batch":[]}' : undefined,
      headers:
        method === "POST" ? { "content-type": "application/json" } : undefined,
    });
    const response = await dispatch(request);
    assert.equal(response.status, 200, `${method} ${path}`);
    const call = calls.at(-1);
    assert.equal(call.url, expected, `${method} ${path}`);
    assert.equal(call.method, method, `${method} ${path}`);
  }
  assert.equal(calls.length, ALLOWLISTED.length);
});

test("paths outside the posthog-js allowlist return 404 without contacting upstream", async (t) => {
  const calls = stubUpstream(t);
  for (const [method, path] of [
    ["GET", "/ingest/"],
    ["GET", "/ingest"],
    ["GET", "/ingest/static/index.html"],
    ["GET", "/ingest/static/array.js.map"],
    ["GET", "/ingest/static/%2e%2e/array.js"],
    ["GET", "/ingest/static/..%2fapi.js"],
    ["GET", "/ingest/static/a/b/c.js"],
    ["GET", "/ingest/static/%252e%252e/toolbar.js"],
    ["GET", "/ingest/static/1.430.3/other/toolbar-app.js"],
    ["GET", "/ingest/static/toolbar/toolbar/toolbar-app.js"],
    ["GET", "/ingest/static/toolbar/1.430.3/toolbar-app.js"],
    ["GET", "/ingest/static/1.430.3/toolbar/toolbar-app.js.map"],
    // toolbar-app.js links its stylesheet with an absolute us-assets URL.
    ["GET", "/ingest/static/1.430.3/toolbar/toolbar-app.css"],
    ["GET", `/ingest/array/${TOKEN}/settings`],
    ["GET", "/ingest/array/phc%2Fx/config"],
    ["GET", "/ingest/api/projects/1/insights"],
    ["GET", "/ingest/api/web_experiments?token=x"],
    ["GET", "/ingest/api/early_access_features?token=x"],
    ["POST", "/ingest/api/conversations/v1/widget/message"],
    ["GET", "/ingest/login"],
    ["GET", "/ingest/project/1/replay/abc"],
    // posthog-js 1.430.3 never calls these legacy or server SDK endpoints.
    ["POST", "/ingest/decide?v=3"],
    ["POST", "/ingest/batch"],
    ["POST", "/ingest/e/extra"],
    ["POST", "/ingest/capture"],
  ]) {
    const response = await dispatch(
      new Request(`https://anipotts.com${path}`, {
        method,
        body: method === "POST" ? "{}" : undefined,
      }),
    );
    await assertBoundedError(response, 404, "not_found");
  }
  assert.equal(calls.length, 0);
});

test("only allowlisted request headers reach upstream; credentials never do", async (t) => {
  const calls = stubUpstream(t);
  const payload = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff, 0x00, 0x7f]);
  const response = await dispatch(
    new Request(
      "https://anipotts.com/ingest/e?ip=0&ver=1.430.3&compression=gzip-js",
      {
        method: "POST",
        body: payload,
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          authorization: "Bearer owner-session",
          "cf-access-jwt-assertion": "access-token",
          "cf-connecting-ip": "203.0.113.7",
          "cf-ray": "ray",
          "content-type": "text/plain",
          cookie: "__Host-session=secret; ph_phc_x_posthog=abc",
          host: "evil.example",
          origin: "https://anipotts.com",
          "proxy-authorization": "Basic Zm9vOmJhcg==",
          referer: "https://anipotts.com/writing",
          "user-agent": "Mozilla/5.0 test",
          "x-api-key": "key",
          "x-conversations-token": "widget",
          "x-forwarded-for": "198.51.100.1, 192.0.2.9",
          "x-real-ip": "198.51.100.1",
        },
      },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.deepEqual(Object.fromEntries(call.headers), {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "text/plain",
    origin: "https://anipotts.com",
    referer: "https://anipotts.com/writing",
    "user-agent": "Mozilla/5.0 test",
    "x-forwarded-for": "203.0.113.7",
  });
  assert.equal(call.headers.has("cookie"), false);
  assert.equal(call.headers.has("authorization"), false);
  assert.deepEqual(call.body, payload, "binary gzip body is forwarded intact");
});

test("the client IP header is omitted when the edge supplies no valid address", async (t) => {
  const calls = stubUpstream(t);
  for (const headers of [
    { "x-forwarded-for": "198.51.100.1" },
    { "cf-connecting-ip": "203.0.113.7, 198.51.100.1" },
    { "cf-connecting-ip": "<script>" },
  ]) {
    await dispatch(
      new Request("https://anipotts.com/ingest/flags?v=2", {
        method: "POST",
        body: "{}",
        headers,
      }),
    );
    assert.equal(calls.at(-1).headers.has("x-forwarded-for"), false);
  }
  await dispatch(
    new Request("https://anipotts.com/ingest/flags?v=2", {
      method: "POST",
      body: "{}",
      headers: { "cf-connecting-ip": "2001:db8::1" },
    }),
  );
  assert.equal(calls.at(-1).headers.get("x-forwarded-for"), "2001:db8::1");
});

test("upstream set-cookie and other response headers are not passed through", async (t) => {
  stubUpstream(
    t,
    () =>
      new Response("!function(){}()", {
        status: 200,
        headers: {
          "access-control-allow-credentials": "true",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=14400",
          "content-type": "application/javascript",
          "set-cookie": "ph_session=1; Domain=anipotts.com; Path=/",
          server: "posthog",
          "x-internal-trace": "abc",
        },
      }),
  );
  const response = await dispatch(
    new Request("https://anipotts.com/ingest/static/array.js"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Object.fromEntries(response.headers), {
    "cache-control": "public, max-age=14400",
    "content-type": "application/javascript",
  });
  assert.equal(await response.text(), "!function(){}()");
});

test("static bundles keep conditional revalidation through the proxy", async (t) => {
  const calls = stubUpstream(t, (call) =>
    call.headers.get("if-none-match") === 'W/"array-1.430.3"'
      ? new Response(null, {
          status: 304,
          headers: {
            "cache-control": "public, max-age=14400",
            etag: 'W/"array-1.430.3"',
            "last-modified": "Sat, 12 Sep 2026 15:37:37 GMT",
            "set-cookie": "ph_session=1; Path=/",
          },
        })
      : new Response("!function(){}()", {
          status: 200,
          headers: {
            "cache-control": "public, max-age=14400",
            "content-type": "application/javascript",
            etag: 'W/"array-1.430.3"',
            "last-modified": "Sat, 12 Sep 2026 15:37:37 GMT",
          },
        }),
  );
  const fresh = await dispatch(
    new Request("https://anipotts.com/ingest/static/array.js"),
  );
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers.get("etag"), 'W/"array-1.430.3"');
  assert.equal(
    fresh.headers.get("last-modified"),
    "Sat, 12 Sep 2026 15:37:37 GMT",
  );

  const revalidated = await dispatch(
    new Request("https://anipotts.com/ingest/static/array.js", {
      headers: {
        "if-modified-since": "Sat, 12 Sep 2026 15:37:37 GMT",
        "if-none-match": 'W/"array-1.430.3"',
      },
    }),
  );
  const call = calls.at(-1);
  assert.equal(call.headers.get("if-none-match"), 'W/"array-1.430.3"');
  assert.equal(
    call.headers.get("if-modified-since"),
    "Sat, 12 Sep 2026 15:37:37 GMT",
  );
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.body, null);
  assert.deepEqual(Object.fromEntries(revalidated.headers), {
    "cache-control": "public, max-age=14400",
    etag: 'W/"array-1.430.3"',
    "last-modified": "Sat, 12 Sep 2026 15:37:37 GMT",
  });
});

test("upstream status is preserved, including bodyless statuses", async (t) => {
  let status = 204;
  stubUpstream(t, () =>
    status === 204
      ? new Response(null, { status })
      : new Response("rate limited", {
          status,
          headers: { "content-type": "text/plain" },
        }),
  );
  const empty = await dispatch(
    new Request("https://anipotts.com/ingest/s?ver=1.430.3", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(empty.status, 204);
  status = 429;
  const limited = await dispatch(
    new Request("https://anipotts.com/ingest/e?ver=1.430.3", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(limited.status, 429);
});

test("only GET and POST reach upstream; OPTIONS answers locally", async (t) => {
  const calls = stubUpstream(t);
  for (const method of ["PUT", "PATCH", "DELETE", "HEAD"]) {
    const response = await dispatch(
      new Request("https://anipotts.com/ingest/e", {
        method,
        body: ["PUT", "PATCH", "DELETE"].includes(method) ? "{}" : undefined,
      }),
    );
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET, POST, OPTIONS", method);
  }
  const preflight = await dispatch(
    new Request("https://anipotts.com/ingest/e", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("allow"), "GET, POST, OPTIONS");
  assert.equal(preflight.headers.has("access-control-allow-origin"), false);
  assert.equal(calls.length, 0);
});

test("the upstream fetch aborts after the timeout with a bounded 504", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  let started;
  const fetchStarted = new Promise((resolve) => {
    started = resolve;
  });
  stubUpstream(t, (call) => {
    signal = call.signal;
    started();
    if (!signal) throw new Error("upstream secret detail: no abort signal");
    return new Promise((_, reject) => {
      signal.addEventListener("abort", () =>
        reject(new Error("upstream secret detail: aborted")),
      );
    });
  });
  const pending = dispatch(
    new Request("https://anipotts.com/ingest/e?ver=1.430.3", {
      method: "POST",
      body: "{}",
    }),
  );
  await fetchStarted;
  t.mock.timers.tick(TIMEOUT_MS - 1);
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(1);
  const response = await pending;
  assert.equal(signal.aborted, true);
  await assertBoundedError(response, 504, "upstream_timeout");
});

test("a stalled upstream body also ends in a bounded 504", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let started;
  const fetchStarted = new Promise((resolve) => {
    started = resolve;
  });
  stubUpstream(t, (call) => {
    started();
    if (!call.signal) throw new Error("upstream secret detail: no signal");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial upstream"));
        call.signal.addEventListener("abort", () =>
          controller.error(new Error("upstream secret detail")),
        );
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/javascript" },
    });
  });
  const pending = dispatch(
    new Request("https://anipotts.com/ingest/static/array.js"),
  );
  await fetchStarted;
  // Let the handler start reading the upstream body before the timer fires.
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(TIMEOUT_MS);
  await assertBoundedError(await pending, 504, "upstream_timeout");
});

test("upstream network failures return a bounded 502 without provider text", async (t) => {
  stubUpstream(t, () => {
    throw new TypeError("upstream secret detail: connect ECONNREFUSED");
  });
  const response = await dispatch(
    new Request("https://anipotts.com/ingest/flags?v=2", {
      method: "POST",
      body: "{}",
    }),
  );
  await assertBoundedError(response, 502, "upstream_unavailable");
});

test("request bodies over the cap return 413 without contacting upstream", async (t) => {
  const calls = stubUpstream(t);
  const declared = await dispatch(
    new Request("https://anipotts.com/ingest/s?ver=1.430.3", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    }),
  );
  await assertBoundedError(declared, 413, "payload_too_large");

  let cancelled = false;
  let sent = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const streamed = await dispatch(
    new Request("https://anipotts.com/ingest/s?ver=1.430.3", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        pull(controller) {
          if (sent > MAX_BODY_BYTES + chunk.byteLength * 4) {
            controller.close();
            return;
          }
          sent += chunk.byteLength;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      }),
    }),
  );
  await assertBoundedError(streamed, 413, "payload_too_large");
  assert.equal(cancelled, true, "oversized request stream is cancelled");
  assert.ok(sent <= MAX_BODY_BYTES + chunk.byteLength * 2);
  assert.equal(calls.length, 0);
});

test("a request body exactly at the cap is forwarded", async (t) => {
  const calls = stubUpstream(t);
  const body = new Uint8Array(MAX_BODY_BYTES).fill(7);
  const response = await dispatch(
    new Request("https://anipotts.com/ingest/s?ver=1.430.3", {
      method: "POST",
      body,
      headers: { "content-type": "text/plain" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.byteLength, MAX_BODY_BYTES);
});

test("streamed request bodies are forwarded byte for byte", async (t) => {
  const calls = stubUpstream(t);
  const sizes = [1, 70_000, 3, 200_000, 65_536];
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const expected = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    expected[index] = (index * 31 + 7) % 251;
  }
  const streamOf = () => {
    let offset = 0;
    let chunk = 0;
    return new ReadableStream({
      pull(controller) {
        if (chunk === sizes.length) {
          controller.close();
          return;
        }
        const size = sizes[chunk];
        controller.enqueue(expected.slice(offset, offset + size));
        offset += size;
        chunk += 1;
      },
    });
  };
  for (const headers of [
    {},
    { "content-length": String(total) },
    { "content-length": "not-a-number" },
  ]) {
    const response = await dispatch(
      new Request("https://anipotts.com/ingest/s?ver=1.430.3", {
        method: "POST",
        duplex: "half",
        body: streamOf(),
        headers,
      }),
    );
    assert.equal(response.status, 200, JSON.stringify(headers));
    assert.deepEqual(calls.at(-1).body, expected, JSON.stringify(headers));
  }
  const empty = await dispatch(
    new Request("https://anipotts.com/ingest/e?ver=1.430.3", {
      method: "POST",
      body: "",
    }),
  );
  assert.equal(empty.status, 200);
  assert.equal(calls.at(-1).body.byteLength, 0);
});
