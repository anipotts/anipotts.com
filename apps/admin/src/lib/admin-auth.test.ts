import { describe, expect, it } from "vitest";
import { assertExactOrigin, expiredAdminSessionCookies } from "./admin-auth";

describe("admin auth helpers", () => {
  it("enforces exact origin on mutations", () => {
    const url = new URL("https://admin.anipotts.com/api/admin/logout");
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

  it("expires every retired native session cookie with its original scope", () => {
    const cookies = expiredAdminSessionCookies();
    expect(cookies.map((cookie) => cookie.split("=", 1)[0])).toEqual([
      "__Host-admin_session",
      "admin_passkey_session",
      "admin_session",
    ]);
    for (const cookie of cookies) {
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
    }
  });
});
