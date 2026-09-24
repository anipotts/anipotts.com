import { ADMIN_ROUTES } from "../../../../scripts/ci/admin-route-inventory.mjs";

/** Paths served without an Access principal. */
export const PUBLIC_PATHS = new Set([
  "/auth",
  "/api/health",
  "/favicon.svg",
  "/admin-bracket.svg",
  "/favicon-light.svg",
  "/favicon-dark.svg",
  "/favicon-light-32.png",
  "/favicon-dark-32.png",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
]);

export const PUBLIC_PREFIXES = ["/_astro/", "/assets/"];

/**
 * In development, loopback reads reach every inventoried page without a
 * session, so this list follows the route inventory instead of copying it.
 * Editorial pages never get here: middleware serves them to the local editor.
 */
export const DEV_LOOPBACK_PREVIEW_PATHS = new Set(
  ADMIN_ROUTES.map(({ route }) => route).filter(
    (route) => !/^\/(?:api|auth|preview)(?:\/|$)/.test(route),
  ),
);
/** Dynamic pages: a Data record, and the retired Life sections' redirects. */
export const DEV_LOOPBACK_PREVIEW_PATTERNS = [
  /^\/data\/records\/rec-[0-9a-f]{32}$/,
  /^\/life\/[a-z]+$/,
];
export const DEV_PREVIEW_ASSET_PATHS = new Set(["/@react-refresh"]);
export const DEV_PREVIEW_ASSET_PREFIXES = ["/@id/", "/@vite/", "/src/"];
export const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_OWNER_CLIENT_ADDRESS_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
];

/**
 * A local owner request reaches a loopback Admin host directly.
 * Any host or client header naming somewhere else means a proxy or tunnel,
 * and cross-origin browser writes never borrow the local identity.
 */
export function isLocalOwnerRequest({
  enabled,
  method,
  url,
  headers,
}: {
  enabled: boolean;
  method: string;
  url: URL;
  headers: Headers;
}): boolean {
  if (enabled !== true) return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!isLocalOwnerHostname(url.hostname)) return false;
  const host = headers.get("host");
  if (host !== null && authorityHostname(host) !== url.hostname) return false;
  const forwarded = parseForwarded(headers.get("forwarded"));
  const forwardedHosts = [
    ...splitHeader(headers.get("x-forwarded-host")),
    ...forwarded.hosts,
  ];
  if (
    forwardedHosts.some(
      (value) => !isLocalOwnerHostname(authorityHostname(value)),
    )
  ) {
    return false;
  }
  const clients = [
    ...LOCAL_OWNER_CLIENT_ADDRESS_HEADERS.flatMap((name) =>
      splitHeader(headers.get(name)),
    ),
    ...forwarded.clients,
  ];
  if (clients.some((value) => !isLoopbackAddress(value))) return false;
  if (method !== "GET" && method !== "HEAD") {
    const origin = headers.get("origin");
    if (origin !== null && origin !== url.origin) return false;
    const site = headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") return false;
  }
  return true;
}

function isLocalOwnerHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

function authorityHostname(authority: string): string {
  const value = authority.trim();
  if (!value || /[\s/?#@\\]/.test(value)) return "";
  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return "";
  }
}

function splitHeader(value: string | null): string[] {
  return value === null ? [] : value.split(",").map((part) => part.trim());
}

function parseForwarded(value: string | null): {
  hosts: string[];
  clients: string[];
} {
  const hosts: string[] = [];
  const clients: string[] = [];
  for (const element of splitHeader(value)) {
    for (const pair of element.split(";")) {
      const separator = pair.indexOf("=");
      if (separator < 0) continue;
      const key = pair.slice(0, separator).trim().toLowerCase();
      const raw = pair.slice(separator + 1).trim();
      const parameter = raw.replace(/^"(.*)"$/, "$1");
      if (key === "host") hosts.push(parameter);
      if (key === "for") clients.push(parameter);
    }
  }
  return { hosts, clients };
}

function isLoopbackAddress(value: string): boolean {
  let address = value.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1]!;
  else if (/^[\d.]+:\d+$/.test(address)) address = address.split(":")[0]!;
  if (address.startsWith("::ffff:")) address = address.slice(7);
  if (address === "::1") return true;
  const octets = address.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

export function isDevLoopbackPreviewRequest({
  isDev,
  method,
  url,
}: {
  isDev: boolean;
  method: string;
  url: URL;
}): boolean {
  return (
    isDev &&
    (method === "GET" || method === "HEAD") &&
    isApprovedDevPreviewOrigin(url) &&
    (DEV_LOOPBACK_PREVIEW_PATHS.has(url.pathname) ||
      DEV_LOOPBACK_PREVIEW_PATTERNS.some((pattern) =>
        pattern.test(url.pathname),
      ) ||
      DEV_PREVIEW_ASSET_PATHS.has(url.pathname) ||
      DEV_PREVIEW_ASSET_PREFIXES.some((prefix) =>
        url.pathname.startsWith(prefix),
      ))
  );
}

/** Local dev servers listen on loopback, on the managed 4311 preview or a
 * per-worktree port, so any loopback origin over plain HTTP qualifies. */
export function isApprovedDevPreviewOrigin(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
}

export function isPublicAdminPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
