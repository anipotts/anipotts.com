import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { adminLogout } from "./admin-logout";
import { hashToken, type AdminAuthContext } from "./admin-auth";

it("executes atomic logout against actual migrated SQLite schema, with concurrent retry and audit idempotence", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const migration of [
      "0006_admin_passkeys.sql",
      "0043_admin_auth_v2.sql",
    ])
      sqlite.exec(
        readFileSync(
          new URL(
            `../../../../drizzle/migrations/${migration}`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
    sqlite.exec(
      "INSERT INTO admin_users (id, display_name, role, status, created_at, updated_at) VALUES ('owner','Owner','owner','active','2026-01-01','2026-01-01')",
    );
    sqlite.exec(
      "INSERT INTO admin_passkey_credentials (id,user_id,credential_id,public_key,created_at,updated_at) VALUES ('credential','owner','credential','public-key','2026-01-01','2026-01-01')",
    );
    sqlite
      .prepare(
        "INSERT INTO admin_sessions (id,user_id,token_hash,auth_method,restriction,created_at,expires_at,last_seen_at,updated_at) VALUES ('unified','owner',?,'passkey','recovery','2026-01-01','2026-01-02','2026-01-01','2026-01-01')",
      )
      .run(await hashToken("native"));
    sqlite
      .prepare(
        "INSERT INTO admin_passkey_sessions (id,token_hash,credential_id,created_at,expires_at) VALUES ('legacy',?,'credential','2026-01-01','2026-01-02')",
      )
      .run(await hashToken("legacy"));
    type Statement = { sql: string; values: SQLInputValue[] };
    const db = {
      prepare(sql: string) {
        return {
          sql,
          values: [] as SQLInputValue[],
          bind(...values: SQLInputValue[]) {
            this.values = values;
            return this;
          },
          async first() {
            return sqlite.prepare(sql).get(...this.values) ?? null;
          },
        };
      },
      async batch(statements: Statement[]) {
        sqlite.exec("BEGIN");
        try {
          for (const statement of statements)
            sqlite.prepare(statement.sql).run(...statement.values);
          sqlite.exec("COMMIT");
          return statements.map(() => ({ success: true }));
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    const context = (method: string, csrf?: string) =>
      ({
        url: new URL("https://admin.example.test/api/admin/logout"),
        request: new Request("https://admin.example.test/api/admin/logout", {
          method,
          headers: {
            origin: "https://admin.example.test",
            ...(csrf ? { "x-admin-csrf": csrf } : {}),
          },
        }),
        cookies: {
          get: (name: string) => ({
            value: name === "__Host-admin_session" ? "native" : "legacy",
          }),
        },
        locals: { runtime: { env: { DB: db } } },
      }) as unknown as AdminAuthContext;
    const dependencies = { verifyOwner: async () => null };
    const { csrf } = await (
      await adminLogout(context("GET"), dependencies)
    ).json();
    sqlite.exec(
      "CREATE TRIGGER fail_legacy BEFORE UPDATE ON admin_passkey_sessions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    const failed = await adminLogout(context("POST", csrf), dependencies);
    expect(failed.status).toBe(503);
    expect(failed.headers.get("set-cookie")).toBeNull();
    expect(
      sqlite.prepare("SELECT revoked_at FROM admin_sessions").get()?.revoked_at,
    ).toBeNull();
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM admin_passkey_audit").get()?.n,
    ).toBe(0);
    sqlite.exec("DROP TRIGGER fail_legacy");
    const responses = await Promise.all([
      adminLogout(context("POST", csrf), dependencies),
      adminLogout(context("POST", csrf), dependencies),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM admin_passkey_audit").get()?.n,
    ).toBe(2);
    expect(
      sqlite.prepare("SELECT revoked_at FROM admin_sessions").get()?.revoked_at,
    ).toBeTruthy();
    expect(
      sqlite.prepare("SELECT revoked_at FROM admin_passkey_sessions").get()
        ?.revoked_at,
    ).toBeTruthy();
    expect(
      sqlite.prepare("SELECT revoked_at FROM admin_passkey_credentials").get()
        ?.revoked_at,
    ).toBeNull();
  } finally {
    sqlite.close();
  }
});
