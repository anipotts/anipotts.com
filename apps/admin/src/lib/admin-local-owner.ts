import type { AdminPrincipal } from "./admin-auth";

/**
 * Deliberately synthetic, so a local owner screen or record can never pass for
 * a real account. Deployable builds must not contain this string; the release
 * bundle scan in scripts/ci/admin-local-owner-leak.mjs relies on that.
 */
export const LOCAL_OWNER_EMAIL = "local-owner@localhost";

/** Only middleware compiled with ADMIN_LOCAL_OWNER=1 can attach this identity. */
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
