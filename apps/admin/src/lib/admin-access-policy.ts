const PUBLIC_PATHS = new Set([
  "/auth",
  "/auth/passkey",
  "/auth/invite",
  "/auth/recover",
  "/api/health",
  "/api/mcp",
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

const PUBLIC_PASSKEY_API_PATHS = new Set([
  "/api/admin/auth/session",
  "/api/admin/passkey/login-options",
  "/api/admin/passkey/login-verify",
  "/api/admin/passkey/logout",
  "/api/admin/passkey/register-options",
  "/api/admin/passkey/register-verify",
  "/api/admin/passkey/revoke-current",
  "/api/admin/passkey/status",
  "/api/admin/password/login",
  "/api/admin/password/logout",
  "/api/admin/password/status",
  "/api/admin/device/start",
  "/api/admin/device/status",
  "/api/admin/device/claim",
  "/api/admin/invites/status",
  "/api/admin/invites/register-options",
  "/api/admin/invites/register-verify",
  "/api/admin/recovery/google/start",
  "/api/admin/recovery/google/callback",
]);

const PUBLIC_PREFIXES = ["/_astro/", "/assets/"];
const DEV_LOOPBACK_ORIGINS = new Set([
  "http://localhost:4311",
  "http://127.0.0.1:4311",
]);
const DEV_LOOPBACK_PREVIEW_PATHS = new Set([
  "/",
  "/inbox",
  "/operations/observability",
  "/work",
  "/content",
  "/content/carousels",
  "/content/drafts",
  "/content/operations",
  "/content/preview",
  "/content/review",
  "/deploys",
  "/fleet",
  "/handoffs",
  "/knowledge",
  "/knowledge/locations",
  "/life",
  "/life/people",
  "/life/projects",
  "/life/places",
  "/life/timeline",
  "/life/sources",
  "/life/preview",
  "/life/aesthetics",
  "/life/health",
  "/mutations",
  "/newsletter",
  "/proof",
  "/repos",
  "/system",
]);
const DEV_PREVIEW_ASSET_PATHS = new Set(["/@react-refresh"]);
const DEV_PREVIEW_ASSET_PREFIXES = ["/@id/", "/@vite/", "/src/"];
const DEV_PORTLESS_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?admin\.anipotts\.localhost$/;

const LOCAL_OWNER_LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
const LOCAL_OWNER_CLIENT_ADDRESS_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
];

type AdminAccessInput = {
  isDev: boolean;
  /** The build-time ADMIN_LOCAL_OWNER flag, never a runtime value. */
  localOwner?: boolean;
  method: string;
  url: URL;
  headers?: Headers;
  hasSession: boolean;
};

export type AdminAccessDecision =
  | "public"
  | "local-owner"
  | "dev-loopback-preview"
  | "session"
  | "passkey-required";

export function decideAdminAccess({
  isDev,
  localOwner = false,
  method,
  url,
  headers = new Headers(),
  hasSession,
}: AdminAccessInput): AdminAccessDecision {
  if (isPublicAdminPath(url.pathname)) return "public";
  if (isLocalOwnerRequest({ enabled: localOwner, method, url, headers })) {
    return "local-owner";
  }
  if (isDevLoopbackPreviewRequest({ isDev, method, url })) {
    return "dev-loopback-preview";
  }
  if (hasSession) return "session";
  return "passkey-required";
}

/**
 * A local owner request reaches a loopback or Portless Admin host directly.
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
  return (
    LOCAL_OWNER_LOOPBACK_HOSTNAMES.has(hostname) ||
    DEV_PORTLESS_HOST_PATTERN.test(hostname)
  );
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
}: Omit<AdminAccessInput, "hasSession">): boolean {
  return (
    isDev &&
    (method === "GET" || method === "HEAD") &&
    isApprovedDevPreviewOrigin(url) &&
    (DEV_LOOPBACK_PREVIEW_PATHS.has(url.pathname) ||
      /^\/content\/(?:home|workPage|writingPage|systemsPage|newsletterPage|newsletterArchivePage|projects|writing)\/[a-z0-9_-]+$/.test(
        url.pathname,
      ) ||
      /^\/newsletter\/[a-z0-9-]+$/.test(url.pathname) ||
      DEV_PREVIEW_ASSET_PATHS.has(url.pathname) ||
      DEV_PREVIEW_ASSET_PREFIXES.some((prefix) =>
        url.pathname.startsWith(prefix),
      ))
  );
}

export function isApprovedDevPreviewOrigin(url: URL): boolean {
  if (DEV_LOOPBACK_ORIGINS.has(url.origin)) return true;
  if (!DEV_PORTLESS_HOST_PATTERN.test(url.hostname)) return false;
  return (
    (url.protocol === "http:" && url.port === "1355") ||
    (url.protocol === "https:" && (url.port === "" || url.port === "443"))
  );
}

export function isPublicAdminPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PASSKEY_API_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
