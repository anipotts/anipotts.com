import { describe, expect, it } from "vitest";
import { hashToken } from "./admin-auth";
import { inviteState } from "./admin-invites";
import {
  buildGoogleAuthorizationUrl,
  validateGoogleClaims,
} from "./admin-recovery";
import { deviceAuthorizationState } from "./device-authorization";

describe("admin auth flows", () => {
  it("expires device requests after five minutes and rejects duplicate states", () => {
    const now = Date.parse("2026-07-31T16:00:00.000Z");
    const base = {
      expires_at: new Date(now + 60_000).toISOString(),
      approved_at: null,
      denied_at: null,
      claimed_at: null,
    };
    expect(deviceAuthorizationState(base, now)).toBe("pending");
    expect(
      deviceAuthorizationState(
        { ...base, approved_at: new Date(now).toISOString() },
        now,
      ),
    ).toBe("approved");
    expect(
      deviceAuthorizationState(
        { ...base, claimed_at: new Date(now).toISOString() },
        now,
      ),
    ).toBe("claimed");
    expect(
      deviceAuthorizationState(
        { ...base, expires_at: new Date(now).toISOString() },
        now,
      ),
    ).toBe("expired");
  });

  it("keeps invites one-time and pending until owner approval", () => {
    const now = Date.parse("2026-07-31T16:00:00.000Z");
    const base = {
      expires_at: new Date(now + 60_000).toISOString(),
      used_at: null,
      approved_at: null,
      revoked_at: null,
    };
    expect(inviteState(base, now)).toBe("ready");
    expect(
      inviteState({ ...base, used_at: new Date(now).toISOString() }, now),
    ).toBe("pending_owner_approval");
    expect(
      inviteState({ ...base, approved_at: new Date(now).toISOString() }, now),
    ).toBe("approved");
    expect(
      inviteState({ ...base, expires_at: new Date(now).toISOString() }, now),
    ).toBe("expired");
  });

  it("builds Google authorization code flow with PKCE S256 and fresh auth", async () => {
    const value = await buildGoogleAuthorizationUrl({
      clientId: "client-id",
      redirectUri:
        "https://admin.anipotts.com/api/admin/recovery/google/callback",
      state: "state-value",
      nonce: "nonce-value",
      verifier: "a".repeat(64),
    });
    const url = new URL(value);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("max_age")).toBe("0");
  });

  it("rejects OAuth nonce failures and stale Google authentication", async () => {
    const now = Date.parse("2026-07-31T16:00:00.000Z");
    const valid = {
      sub: "google-subject",
      nonce: "nonce-value",
      auth_time: Math.floor((now - 30_000) / 1000),
    };
    await expect(
      validateGoogleClaims(valid, await hashToken("nonce-value"), now),
    ).resolves.toBeUndefined();
    await expect(
      validateGoogleClaims(valid, await hashToken("wrong-nonce"), now),
    ).rejects.toBeInstanceOf(Response);
    await expect(
      validateGoogleClaims(
        { ...valid, auth_time: Math.floor((now - 10 * 60_000) / 1000) },
        await hashToken("nonce-value"),
        now,
      ),
    ).rejects.toBeInstanceOf(Response);
  });
});
