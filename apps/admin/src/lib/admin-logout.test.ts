import { describe, expect, it, vi } from "vitest";
import { adminLogout } from "./admin-logout";
import type { AdminAuthContext } from "./admin-auth";

const ORIGIN = "https://admin.example.test";

function fixture({ access = true, presented = true } = {}) {
  let assertion = "signed-fixture";
  const verifyOwner = vi.fn(async (request: Request) =>
    access && request.headers.get("cf-access-jwt-assertion") === assertion
      ? { subject: "access-owner", email: "owner@example.test", expiresAt: 0 }
      : null,
  );
  const run = (method = "GET", headers: Record<string, string> = {}) =>
    adminLogout(
      {
        request: new Request(`${ORIGIN}/api/admin/logout`, {
          method,
          headers: {
            ...(presented ? { "cf-access-jwt-assertion": assertion } : {}),
            ...headers,
          },
        }),
        url: new URL(`${ORIGIN}/api/admin/logout`),
        cookies: { get: () => ({ value: "native-secret" }) },
        locals: { runtime: { env: {} } },
      } as unknown as AdminAuthContext,
      { verifyOwner },
    );
  const bootstrap = async () => (await (await run()).json()).csrf as string;
  const post = (csrf: string) =>
    run("POST", { origin: ORIGIN, "x-admin-csrf": csrf });
  return {
    run,
    bootstrap,
    post,
    rotate: (next: string) => {
      assertion = next;
    },
  };
}

describe("Access sign out", () => {
  it("bootstraps a token bound to the verified assertion without cookies", async () => {
    const response = await fixture().run();
    const body = await response.json();
    expect(body.destination).toBe("/cdn-cgi/access/logout");
    expect(body.csrf).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("signed-fixture");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("ends the Access session and expires every retired native cookie", async () => {
    const f = fixture();
    const response = await f.post(await f.bootstrap());
    expect(await response.json()).toEqual({
      ok: true,
      destination: "/cdn-cgi/access/logout",
    });
    const cookie = response.headers.get("set-cookie")!;
    for (const name of [
      "__Host-admin_session",
      "admin_passkey_session",
      "admin_session",
    ])
      expect(cookie).toContain(`${name}=`);
    expect(cookie).toContain("Max-Age=0");
  });

  it("refuses a token minted for another Access assertion", async () => {
    const f = fixture();
    const csrf = await f.bootstrap();
    f.rotate("rotated-fixture");
    expect((await f.post(csrf)).status).toBe(403);
  });

  it("fails closed when a presented assertion cannot be verified", async () => {
    const f = fixture({ access: false });
    for (const method of ["GET", "POST"]) {
      const response = await f.run(method, {
        origin: ORIGIN,
        "x-admin-csrf": "any",
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({ error: "logout_unavailable" });
    }
  });

  it("ignores native cookies without an Access assertion", async () => {
    const response = await fixture({ presented: false }).run();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "admin_session_required" });
  });

  it("rejects absent or wrong Origin and missing or wrong CSRF", async () => {
    const f = fixture();
    const csrf = await f.bootstrap();
    const cases: Record<string, string>[] = [
      { "x-admin-csrf": csrf },
      { origin: "https://evil.test", "x-admin-csrf": csrf },
      { origin: ORIGIN },
      { origin: ORIGIN, "x-admin-csrf": "wrong" },
    ];
    for (const headers of cases) {
      const response = await f.run("POST", headers);
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("denies cross-site bootstrap and unsupported methods", async () => {
    const f = fixture();
    expect(
      (await f.run("GET", { "sec-fetch-site": "cross-site" })).status,
    ).toBe(403);
    expect((await f.run("DELETE")).status).toBe(405);
  });
});
