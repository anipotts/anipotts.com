import { SignJWT, importJWK, type JWK, type JWTVerifyGetKey } from "jose";
import { verifyEditorialOwnerSession } from "./access-identity";
import {
  checkEditorialMutation,
  privateEditorialResponse,
  readEditorialJson,
} from "./editorial-security";

/**
 * Short private reader delegation for the tailnet reader on ap-mini.
 *
 * Disabled unless PRIVATE_READER_ENABLED is exactly "true" and a dedicated
 * ES256 private JWK is bound. No key is installed; this module only defines the
 * issuance contract. Device admission is enforced by the tailnet grant, never
 * by request headers, so this route reads no device, principal or scope header.
 */
export const PRIVATE_READER_PATH = "/api/private-reader/credential";
export const PRIVATE_READER_ISSUER = "https://admin.anipotts.com";
export const PRIVATE_READER_AUDIENCE = "https://ap-mini.tail060490.ts.net";
/** Server selected. Client-requested scopes are ignored. */
export const PRIVATE_READER_SCOPES = ["data:read", "activity:read"] as const;
export const PRIVATE_READER_MAX_LIFETIME_SECONDS = 60;
const MAX_BODY_BYTES = 1024;

export type PrivateReaderConfig = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_POLICY_AUD?: string;
  PRIVATE_READER_ENABLED?: string;
  PRIVATE_READER_SIGNING_KEY?: string;
};

export type PrivateReaderOptions = {
  /** Test seam for the Access certificate set; production fetches the team certs. */
  resolveAccessKey?: JWTVerifyGetKey;
  now?: () => number;
  origin?: string;
};

export type PrivateReaderCredentialBody = {
  credential: string;
  tokenType: "Bearer";
  audience: string;
  scope: string[];
  issuedAt: number;
  expiresAt: number;
};

function deny(error: string, status: number, headers?: HeadersInit): Response {
  const response = privateEditorialResponse({ error }, status);
  for (const [name, value] of new Headers(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

async function signingKey(value: string | undefined) {
  if (!value || value.length > 4096) return null;
  try {
    const jwk = JSON.parse(value) as JWK;
    if (
      jwk.kty !== "EC" ||
      jwk.crv !== "P-256" ||
      typeof jwk.d !== "string" ||
      (jwk.alg !== undefined && jwk.alg !== "ES256")
    )
      return null;
    return await importJWK(jwk, "ES256");
  } catch {
    // Never echo key parser details.
    return null;
  }
}

export async function privateReaderCredentialApi(
  request: Request,
  config: PrivateReaderConfig,
  options: PrivateReaderOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== PRIVATE_READER_PATH) return deny("not_found", 404);
  if (request.method !== "POST")
    return deny("method_not_allowed", 405, { Allow: "POST" });
  if (url.search) return deny("invalid_request", 400);
  if (config.PRIVATE_READER_ENABLED !== "true")
    return deny("reader_unavailable", 503);
  const key = await signingKey(config.PRIVATE_READER_SIGNING_KEY);
  if (!key) return deny("reader_unavailable", 503);

  const owner = await verifyEditorialOwnerSession(
    request,
    config,
    options.resolveAccessKey,
  );
  if (!owner) return deny("owner_required", 401);

  const rejection = checkEditorialMutation(
    request,
    options.origin ?? PRIVATE_READER_ISSUER,
  );
  if (rejection === "json_required") return deny("invalid_request", 400);
  if (rejection) return deny(rejection, 403);

  try {
    const body = await readEditorialJson(request, MAX_BODY_BYTES);
    if (body === null || typeof body !== "object" || Array.isArray(body))
      return deny("invalid_request", 400);
  } catch {
    return deny("invalid_request", 400);
  }

  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const expiresAt = Math.min(
    now + PRIVATE_READER_MAX_LIFETIME_SECONDS,
    Math.floor(owner.expiresAt),
  );
  // The delegation never outlives its parent Access session. No grace.
  if (expiresAt <= now) return deny("owner_required", 401);

  const scope = [...PRIVATE_READER_SCOPES];
  const credential = await new SignJWT({
    email: owner.email,
    scope: scope.join(" "),
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuer(PRIVATE_READER_ISSUER)
    .setAudience(PRIVATE_READER_AUDIENCE)
    .setSubject(owner.subject)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(expiresAt)
    .sign(key);

  const payload: PrivateReaderCredentialBody = {
    credential,
    tokenType: "Bearer",
    audience: PRIVATE_READER_AUDIENCE,
    scope,
    issuedAt: now,
    expiresAt,
  };
  return privateEditorialResponse(payload);
}
