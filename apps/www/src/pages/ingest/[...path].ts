import type { APIRoute } from "astro";

export const prerender = false;

/** posthog reverse proxy (replaces the next.js /ingest rewrites). static
 *  assets go to us-assets, events to us.
 *
 *  Shell.astro sets api_host "/ingest", so every posthog-js request arrives
 *  here. Only the endpoints posthog-js 1.430.3 calls through api_host are
 *  forwarded (source lines are noted in apps/www/test/ingest-proxy.test.mjs).
 *  Requests carry an explicit header allowlist and a bounded body, and
 *  upstream gets a fixed time budget. */
const EVENTS_HOST = "https://us.i.posthog.com";
const ASSETS_HOST = "https://us-assets.i.posthog.com";
const PREFIX = "/ingest/";

const UPSTREAM_TIMEOUT_MS = 10_000;
// The largest posthog-js body is a replay batch: buffers split near 6.3 MB
// and the uncompressed base64 fallback adds about a third on top.
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_METHODS = "GET, POST, OPTIONS";

// Trailing slashes are optional because trailingSlash "never" redirects
// "/ingest/e/" to "/ingest/e" before this handler runs.
const ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  // Snippet array.js plus lazy bundles, legacy and version-pinned.
  [
    /^static\/(?:[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.js$/,
    ASSETS_HOST,
  ],
  // Events, the remote config endpoint override, logs and metrics.
  [/^e\/?$/, EVENTS_HOST],
  [/^i\/v[0-9]+\/[a-z]+\/?$/, EVENTS_HOST],
  // Session replay.
  [/^s\/?$/, EVENTS_HOST],
  // Feature flags.
  [/^flags\/?$/, EVENTS_HOST],
  // Remote config, JSON and script forms.
  [/^array\/[A-Za-z0-9_-]{1,128}\/config(?:\.js)?$/, EVENTS_HOST],
  // Surveys and product tours are enabled by default in posthog-js.
  [/^api\/(?:surveys|product_tours)\/?$/, EVENTS_HOST],
];

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "origin",
  "referer",
  "user-agent",
];
const RETURNED_RESPONSE_HEADERS = ["cache-control", "content-type"];
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const CLIENT_IP = /^[0-9A-Fa-f:.]{2,45}$/;

function failure(
  status: number,
  error: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );
}

function upstreamFor(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null;
  const path = pathname.slice(PREFIX.length);
  const route = ROUTES.find(([pattern]) => pattern.test(path));
  return route ? `${route[1]}/${path}` : null;
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // One client address for PostHog geo, taken only from the Cloudflare edge.
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (clientIp && CLIENT_IP.test(clientIp)) {
    headers.set("x-forwarded-for", clientIp);
  }
  return headers;
}

/** Reads the request body up to MAX_BODY_BYTES; null means it is too large. */
async function boundedBody(request: Request): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return null;
  }
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

const handler: APIRoute = async ({ request, url }) => {
  const upstream = upstreamFor(url.pathname);
  if (!upstream) return failure(404, "not_found");

  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    // posthog-js calls a same-origin api_host, so no preflight is forwarded.
    return new Response(null, {
      status: 204,
      headers: { allow: ALLOWED_METHODS },
    });
  }
  if (method !== "GET" && method !== "POST") {
    return failure(405, "method_not_allowed", { allow: ALLOWED_METHODS });
  }

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    let bounded: ArrayBuffer | null;
    try {
      bounded = await boundedBody(request);
    } catch {
      return failure(400, "invalid_body");
    }
    if (!bounded) return failure(413, "payload_too_large");
    body = bounded;
  }

  const target = new URL(upstream);
  target.search = url.search;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method,
      headers: forwardedHeaders(request),
      body,
      signal: controller.signal,
    });
    // Buffer inside the time budget so a stalled upstream body cannot hang.
    // fetch already decoded any content-encoding, so that header is dropped.
    const payload = await response.arrayBuffer();
    const headers = new Headers();
    for (const name of RETURNED_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return new Response(
      NULL_BODY_STATUSES.has(response.status) ? null : payload,
      { status: response.status, headers },
    );
  } catch {
    return controller.signal.aborted
      ? failure(504, "upstream_timeout")
      : failure(502, "upstream_unavailable");
  } finally {
    clearTimeout(timer);
  }
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
export const ALL = handler;
