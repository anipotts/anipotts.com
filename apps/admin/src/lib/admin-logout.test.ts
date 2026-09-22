import { describe, expect, it, vi } from "vitest";
import { adminLogout } from "./admin-logout";
import {
  ADMIN_SESSION_COOKIE,
  LEGACY_PASSKEY_SESSION_COOKIE,
  type AdminAuthContext,
} from "./admin-auth";

function fixture({
  legacy = false,
  native = true,
  access = false,
  storage = true,
} = {}) {
  const queries: string[] = [];
  const cookies = new Map<string, string>();
  if (native) cookies.set(ADMIN_SESSION_COOKIE, "native-secret");
  if (legacy) cookies.set(LEGACY_PASSKEY_SESSION_COOKIE, "legacy-secret");
  let revoked = false;
  const batch = vi.fn(async (statements: unknown[]) => {
    revoked = true;
    return statements.map(() => ({ success: true }));
  });
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      return {
        sql,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        async first() {
          return revoked
            ? null
            : {
                id: sql.includes("FROM admin_sessions") ? "unified" : "legacy",
                user_id: "owner",
                credential_id: "credential",
              };
        },
      };
    },
    batch,
  };
  const verifyOwner = vi.fn(async () =>
    access
      ? { subject: "access-owner", email: "owner@example.test", expiresAt: 0 }
      : null,
  );
  const run = (method = "GET", headers: Record<string, string> = {}) =>
    adminLogout(
      {
        request: new Request("https://admin.example.test/api/admin/logout", {
          method,
          headers: {
            ...(access ? { "cf-access-jwt-assertion": "signed-fixture" } : {}),
            ...headers,
          },
        }),
        url: new URL("https://admin.example.test/api/admin/logout"),
        cookies: {
          get: (name: string) =>
            cookies.has(name) ? { value: cookies.get(name) } : undefined,
        },
        locals: {
          runtime: { env: { ...(storage ? { DB: db } : {}) } },
          adminPrincipal: { sessionId: "access:synthetic" },
        },
      } as unknown as AdminAuthContext,
      { verifyOwner },
    );
  const bootstrap = async () => (await (await run()).json()).csrf as string;
  const post = (csrf: string) =>
    run("POST", { origin: "https://admin.example.test", "x-admin-csrf": csrf });
  return { run, bootstrap, post, queries, batch, cookies };
}

describe("dedicated logout capability", () => {
  it("retains mixed-session cookies and performs no revocation when Access cannot be verified", async () => {
    const f = fixture();
    const csrf = await f.bootstrap();
    const headers = {
      origin: "https://admin.example.test",
      "cf-access-jwt-assertion": "unverifiable-assertion",
      "x-admin-csrf": csrf,
    };
    for (const method of ["GET", "POST"]) {
      const response = await f.run(method, headers);
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({ error: "logout_unavailable" });
    }
    expect(f.batch).not.toHaveBeenCalled();
  });

  it("bootstraps without writes, secret disclosure, or cookie rotation", async () => {
    const f = fixture({ legacy: true });
    const response = await f.run();
    expect(await response.text()).not.toContain("secret");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(f.batch).not.toHaveBeenCalled();
    expect(f.queries.every((sql) => sql.startsWith("SELECT"))).toBe(true);
  });
  it("atomically revokes both presented sessions and clears every native cookie", async () => {
    const f = fixture({ legacy: true, access: true });
    const response = await f.post(await f.bootstrap());
    expect(await response.json()).toEqual({
      ok: true,
      destination: "/cdn-cgi/access/logout",
    });
    expect(f.batch).toHaveBeenCalledTimes(1);
    expect(f.batch.mock.calls[0][0]).toHaveLength(4);
    expect(f.queries.join(" ")).not.toMatch(
      /INSERT INTO admin_sessions|UPDATE admin_users|UPDATE admin_passkey_credentials/,
    );
    const cookie = response.headers.get("set-cookie")!;
    for (const name of [
      "__Host-admin_session",
      "admin_passkey_session",
      "admin_session",
    ])
      expect(cookie).toContain(`${name}=`);
    expect(cookie).toContain("Max-Age=0");
  });
  it("retries without duplicate revocation and uses native destination", async () => {
    const f = fixture();
    const csrf = await f.bootstrap();
    expect(await (await f.post(csrf)).json()).toEqual({
      ok: true,
      destination: "/auth",
    });
    expect((await f.post(csrf)).status).toBe(200);
    expect(f.batch).toHaveBeenCalledTimes(1);
  });
  it("supports Access-only without database writes", async () => {
    const f = fixture({ native: false, access: true, storage: false });
    expect((await f.post(await f.bootstrap())).status).toBe(200);
    expect(f.queries).toEqual([]);
  });
  it("fails closed on unavailable native storage even with Access", async () => {
    const f = fixture({ storage: false, access: true });
    expect((await f.run()).status).toBe(503);
    expect(f.batch).not.toHaveBeenCalled();
  });
  it("rejects absent/wrong Origin and missing/wrong CSRF without writes", async () => {
    const f = fixture();
    const csrf = await f.bootstrap();
    const cases: Record<string, string>[] = [
      { "x-admin-csrf": csrf },
      { origin: "https://evil.test", "x-admin-csrf": csrf },
      { origin: "https://admin.example.test" },
      { origin: "https://admin.example.test", "x-admin-csrf": "wrong" },
    ];
    for (const headers of cases)
      expect((await f.run("POST", headers)).status).toBe(403);
    expect(f.batch).not.toHaveBeenCalled();
  });
  it("binds bootstrap to the exact cookie set", async () => {
    const f = fixture();
    const csrf = await f.bootstrap();
    f.cookies.set(LEGACY_PASSKEY_SESSION_COOKIE, "new-legacy");
    expect((await f.post(csrf)).status).toBe(403);
  });
  it("retains cookies and suppresses private errors when batch fails", async () => {
    const f = fixture();
    f.batch.mockRejectedValueOnce(new Error("private details"));
    const response = await f.post(await f.bootstrap());
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).not.toContain("private details");
  });
  it("denies anonymous, cross-site bootstrap, and unsupported methods", async () => {
    const f = fixture({ native: false });
    expect((await f.run()).status).toBe(401);
    expect(
      (await f.run("GET", { "sec-fetch-site": "cross-site" })).status,
    ).toBe(403);
    expect((await f.run("DELETE")).status).toBe(405);
  });
});
