import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AdminPrincipal } from "./admin-auth";

import { EDITORIAL_OWNER_EMAIL } from "./editorial-owner";
export { EDITORIAL_OWNER_EMAIL } from "./editorial-owner";

type AccessConfig = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_POLICY_AUD?: string;
};

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Retained dashboards expose reads; editorial writes use their own CSRF gate. */
export async function retainedAccessPrincipal(
  request: Request,
  config: AccessConfig,
  resolveKey?: JWTVerifyGetKey,
): Promise<AdminPrincipal | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const owner = await verifyEditorialOwner(request, config, resolveKey);
  if (!owner) return null;
  return {
    userId: owner.subject,
    role: "viewer",
    sessionId: `access:${owner.subject}`,
    authMethod: "cloudflare_access",
    stepUpAt: null,
    restriction: null,
    displayName: owner.email,
    credentialId: null,
  };
}

/** Only the signed application assertion can establish an owner session. */
export async function verifyEditorialOwner(
  request: Request,
  config: AccessConfig,
  resolveKey?: JWTVerifyGetKey,
): Promise<{ email: string; subject: string } | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  const issuer = config.ACCESS_TEAM_DOMAIN;
  const audience = config.ACCESS_POLICY_AUD;
  if (!token || token.length > 16_384 || !issuer || !audience?.trim()) {
    return null;
  }

  try {
    const domain = new URL(issuer);
    // Configuration must name an Access team, never a request-controlled host.
    if (
      domain.protocol !== "https:" ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain.hostname) ||
      domain.origin !== issuer
    ) {
      return null;
    }
    let keys = resolveKey ?? keySets.get(issuer);
    if (!keys) {
      const remoteKeys = createRemoteJWKSet(
        new URL("/cdn-cgi/access/certs", issuer),
      );
      keySets.set(issuer, remoteKeys);
      keys = remoteKeys;
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email", "type"],
    });
    if (
      payload.type !== "app" ||
      payload.email !== EDITORIAL_OWNER_EMAIL ||
      typeof payload.sub !== "string" ||
      !payload.sub.trim() ||
      payload.common_name !== undefined ||
      typeof payload.iat !== "number" ||
      payload.iat > Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { email: EDITORIAL_OWNER_EMAIL, subject: payload.sub };
  } catch {
    // Invalid tokens and unavailable signing keys both fail closed. Do not log
    // assertions or token-parser details into responses or deployment logs.
    return null;
  }
}
