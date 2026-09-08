import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAdminSession,
  type AdminD1Database,
  type AdminD1PreparedStatement,
  type AdminPrincipal,
} from "./admin-auth";
import { requirePublicAllocationBudget } from "./admin-public-rate-limit";
import { requirePasskeyApprovalProvenance } from "./device-authorization";

describe("admin auth security boundaries", () => {
  it("allows device approval only from a credential-backed passkey session", () => {
    expect(() =>
      requirePasskeyApprovalProvenance(principal("passkey", "credential-1")),
    ).not.toThrow();
    expect(() =>
      requirePasskeyApprovalProvenance(
        principal("device_approval", "credential-1"),
      ),
    ).toThrow(Response);
    expect(() =>
      requirePasskeyApprovalProvenance(principal("passkey", null)),
    ).toThrow(Response);
  });

  it("binds claimed sessions to an active approving credential", async () => {
    const active = new AuthSecurityDb(true);
    await expect(
      createAdminSession(active, {
        userId: "ani",
        credentialId: "credential-1",
        authMethod: "device_approval",
        requireActiveCredential: true,
      }),
    ).resolves.toMatchObject({ sessionId: expect.any(String) });
    expect(active.lastInsert).toContain("WHERE EXISTS");
    expect(active.lastValues.slice(-2)).toEqual(["credential-1", "ani"]);

    const revoked = new AuthSecurityDb(false);
    await expect(
      createAdminSession(revoked, {
        userId: "ani",
        credentialId: "credential-1",
        authMethod: "device_approval",
        requireActiveCredential: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("caps public allocation before device or recovery rows are created", async () => {
    const allowed = new AuthSecurityDb(true);
    const request = new Request(
      "https://admin.anipotts.com/api/admin/device/start",
      {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.9" },
      },
    );
    await expect(
      requirePublicAllocationBudget(allowed, request, "device", 100_000),
    ).resolves.toBeUndefined();
    expect(allowed.queries.at(-1)).toContain("INSERT INTO rate_limits");
    expect(allowed.lastValues.join(" ")).not.toContain("203.0.113.9");

    const blocked = new AuthSecurityDb(false);
    await expect(
      requirePublicAllocationBudget(blocked, request, "device", 100_000),
    ).rejects.toMatchObject({ status: 429 });
    expect(blocked.queries).toHaveLength(2);
    expect(
      blocked.queries.some((query) =>
        query.includes("admin_device_authorizations"),
      ),
    ).toBe(false);
  });

  it("retires invitation entry and token exchange routes from the editorial app", () => {
    for (const path of [
      "auth/invite.astro",
      "api/admin/invites/status.ts",
      "api/admin/invites/register-options.ts",
      "api/admin/invites/register-verify.ts",
      "api/admin/members/invite.ts",
    ]) {
      expect(existsSync(new URL(`../pages/${path}`, import.meta.url))).toBe(
        false,
      );
    }
  });
});

function principal(
  authMethod: AdminPrincipal["authMethod"],
  credentialId: string | null,
): Pick<AdminPrincipal, "authMethod" | "credentialId"> {
  return { authMethod, credentialId };
}

class AuthSecurityDb implements AdminD1Database {
  readonly queries: string[] = [];
  lastInsert = "";
  lastValues: unknown[] = [];

  constructor(private readonly permitInsert: boolean) {}

  prepare(query: string): AdminD1PreparedStatement {
    this.queries.push(query);
    return new AuthSecurityStatement(this, query);
  }

  run(query: string, values: unknown[]) {
    this.lastValues = values;
    if (query.includes("INSERT INTO admin_sessions")) {
      this.lastInsert = query;
    }
    const guardedInsert =
      query.includes("INSERT INTO admin_sessions") ||
      query.includes("INSERT INTO rate_limits");
    return { meta: { changes: guardedInsert && !this.permitInsert ? 0 : 1 } };
  }
}

class AuthSecurityStatement implements AdminD1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: AuthSecurityDb,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): AdminD1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return null;
  }

  async run() {
    return this.db.run(this.query, this.values);
  }

  async all<T = unknown>() {
    return { results: [] as T[] };
  }
}
