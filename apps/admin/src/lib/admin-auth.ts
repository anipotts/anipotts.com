import type { APIContext } from "astro";

/** Cookies the retired native sessions set. Nothing reads them; sign out
 * expires them so an old browser drops its copy. */
const RETIRED_SESSION_COOKIES = [
  "__Host-admin_session",
  "admin_passkey_session",
  "admin_session",
];

export type AdminRole = "owner" | "viewer";
export type AdminAuthMethod =
  | "cloudflare_access"
  // Synthetic identity from a build compiled with ADMIN_LOCAL_OWNER=1; never stored.
  | "local_owner";

/** Cloudflare Access is the only sign-in. Middleware attaches the verified
 * owner as a read-only viewer, or the synthetic local owner in a local build. */
export type AdminPrincipal = {
  userId: string;
  role: AdminRole;
  sessionId: string;
  authMethod: AdminAuthMethod;
  stepUpAt: null;
  restriction: null;
  displayName: string;
  credentialId: null;
};

export type AdminAuthContext = Pick<
  APIContext,
  "cookies" | "locals" | "request" | "url"
>;

export function assertExactOrigin(request: Request, url: URL): void {
  const origin = request.headers.get("origin");
  if (origin !== url.origin) {
    throw adminJson({ error: "invalid_origin" }, { status: 403 });
  }
}

export function expiredAdminSessionCookies(): string[] {
  return RETIRED_SESSION_COOKIES.map(
    (name) => `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`,
  );
}

export function adminJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
      ...(init.headers ?? {}),
    },
  });
}
