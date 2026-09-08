const PUBLIC_PATHS = new Set([
  "/auth",
  "/auth/passkey",
  "/auth/invite",
  "/auth/recover",
  "/api/health",
  "/api/mcp",
  "/favicon.svg",
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

type AdminAccessInput = {
  isDev: boolean;
  method: string;
  url: URL;
  hasSession: boolean;
};

export type AdminAccessDecision =
  "public" | "dev-loopback-preview" | "session" | "passkey-required";

export function decideAdminAccess({
  isDev,
  method,
  url,
  hasSession,
}: AdminAccessInput): AdminAccessDecision {
  if (isPublicAdminPath(url.pathname)) return "public";
  if (isDevLoopbackPreviewRequest({ isDev, method, url })) {
    return "dev-loopback-preview";
  }
  if (hasSession) return "session";
  return "passkey-required";
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

function isApprovedDevPreviewOrigin(url: URL): boolean {
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
