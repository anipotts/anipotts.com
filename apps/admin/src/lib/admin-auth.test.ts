import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_ABSOLUTE_SECONDS,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_INACTIVITY_SECONDS,
  ADMIN_STEP_UP_SECONDS,
  adminSessionCookie,
  assertExactOrigin,
  hasAdminCapability,
  isFreshStepUp,
  isSessionWithinPolicy,
  requireAdminMutation,
  sanitizeAdminReturnPath,
  sessionCsrfToken,
  type AdminPrincipal,
  type AdminRole,
} from "./admin-auth";

const now = Date.parse("2026-07-31T16:00:00.000Z");

describe("admin auth policy", () => {
  it("keeps only safe same-origin return paths", () => {
    expect(sanitizeAdminReturnPath("/content?draft=1#title")).toBe(
      "/content?draft=1#title",
    );
    expect(sanitizeAdminReturnPath("https://example.com/control")).toBe("/");
    expect(sanitizeAdminReturnPath("//example.com/control")).toBe("/");
    expect(sanitizeAdminReturnPath("/\\example.com/control")).toBe("/");
    // Dot segments that normalize to a scheme-relative Location.
    for (const path of ["/.//evil.com/x", "/..//evil.com", "/%2e//evil.com"])
      expect(sanitizeAdminReturnPath(path)).toBe("/");
    expect(sanitizeAdminReturnPath("/auth?next=%2Fcontent")).toBe("/");
    expect(sanitizeAdminReturnPath("/auth/passkey")).toBe("/");
    expect(sanitizeAdminReturnPath("/auth/recover")).toBe("/");
    expect(sanitizeAdminReturnPath("/auth/device/opaque-request")).toBe(
      "/auth/device/opaque-request",
    );
  });

  it("enforces exact origin on mutations", () => {
    const url = new URL("https://admin.anipotts.com/api/admin/inbox");
    expect(() =>
      assertExactOrigin(
        new Request(url, {
          method: "POST",
          headers: { origin: "https://admin.anipotts.com" },
        }),
        url,
      ),
    ).not.toThrow();
    expect(() =>
      assertExactOrigin(
        new Request(url, {
          method: "POST",
          headers: { origin: "https://anipotts.com" },
        }),
        url,
      ),
    ).toThrow();
    expect(() =>
      assertExactOrigin(new Request(url, { method: "POST" }), url),
    ).toThrow();
  });

  it("enforces absolute and inactivity session limits", () => {
    const active = {
      created_at: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
    };
    expect(isSessionWithinPolicy(active, now)).toBe(true);
    expect(
      isSessionWithinPolicy(
        {
          ...active,
          created_at: new Date(
            now - ADMIN_SESSION_ABSOLUTE_SECONDS * 1000,
          ).toISOString(),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isSessionWithinPolicy(
        {
          ...active,
          last_seen_at: new Date(
            now - ADMIN_SESSION_INACTIVITY_SECONDS * 1000,
          ).toISOString(),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isSessionWithinPolicy({ ...active, revoked_at: active.created_at }, now),
    ).toBe(false);
  });

  it("requires a passkey step-up inside the ten minute window", () => {
    expect(
      isFreshStepUp(
        new Date(now - ADMIN_STEP_UP_SECONDS * 1000 + 1).toISOString(),
        now,
      ),
    ).toBe(true);
    expect(
      isFreshStepUp(
        new Date(now - ADMIN_STEP_UP_SECONDS * 1000).toISOString(),
        now,
      ),
    ).toBe(false);
    expect(isFreshStepUp(null, now)).toBe(false);
  });

  const roleCases: Array<{
    role: AdminRole;
    allowed: string[];
    denied: string[];
  }> = [
    {
      role: "viewer",
      allowed: ["admin:read"],
      denied: ["draft:save", "member:approve", "content:publish"],
    },
    {
      role: "operator",
      allowed: ["admin:read", "draft:save", "action:stage"],
      denied: ["identity:manage", "content:publish", "deploy:run"],
    },
    {
      role: "owner",
      allowed: ["admin:read", "identity:manage", "control:execute"],
      denied: [],
    },
  ];

  for (const roleCase of roleCases) {
    it(`enforces the ${roleCase.role} capability boundary`, () => {
      for (const capability of roleCase.allowed) {
        expect(hasAdminCapability(roleCase.role, capability as never)).toBe(
          true,
        );
      }
      for (const capability of roleCase.denied) {
        expect(hasAdminCapability(roleCase.role, capability as never)).toBe(
          false,
        );
      }
    });
  }

  it("uses one secure host-only session cookie", () => {
    const header = adminSessionCookie("opaque-token");
    expect(header).toContain(`${ADMIN_SESSION_COOKIE}=opaque-token`);
    expect(header).toContain("Path=/");
    expect(header).toContain("Secure");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=2592000");
    expect(adminSessionCookie("recovery", 600)).toContain("Max-Age=600");
  });

  it("requires a session-bound csrf token on every mutation", async () => {
    const token = "opaque-session-token";
    const principal: AdminPrincipal = {
      userId: "ani",
      role: "owner",
      sessionId: "session-1",
      authMethod: "passkey",
      stepUpAt: new Date().toISOString(),
      restriction: null,
      displayName: "Ani",
      credentialId: "credential-1",
    };
    const base = mutationContext(principal, token);
    const csrf = await sessionCsrfToken(base as never);
    expect(csrf).toBeTruthy();

    const allowed = mutationContext(principal, token, csrf ?? undefined);
    await expect(
      requireAdminMutation(allowed as never, "identity:manage"),
    ).resolves.toEqual(principal);

    await expect(
      requireAdminMutation(base as never, "identity:manage"),
    ).rejects.toBeInstanceOf(Response);
    await expect(
      requireAdminMutation(
        mutationContext(principal, token, "wrong") as never,
        "identity:manage",
      ),
    ).rejects.toBeInstanceOf(Response);
  });
});

function mutationContext(
  principal: AdminPrincipal,
  token: string,
  csrf?: string,
) {
  const url = new URL("https://admin.anipotts.com/api/admin/members/invite");
  const headers = new Headers({ origin: url.origin });
  if (csrf) headers.set("x-admin-csrf", csrf);
  return {
    request: new Request(url, { method: "POST", headers }),
    url,
    locals: { adminPrincipal: principal },
    cookies: {
      get(name: string) {
        return name === ADMIN_SESSION_COOKIE ? { value: token } : undefined;
      },
    },
  };
}
