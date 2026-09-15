import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { test } from "node:test";
import { classifyRequest, startCountingProxy } from "./perf-proxy.mjs";

async function upstreamServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

/** Sends one forward-proxy request (absolute URI) through the proxy. */
function viaProxy(proxy, target, { method = "GET", headers = {} } = {}) {
  const proxyUrl = new URL(proxy.origin);
  return new Promise((resolvePromise, reject) => {
    const req = request(
      {
        host: proxyUrl.hostname,
        port: proxyUrl.port,
        method,
        path: target,
        headers: { host: new URL(target).host, ...headers },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolvePromise({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("classifies documents, assets, api reads and speculation purposes", () => {
  const base = "http://127.0.0.1:8871";
  assert.deepEqual(
    classifyRequest({
      method: "GET",
      url: `${base}/content?group=writing`,
      headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
    }),
    { pathClass: "document", purpose: "none" },
  );
  assert.deepEqual(
    classifyRequest({
      method: "GET",
      url: `${base}/content/writing/x`,
      headers: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-purpose": "prefetch;prerender",
      },
    }),
    { pathClass: "document", purpose: "prerender" },
  );
  assert.deepEqual(
    classifyRequest({
      method: "GET",
      url: `${base}/content/writing/x`,
      headers: { "sec-fetch-dest": "document", "sec-purpose": "prefetch" },
    }),
    { pathClass: "document", purpose: "prefetch" },
  );
  assert.deepEqual(
    classifyRequest({
      method: "GET",
      url: `${base}/_astro/client.abc.js`,
      headers: { "sec-fetch-dest": "script", purpose: "prefetch" },
    }),
    { pathClass: "asset", purpose: "prefetch" },
  );
  assert.deepEqual(
    classifyRequest({
      method: "GET",
      url: `${base}/api/editorial/record?collection=writing`,
      headers: { "sec-fetch-dest": "empty" },
    }),
    { pathClass: "record-read", purpose: "none" },
  );
  assert.deepEqual(
    classifyRequest({
      method: "POST",
      url: `${base}/api/admin/observability`,
      headers: {},
    }),
    { pathClass: "api", purpose: "none" },
  );
  assert.deepEqual(
    classifyRequest({ method: "GET", url: `${base}/admin-bracket.svg` }),
    { pathClass: "other", purpose: "none" },
  );
});

test("forwards loopback requests to the upstream and counts each class", async () => {
  const upstream = await upstreamServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"error":"editor_not_configured"}');
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`ok ${req.url}`);
  });
  const proxy = await startCountingProxy({ upstream: upstream.origin });
  try {
    const document = await viaProxy(proxy, `${upstream.origin}/content`, {
      headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
    });
    assert.equal(document.status, 200);
    assert.equal(document.body, "ok /content");
    const record = await viaProxy(
      proxy,
      `${upstream.origin}/api/editorial/record?id=1`,
    );
    assert.equal(record.status, 503);
    await viaProxy(proxy, `${upstream.origin}/_astro/a.js`, {
      headers: { "sec-purpose": "prefetch" },
    });
    const snapshot = proxy.snapshot();
    assert.equal(snapshot.total, 3);
    assert.equal(snapshot.documents, 1);
    assert.equal(snapshot.speculative, 1);
    assert.deepEqual(snapshot.byClass, {
      document: 1,
      "record-read": 1,
      asset: 1,
    });
    assert.deepEqual(snapshot.byPurpose, { none: 2, prefetch: 1 });
    assert.equal(snapshot.completed, 3);
    assert.equal(snapshot.refused, 0);
    const recordEntry = snapshot.entries.find(
      (entry) => entry.pathClass === "record-read",
    );
    assert.equal(recordEntry.status, 503);
    assert.equal(recordEntry.completed, true);
    proxy.reset();
    assert.equal(proxy.snapshot().total, 0);
  } finally {
    await proxy.close();
    await upstream.close();
  }
});

test("refuses every origin other than the upstream and CONNECT tunnels", async () => {
  const upstream = await upstreamServer((_req, res) => res.end("ok"));
  const proxy = await startCountingProxy({ upstream: upstream.origin });
  try {
    const other = await viaProxy(proxy, "http://127.0.0.1:1/content");
    assert.equal(other.status, 403);
    const proxyUrl = new URL(proxy.origin);
    const connect = request({
      host: proxyUrl.hostname,
      port: proxyUrl.port,
      method: "CONNECT",
      path: "example.com:443",
    });
    connect.end();
    const [response] = await once(connect, "connect");
    assert.equal(response.statusCode, 405);
    const snapshot = proxy.snapshot();
    assert.equal(snapshot.refused, 2);
    assert.equal(snapshot.total, 2);
  } finally {
    await proxy.close();
    await upstream.close();
  }
});

test("records a read the browser aborts before its first response byte", async () => {
  let upstreamClosed = false;
  const upstream = await upstreamServer((req, res) => {
    req.on("close", () => {
      upstreamClosed = true;
    });
    const timer = setTimeout(() => res.end("late"), 500);
    res.on("close", () => clearTimeout(timer));
  });
  const proxy = await startCountingProxy({ upstream: upstream.origin });
  try {
    const proxyUrl = new URL(proxy.origin);
    const req = request({
      host: proxyUrl.hostname,
      port: proxyUrl.port,
      path: `${upstream.origin}/api/editorial/record?id=1`,
    });
    req.on("error", () => undefined);
    req.end();
    await new Promise((done) => setTimeout(done, 80));
    req.destroy();
    const deadline = Date.now() + 2000;
    while (!proxy.snapshot().entries[0]?.aborted && Date.now() < deadline)
      await new Promise((done) => setTimeout(done, 10));
    const [entry] = proxy.snapshot().entries;
    assert.equal(entry.pathClass, "record-read");
    assert.equal(entry.aborted, true);
    assert.equal(entry.abortedBeforeFirstByte, true);
    assert.equal(entry.completed, false);
    assert.equal(proxy.snapshot().abortedBeforeFirstByte, 1);
    while (!upstreamClosed && Date.now() < deadline)
      await new Promise((done) => setTimeout(done, 10));
    assert.equal(upstreamClosed, true, "the upstream request is cancelled");
  } finally {
    await proxy.close();
    await upstream.close();
  }
});

test("accepts only loopback upstreams", async () => {
  await assert.rejects(
    startCountingProxy({ upstream: "https://admin.anipotts.com" }),
    /loopback/,
  );
});
