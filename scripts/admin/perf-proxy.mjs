#!/usr/bin/env node

// Counting forward proxy for the Admin performance harness.
//
//   node scripts/admin/perf-proxy.mjs [--upstream <origin>] [--port <n>]
//
// Chromium sends every request for the upstream origin through this proxy,
// whichever browser target made it: the page, a speculation-rules prefetch or
// a prerender. It counts each request by path class and `Sec-Purpose`, which
// page-level Playwright request events cannot see, then forwards it unchanged.
// It listens on loopback only, accepts only a loopback upstream, and refuses
// every other origin and every CONNECT tunnel.
//
// perf-measure.mjs starts it in-process with --proxy. Run on its own, it
// prints the running totals on Ctrl+C. Snapshots keep full URLs in memory for
// the harness cross-check; nothing here writes a URL to disk.

import { Agent, createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function assertLoopback(origin, label) {
  const url = new URL(origin);
  if (url.protocol !== "http:")
    throw new Error(`${label} must be an http loopback origin`);
  if (!LOOPBACK.has(url.hostname) && !url.hostname.endsWith(".localhost"))
    throw new Error(`${label} must be a loopback origin`);
  return url;
}

/**
 * Path class and speculation purpose for one request.
 * `record-read` is split out of `api` because the intent cells count it.
 */
export function classifyRequest({ method, url, headers = {} }) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );
  const { pathname } = new URL(url);
  const purposeHeader = (
    lower["sec-purpose"] ??
    lower.purpose ??
    ""
  ).toLowerCase();
  const purpose = purposeHeader.includes("prerender")
    ? "prerender"
    : purposeHeader.includes("prefetch")
      ? "prefetch"
      : "none";
  let pathClass = "other";
  if (lower["sec-fetch-dest"] === "document") pathClass = "document";
  else if (pathname.startsWith("/_astro/")) pathClass = "asset";
  else if (method === "GET" && pathname === "/api/editorial/record")
    pathClass = "record-read";
  else if (pathname.startsWith("/api/")) pathClass = "api";
  return { pathClass, purpose };
}

const tally = (entries, key) =>
  entries.reduce((counts, entry) => {
    counts[entry[key]] = (counts[entry[key]] ?? 0) + 1;
    return counts;
  }, {});

/**
 * Starts the proxy. `reset()` clears the counters between harness steps and
 * `snapshot()` returns counts plus in-memory entries for the cross-check.
 */
export async function startCountingProxy({
  upstream = "http://127.0.0.1:8871",
  host = "127.0.0.1",
  port = 0,
} = {}) {
  const upstreamUrl = assertLoopback(upstream, "upstream");
  assertLoopback(`http://${host}`, "listen host");
  const agent = new Agent({ keepAlive: true, maxSockets: Infinity });
  let entries = [];
  let refused = 0;
  let refusedTargets = {};
  const started = performance.now();

  // Refused targets are tallied by origin and first path segment only.
  const noteRefused = (label) => {
    refused++;
    refusedTargets[label] = (refusedTargets[label] ?? 0) + 1;
  };
  const refuse = (response, status, label) => {
    noteRefused(label);
    response.writeHead(status, { "content-type": "text/plain" });
    response.end("refused by perf-proxy\n");
  };

  const server = createServer((clientRequest, clientResponse) => {
    let target;
    try {
      target = new URL(clientRequest.url);
    } catch {
      refuse(clientResponse, 400, "not an absolute URL");
      return;
    }
    if (target.origin !== upstreamUrl.origin) {
      refuse(
        clientResponse,
        403,
        `${target.origin}/${target.pathname.split("/")[1] ?? ""}`,
      );
      return;
    }
    const entry = {
      method: clientRequest.method,
      url: target.href,
      ...classifyRequest({
        method: clientRequest.method,
        url: target.href,
        headers: clientRequest.headers,
      }),
      startedAt: performance.now() - started,
      status: null,
      firstByteAt: null,
      endAt: null,
      completed: false,
      aborted: false,
      abortedBeforeFirstByte: false,
    };
    entries.push(entry);
    const headers = { ...clientRequest.headers };
    delete headers["proxy-connection"];
    const upstreamRequest = httpRequest(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port,
        method: clientRequest.method,
        path: target.pathname + target.search,
        headers,
        agent,
      },
      (upstreamResponse) => {
        entry.status = upstreamResponse.statusCode;
        entry.firstByteAt = performance.now() - started;
        clientResponse.writeHead(
          upstreamResponse.statusCode,
          upstreamResponse.statusMessage,
          upstreamResponse.rawHeaders,
        );
        upstreamResponse.on("error", () => clientResponse.destroy());
        upstreamResponse.pipe(clientResponse);
        upstreamResponse.on("end", () => {
          entry.completed = true;
          entry.endAt = performance.now() - started;
        });
      },
    );
    upstreamRequest.on("error", () => {
      if (!clientResponse.headersSent) {
        clientResponse.writeHead(502, { "content-type": "text/plain" });
        clientResponse.end("upstream error\n");
      } else clientResponse.destroy();
    });
    clientResponse.on("close", () => {
      if (entry.completed) return;
      entry.aborted = true;
      entry.abortedBeforeFirstByte = entry.firstByteAt === null;
      entry.endAt = performance.now() - started;
      upstreamRequest.destroy();
    });
    // A browser that cancels a request resets its socket; that is data,
    // not a proxy failure.
    clientRequest.on("error", () => upstreamRequest.destroy());
    clientResponse.on("error", () => upstreamRequest.destroy());
    clientRequest.pipe(upstreamRequest);
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("connection", (socket) => socket.on("error", () => undefined));
  server.on("connect", (connectRequest, socket) => {
    socket.on("error", () => undefined);
    noteRefused(`CONNECT ${String(connectRequest.url).slice(0, 80)}`);
    socket.end("HTTP/1.1 405 Method Not Allowed\r\n\r\n");
  });
  server.listen(port, host);
  await once(server, "listening");
  const address = server.address();

  return {
    origin: `http://${host}:${address.port}`,
    reset() {
      entries = [];
      refused = 0;
      refusedTargets = {};
    },
    snapshot() {
      const copy = entries.map((entry) => ({ ...entry }));
      return {
        total: copy.length + refused,
        refused,
        refusedTargets: { ...refusedTargets },
        documents: copy.filter(
          (entry) => entry.pathClass === "document" && entry.purpose === "none",
        ).length,
        speculative: copy.filter((entry) => entry.purpose !== "none").length,
        completed: copy.filter((entry) => entry.completed).length,
        aborted: copy.filter((entry) => entry.aborted).length,
        abortedBeforeFirstByte: copy.filter(
          (entry) => entry.abortedBeforeFirstByte,
        ).length,
        byClass: tally(copy, "pathClass"),
        byPurpose: tally(copy, "purpose"),
        entries: copy,
      };
    },
    async close() {
      server.closeAllConnections();
      agent.destroy();
      await new Promise((done) => server.close(done));
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const options = { upstream: "http://127.0.0.1:8871", port: 0 };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--upstream" && next) options.upstream = argv[++index];
    else if (arg === "--port" && next) options.port = Number(argv[++index]);
    else throw new Error(`unknown option ${arg}`);
  }
  const proxy = await startCountingProxy(options);
  console.log(`perf-proxy ${proxy.origin} -> ${options.upstream}`);
  const print = () => {
    const { entries: _entries, ...counts } = proxy.snapshot();
    console.log(JSON.stringify(counts));
  };
  process.on("SIGINT", async () => {
    print();
    await proxy.close();
    process.exit(0);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
