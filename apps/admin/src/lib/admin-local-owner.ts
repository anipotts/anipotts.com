import type { AdminPrincipal } from "./admin-auth";

/**
 * Deliberately synthetic, so a local owner screen or record can never pass for
 * a real account. Deployable builds must not contain this string; the release
 * bundle scan in scripts/ci/admin-local-owner-leak.mjs relies on that.
 */
export const LOCAL_OWNER_EMAIL = "local-owner@localhost";

/** Only middleware compiled as a local owner build can attach this identity. */
export function localOwnerPrincipal(): AdminPrincipal {
  return {
    userId: "local-owner",
    role: "owner",
    sessionId: "local-owner",
    authMethod: "local_owner",
    stepUpAt: null,
    restriction: null,
    displayName: LOCAL_OWNER_EMAIL,
    credentialId: null,
  };
}

const CSP = "Content-Security-Policy";
const DENY_FRAMING = "frame-ancestors 'none'";
const FRAME_ANCESTORS_DIRECTIVE = /(?:^|[;,])\s*frame-ancestors(?:[\s;,]|$)/i;

/**
 * A local owner page must never render inside another site's frame, where a
 * click could drive owner actions. This merges into a route's own policy and
 * keeps a frame-ancestors the route already chose, such as the same-origin
 * draft preview the editor embeds.
 */
export function denyLocalOwnerFraming(headers: Headers): void {
  const policy = headers.get(CSP)?.trim() ?? "";
  if (policy === "") {
    headers.set(CSP, DENY_FRAMING);
    return;
  }
  if (FRAME_ANCESTORS_DIRECTIVE.test(policy)) return;
  headers.set(CSP, `${policy.replace(/;\s*$/, "")}; ${DENY_FRAMING}`);
}
