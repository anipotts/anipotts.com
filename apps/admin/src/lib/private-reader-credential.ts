import { SignJWT, importJWK, type JWK, type JWTVerifyGetKey } from "jose";
import { verifyEditorialOwner, type AccessOwner } from "./access-identity";
import {
  checkEditorialMutation,
  privateJson,
  readEditorialJson,
} from "./editorial-security";

/**
 * Short private reader delegation for the tailnet reader on ap-mini.
 *
 * Disabled unless PRIVATE_READER_ENABLED is exactly "true" and a dedicated
 * ES256 private JWK is bound. Device admission is enforced by the tailnet
 * grant, never by request headers, so this reads no device, principal or scope
 * header. It reuses the owner middleware verified, verifying only without one.
 */
export const PRIVATE_READER_PATH = "/api/private-reader/credential";
/** Separate issuance for the Observability Status view. */
export const PRIVATE_READER_OPS_PATH = "/api/private-reader/ops-credential";
/** Separate issuance for the Data Health view. */
export const PRIVATE_READER_HEALTH_PATH =
  "/api/private-reader/health-credential";
export const PRIVATE_READER_ISSUER = "https://admin.anipotts.com";
export const PRIVATE_READER_AUDIENCE = "https://ap-mini.tail060490.ts.net";
/** Server selected. Client-requested scopes are ignored. */
export const PRIVATE_READER_SCOPES = ["data:read", "activity:read"] as const;
/** Ops credentials carry only this scope and never a Data scope. */
export const PRIVATE_READER_OPS_SCOPES = ["ops:read"] as const;
/** Health credentials carry only the daily health summary scope. */
export const PRIVATE_READER_HEALTH_SCOPES = ["health:read"] as const;

/**
 * Each mode has its own path, fixed scope set and switch, so an
 * Observability credential can never read Data, a Data credential never
 * carries ops or health, and a health credential reads only the daily health
 * summary. A mode with a `flag` also needs that flag exactly "true", on top
 * of PRIVATE_READER_ENABLED.
 */
export const PRIVATE_READER_MODES = {
  data: { path: PRIVATE_READER_PATH, scope: PRIVATE_READER_SCOPES },
  ops: {
    path: PRIVATE_READER_OPS_PATH,
    scope: PRIVATE_READER_OPS_SCOPES,
    flag: "PRIVATE_READER_OPS_ENABLED",
  },
  health: {
    path: PRIVATE_READER_HEALTH_PATH,
    scope: PRIVATE_READER_HEALTH_SCOPES,
    flag: "PRIVATE_READER_HEALTH_ENABLED",
  },
} as const;
export type PrivateReaderMode = keyof typeof PRIVATE_READER_MODES;
export const PRIVATE_READER_MAX_LIFETIME_SECONDS = 60;
const MAX_BODY_BYTES = 1024;

export type PrivateReaderConfig = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_POLICY_AUD?: string;
  PRIVATE_READER_ENABLED?: string;
  /** Ops issuance also needs this, exactly "true". */
  PRIVATE_READER_OPS_ENABLED?: string;
  /** Health issuance also needs this, exactly "true". Unset in production. */
  PRIVATE_READER_HEALTH_ENABLED?: string;
  PRIVATE_READER_SIGNING_KEY?: string;
};

/** A mode is on only when PRIVATE_READER_ENABLED and the mode's own flag, if
 * it has one, are both exactly "true". */
export function privateReaderModeEnabled(
  config: PrivateReaderConfig,
  mode: PrivateReaderMode,
): boolean {
  const selected = PRIVATE_READER_MODES[mode];
  const flag = "flag" in selected ? selected.flag : undefined;
  return (
    config.PRIVATE_READER_ENABLED === "true" &&
    (flag === undefined || config[flag] === "true")
  );
}

/** Ops mode is on only when both flags are exactly "true". */
export function privateReaderOpsEnabled(config: PrivateReaderConfig): boolean {
  return privateReaderModeEnabled(config, "ops");
}

/** Health mode is on only when both flags are exactly "true". */
export function privateReaderHealthEnabled(
  config: PrivateReaderConfig,
): boolean {
  return privateReaderModeEnabled(config, "health");
}

export type PrivateReaderOptions = {
  /** The owner middleware already verified for this request. */
  owner?: AccessOwner;
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
  return privateJson({ error }, status, headers);
}

/** The dedicated ES256 private JWK, or null when absent or malformed. */
export async function privateReaderSigningKey(value: string | undefined) {
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
  mode: PrivateReaderMode = "data",
): Promise<Response> {
  const selected = PRIVATE_READER_MODES[mode];
  const url = new URL(request.url);
  if (url.pathname !== selected.path) return deny("not_found", 404);
  if (request.method !== "POST")
    return deny("method_not_allowed", 405, { Allow: "POST" });
  if (url.search) return deny("invalid_request", 400);
  if (!privateReaderModeEnabled(config, mode))
    return deny("reader_unavailable", 503);
  const key = await privateReaderSigningKey(config.PRIVATE_READER_SIGNING_KEY);
  if (!key) return deny("reader_unavailable", 503);

  const owner =
    options.owner ??
    (await verifyEditorialOwner(request, config, options.resolveAccessKey));
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

  const scope: string[] = [...selected.scope];
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
  return privateJson(payload);
}
