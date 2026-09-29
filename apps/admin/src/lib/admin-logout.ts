import {
  ADMIN_SESSION_COOKIE,
  LEGACY_PASSKEY_SESSION_COOKIE,
  adminDb,
  adminJson,
  applyAdminSetCookies,
  assertExactOrigin,
  expiredAdminSessionCookies,
  hashToken,
  type AdminAuthContext,
  type AdminD1Database,
} from "./admin-auth";
import { verifyEditorialOwner } from "./access-identity";

type Session = { id: string; user_id: string; credential_id: string | null };
type PresentedSession = Session & {
  table: "admin_sessions" | "admin_passkey_sessions";
};
type Dependencies = { verifyOwner?: typeof verifyEditorialOwner };

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++)
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

/** Logout reads existing rows only. It never resolves, refreshes, or migrates a session. */
async function presentedSessions(
  db: AdminD1Database,
  tokens: string[],
): Promise<PresentedSession[]> {
  const sessions: PresentedSession[] = [];
  const tables = ["admin_sessions", "admin_passkey_sessions"] as const;
  for (let index = 0; index < tables.length; index++) {
    if (!tokens[index]) continue;
    const table = tables[index];
    const selection =
      table === "admin_sessions"
        ? "SELECT id, user_id, credential_id FROM admin_sessions WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1"
        : "SELECT s.id, c.user_id, s.credential_id FROM admin_passkey_sessions s JOIN admin_passkey_credentials c ON c.credential_id = s.credential_id WHERE s.token_hash = ? AND s.revoked_at IS NULL LIMIT 1";
    const row = await db
      .prepare(selection)
      .bind(await hashToken(tokens[index]))
      .first<Session>();
    if (row) sessions.push({ ...row, table });
  }
  return sessions;
}

/** A dedicated capability, not a replacement login/session-management API. */
export async function adminLogout(
  context: AdminAuthContext,
  dependencies: Dependencies = {},
): Promise<Response> {
  const method = context.request.method;
  if (method !== "GET" && method !== "POST")
    return adminJson(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "GET, POST" } },
    );
  try {
    if (method === "POST") assertExactOrigin(context.request, context.url);
    // The client uses fetch. Cross-site navigation must not expose a logout capability.
    if (context.request.headers.get("sec-fetch-site") === "cross-site")
      return adminJson({ error: "invalid_origin" }, { status: 403 });
    const tokens = [ADMIN_SESSION_COOKIE, LEGACY_PASSKEY_SESSION_COOKIE].map(
      (name) => context.cookies.get(name)?.value ?? "",
    );
    if (tokens.some((token) => token.length > 4096))
      return adminJson({ error: "invalid_session" }, { status: 400 });
    const owner = await (dependencies.verifyOwner ?? verifyEditorialOwner)(
      context.request,
      context.locals.runtime?.env ?? {},
    );
    // A presented but unverifiable Access assertion is not proof of native-only auth.
    if (context.request.headers.has("cf-access-jwt-assertion") && !owner)
      return adminJson({ error: "logout_unavailable" }, { status: 503 });
    const hasNativeCookie = tokens.some(Boolean);
    if (!hasNativeCookie && !owner)
      return adminJson({ error: "admin_session_required" }, { status: 401 });
    const db = adminDb(context);
    if (hasNativeCookie && !db)
      return adminJson({ error: "logout_unavailable" }, { status: 503 });
    const sessions = hasNativeCookie
      ? await presentedSessions(db!, tokens)
      : [];
    // Bind the capability to both presented cookies and the verified Access assertion.
    const csrf = await hashToken(
      `admin-logout-v1:${JSON.stringify([tokens, owner ? context.request.headers.get("cf-access-jwt-assertion") : null])}`,
    );
    const destination = owner ? "/cdn-cgi/access/logout" : "/auth";
    if (method === "GET") return adminJson({ csrf, destination });
    const supplied = context.request.headers.get("x-admin-csrf") ?? "";
    if (!supplied || !equal(supplied, csrf))
      return adminJson({ error: "csrf_invalid" }, { status: 403 });
    if (sessions.length) {
      if (!db?.batch)
        return adminJson({ error: "logout_unavailable" }, { status: 503 });
      const now = new Date().toISOString();
      // D1 batch is atomic. Conditional audit insertion also makes concurrent retries idempotent.
      const statements = sessions.flatMap((session) => [
        db
          .prepare(
            `INSERT INTO admin_passkey_audit (id, event_type, user_id, session_id, credential_id, outcome, summary, metadata, created_at) SELECT ?, 'admin.session.logout', ?, id, ?, 'completed', 'ended current browser session', '{}', ? FROM ${session.table} WHERE id = ? AND revoked_at IS NULL`,
          )
          .bind(
            crypto.randomUUID(),
            session.user_id,
            session.credential_id,
            now,
            session.id,
          ),
        db
          .prepare(
            session.table === "admin_sessions"
              ? "UPDATE admin_sessions SET revoked_at = ?, revoked_reason = 'logout', updated_at = ? WHERE id = ? AND revoked_at IS NULL"
              : "UPDATE admin_passkey_sessions SET revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL",
          )
          .bind(now, now, session.id),
      ]);
      const results = await db.batch(statements);
      if (results.some((result) => !result.success))
        throw new Error("logout failed");
    }
    return applyAdminSetCookies(
      adminJson({ ok: true, destination }),
      expiredAdminSessionCookies(),
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return adminJson({ error: "logout_unavailable" }, { status: 503 });
  }
}
