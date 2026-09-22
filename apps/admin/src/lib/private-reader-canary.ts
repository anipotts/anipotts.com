import {
  SignJWT,
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { privateJson } from "./editorial-security";
import {
  PRIVATE_READER_AUDIENCE,
  PRIVATE_READER_ISSUER,
  PRIVATE_READER_MAX_LIFETIME_SECONDS,
  privateReaderSigningKey,
} from "./private-reader-credential";

/**
 * The end-to-end reader canary. A scheduled job on ap-mini proves the whole
 * chain (Cloudflare Access, this Worker, the signing key and the reader's
 * verification) before the owner notices a break.
 *
 * It is the only issuance path that does not need the owner. It trusts
 * exactly one Cloudflare Access service token, admitted by its own Access
 * application scoped to this path, and the credential it signs carries only
 * `canary:read`, which the reader accepts on its canary route and nowhere else.
 * There is no email claim, the subject is the fixed string `canary`, and it
 * lives at most 60 seconds, never past the Access assertion.
 *
 * Off unless PRIVATE_READER_ENABLED and PRIVATE_READER_CANARY_ENABLED are both
 * exactly "true" and the canary application AUD and service token client id
 * are configured. Middleware lets this one path through to its own checks.
 */
export const PRIVATE_READER_CANARY_PATH = "/api/canary/credential";
export const PRIVATE_READER_CANARY_SCOPES = ["canary:read"] as const;
export const PRIVATE_READER_CANARY_SUBJECT = "canary";
/** Cloudflare service token client ids: 32 hex characters and `.access`. */
const CLIENT_ID = /^[0-9a-f]{32}\.access$/;
/** Access application AUD tags: 64 hex characters. */
const AUD = /^[0-9a-f]{64}$/;

export type PrivateReaderCanaryConfig = {
  ACCESS_TEAM_DOMAIN?: string;
  /** The owner application's AUD, which the canary AUD must differ from. */
  ACCESS_POLICY_AUD?: string;
  PRIVATE_READER_ENABLED?: string;
  PRIVATE_READER_CANARY_ENABLED?: string;
  PRIVATE_READER_CANARY_ACCESS_AUD?: string;
  PRIVATE_READER_CANARY_CLIENT_ID?: string;
  PRIVATE_READER_SIGNING_KEY?: string;
};

export type PrivateReaderCanaryOptions = {
  /** Test seam for the Access certificate set. */
  resolveAccessKey?: JWTVerifyGetKey;
  now?: () => number;
};

type CanaryConfig = { issuer: string; audience: string; clientId: string };

function deny(error: string, status: number, headers?: HeadersInit) {
  return privateJson({ error }, status, headers);
}

/** The configured canary, or null while any part is missing or malformed. */
function canaryConfig(config: PrivateReaderCanaryConfig): CanaryConfig | null {
  const issuer = config.ACCESS_TEAM_DOMAIN;
  const audience = config.PRIVATE_READER_CANARY_ACCESS_AUD;
  const clientId = config.PRIVATE_READER_CANARY_CLIENT_ID;
  if (
    config.PRIVATE_READER_ENABLED !== "true" ||
    config.PRIVATE_READER_CANARY_ENABLED !== "true" ||
    !issuer ||
    !audience ||
    !clientId ||
    !AUD.test(audience) ||
    !CLIENT_ID.test(clientId) ||
    // The owner application's assertions can never admit the canary.
    audience === config.ACCESS_POLICY_AUD?.trim()
  )
    return null;
  try {
    const domain = new URL(issuer);
    if (
      domain.protocol !== "https:" ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain.hostname) ||
      domain.origin !== issuer
    )
      return null;
  } catch {
    return null;
  }
  return { issuer, audience, clientId };
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** The Access assertion's expiry when it names exactly the canary service
 * token, otherwise null. A person's assertion (any email) never passes. */
async function verifyCanaryServiceToken(
  request: Request,
  canary: CanaryConfig,
  now: number,
  resolveKey?: JWTVerifyGetKey,
): Promise<number | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 16_384) return null;
  try {
    let keys = resolveKey ?? keySets.get(canary.issuer);
    if (!keys) {
      const remote = createRemoteJWKSet(
        new URL("/cdn-cgi/access/certs", canary.issuer),
      );
      keySets.set(canary.issuer, remote);
      keys = remote;
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: canary.issuer,
      audience: canary.audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "type", "common_name"],
      currentDate: new Date(now * 1000),
    });
    if (
      payload.type !== "app" ||
      payload.common_name !== canary.clientId ||
      payload.email !== undefined ||
      (payload.sub !== undefined && payload.sub !== "") ||
      typeof payload.iat !== "number" ||
      payload.iat > now ||
      typeof payload.exp !== "number"
    )
      return null;
    return payload.exp;
  } catch {
    // Invalid assertions and unavailable keys fail closed, without detail.
    return null;
  }
}

export async function privateReaderCanaryApi(
  request: Request,
  config: PrivateReaderCanaryConfig,
  options: PrivateReaderCanaryOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== PRIVATE_READER_CANARY_PATH)
    return deny("not_found", 404);
  if (request.method !== "POST")
    return deny("method_not_allowed", 405, { Allow: "POST" });
  if (url.search) return deny("invalid_request", 400);
  const canary = canaryConfig(config);
  if (!canary) return deny("reader_unavailable", 503);
  const key = await privateReaderSigningKey(config.PRIVATE_READER_SIGNING_KEY);
  if (!key) return deny("reader_unavailable", 503);

  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const accessExpiry = await verifyCanaryServiceToken(
    request,
    canary,
    now,
    options.resolveAccessKey,
  );
  if (accessExpiry === null) return deny("canary_required", 401);
  // The job sends no body: this is not a browser flow and takes no input.
  const body = await request.arrayBuffer().catch(() => null);
  if (body === null || body.byteLength > 0) return deny("invalid_request", 400);

  const expiresAt = Math.min(
    now + PRIVATE_READER_MAX_LIFETIME_SECONDS,
    Math.floor(accessExpiry),
  );
  if (expiresAt <= now) return deny("canary_required", 401);
  const scope: string[] = [...PRIVATE_READER_CANARY_SCOPES];
  const credential = await new SignJWT({ scope: scope.join(" ") })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuer(PRIVATE_READER_ISSUER)
    .setAudience(PRIVATE_READER_AUDIENCE)
    .setSubject(PRIVATE_READER_CANARY_SUBJECT)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(expiresAt)
    .sign(key);
  return privateJson({
    credential,
    tokenType: "Bearer",
    audience: PRIVATE_READER_AUDIENCE,
    scope,
    issuedAt: now,
    expiresAt,
  });
}
