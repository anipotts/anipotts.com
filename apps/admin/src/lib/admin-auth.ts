import type { APIContext } from "astro";

export const ADMIN_SESSION_COOKIE = "__Host-admin_session";
export const LEGACY_PASSKEY_SESSION_COOKIE = "admin_passkey_session";
export const LEGACY_PASSWORD_SESSION_COOKIE = "admin_session";

export const ADMIN_SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_SESSION_INACTIVITY_SECONDS = 7 * 24 * 60 * 60;
export const ADMIN_STEP_UP_SECONDS = 10 * 60;
export const ADMIN_RECOVERY_SESSION_SECONDS = 10 * 60;

export type AdminRole = "owner" | "operator" | "viewer";
export type AdminAuthMethod =
  | "passkey"
  | "device_approval"
  | "google_recovery"
  | "legacy_passkey"
  | "cloudflare_access";
export type AdminSessionRestriction = "recovery" | null;

export type AdminPrincipal = {
  userId: string;
  role: AdminRole;
  sessionId: string;
  authMethod: AdminAuthMethod;
  stepUpAt: string | null;
  restriction: AdminSessionRestriction;
  displayName: string;
  credentialId: string | null;
};

export type AdminCapability =
  | "admin:read"
  | "draft:save"
  | "action:stage"
  | "identity:manage"
  | "member:approve"
  | "content:publish"
  | "deploy:run"
  | "control:execute";

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
  meta?: unknown;
};

export type AdminD1PreparedStatement = {
  bind(...values: unknown[]): AdminD1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
};

export type AdminD1Database = {
  prepare(query: string): AdminD1PreparedStatement;
  batch?(
    statements: AdminD1PreparedStatement[],
  ): Promise<Array<D1Result<unknown>>>;
};

export type AdminAuthContext = Pick<
  APIContext,
  "cookies" | "locals" | "request" | "url"
>;

type UnifiedSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  credential_id: string | null;
  auth_method: AdminAuthMethod;
  restriction: AdminSessionRestriction;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  step_up_at: string | null;
  revoked_at: string | null;
  role: AdminRole;
  user_status: string;
  display_name: string;
};

type LegacySessionRow = {
  id: string;
  credential_id: string;
  user_id: string;
  expires_at: string;
  last_seen_at: string | null;
};

export type ResolvedAdminSession = {
  principal: AdminPrincipal | null;
  setCookies: string[];
};

export type CreatedAdminSession = {
  token: string;
  sessionId: string;
  expiresAt: string;
  csrfToken: string;
};

const ROLE_CAPABILITIES: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  viewer: new Set(["admin:read"]),
  operator: new Set(["admin:read", "draft:save", "action:stage"]),
  owner: new Set([
    "admin:read",
    "draft:save",
    "action:stage",
    "identity:manage",
    "member:approve",
    "content:publish",
    "deploy:run",
    "control:execute",
  ]),
};

export function hasAdminCapability(
  role: AdminRole,
  capability: AdminCapability,
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function isFreshStepUp(
  stepUpAt: string | null,
  now = Date.now(),
): boolean {
  if (!stepUpAt) return false;
  const timestamp = Date.parse(stepUpAt);
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now &&
    now - timestamp < ADMIN_STEP_UP_SECONDS * 1000
  );
}

export function isSessionWithinPolicy(
  session: Pick<
    UnifiedSessionRow,
    "created_at" | "expires_at" | "last_seen_at" | "revoked_at"
  >,
  now = Date.now(),
): boolean {
  if (session.revoked_at) return false;
  const createdAt = Date.parse(session.created_at);
  const expiresAt = Date.parse(session.expires_at);
  const lastSeenAt = Date.parse(session.last_seen_at);
  if (![createdAt, expiresAt, lastSeenAt].every(Number.isFinite)) return false;
  return (
    createdAt <= now &&
    now < expiresAt &&
    now - createdAt < ADMIN_SESSION_ABSOLUTE_SECONDS * 1000 &&
    now - lastSeenAt < ADMIN_SESSION_INACTIVITY_SECONDS * 1000
  );
}

export function assertExactOrigin(request: Request, url: URL): void {
  const origin = request.headers.get("origin");
  if (origin !== url.origin) {
    throw adminJson({ error: "invalid_origin" }, { status: 403 });
  }
}

export function sanitizeAdminReturnPath(
  value: string | null,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.includes("\\")) return fallback;

  try {
    const parsed = new URL(value, "https://admin.anipotts.com");
    if (parsed.origin !== "https://admin.anipotts.com") return fallback;
    if (
      parsed.pathname === "/auth" ||
      parsed.pathname === "/auth/passkey" ||
      parsed.pathname.startsWith("/auth/recover")
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function resolveAdminSession(
  context: AdminAuthContext,
): Promise<ResolvedAdminSession> {
  const db = adminDb(context);
  const setCookies: string[] = [];
  const legacyPassword = context.cookies.get(
    LEGACY_PASSWORD_SESSION_COOKIE,
  )?.value;
  if (legacyPassword) {
    setCookies.push(expiredCookie(LEGACY_PASSWORD_SESSION_COOKIE));
  }

  if (!db) return { principal: null, setCookies };

  const token = context.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    const row = await findUnifiedSession(db, token);
    if (row && isSessionWithinPolicy(row)) {
      await touchUnifiedSession(db, row.id);
      return { principal: principalFromRow(row), setCookies };
    }
    setCookies.push(expiredCookie(ADMIN_SESSION_COOKIE));
  }

  const legacyToken = context.cookies.get(LEGACY_PASSKEY_SESSION_COOKIE)?.value;
  if (!legacyToken) return { principal: null, setCookies };

  setCookies.push(expiredCookie(LEGACY_PASSKEY_SESSION_COOKIE));
  const legacy = await findLegacyPasskeySession(db, legacyToken);
  if (!legacy) return { principal: null, setCookies };

  await ensureOwnerUser(db, legacy.user_id);
  const created = await createAdminSession(db, {
    userId: legacy.user_id,
    credentialId: legacy.credential_id,
    authMethod: "legacy_passkey",
    stepUpAt: null,
  });
  await revokeLegacySession(db, legacy.id);
  setCookies.push(adminSessionCookie(created.token));
  await recordAdminAudit(db, {
    eventType: "admin.session.legacy_migrated",
    userId: legacy.user_id,
    sessionId: created.sessionId,
    credentialId: legacy.credential_id,
    summary: "rotated one legacy passkey session into unified admin auth",
  });

  return {
    principal: {
      userId: legacy.user_id,
      role: "owner",
      sessionId: created.sessionId,
      authMethod: "legacy_passkey",
      stepUpAt: null,
      restriction: null,
      displayName: "Ani",
      credentialId: legacy.credential_id,
    },
    setCookies,
  };
}

export async function createAdminSession(
  db: AdminD1Database,
  input: {
    userId: string;
    credentialId?: string | null;
    authMethod: AdminAuthMethod;
    stepUpAt?: string | null;
    restriction?: AdminSessionRestriction;
    lifetimeSeconds?: number;
    requireActiveCredential?: boolean;
  },
): Promise<CreatedAdminSession> {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const sessionId = crypto.randomUUID();
  const createdAt = nowIso();
  const lifetimeSeconds = Math.min(
    input.lifetimeSeconds ?? ADMIN_SESSION_ABSOLUTE_SECONDS,
    ADMIN_SESSION_ABSOLUTE_SECONDS,
  );
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();

  const insertSql = input.requireActiveCredential
    ? `INSERT INTO admin_sessions
        (id, user_id, token_hash, credential_id, auth_method, restriction,
         created_at, expires_at, last_seen_at, step_up_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM admin_passkey_credentials
         WHERE credential_id = ? AND user_id = ? AND revoked_at IS NULL
       )`
    : `INSERT INTO admin_sessions
        (id, user_id, token_hash, credential_id, auth_method, restriction,
         created_at, expires_at, last_seen_at, step_up_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    sessionId,
    input.userId,
    tokenHash,
    input.credentialId ?? null,
    input.authMethod,
    input.restriction ?? null,
    createdAt,
    expiresAt,
    createdAt,
    input.stepUpAt ?? null,
    createdAt,
  ];
  if (input.requireActiveCredential) {
    if (!input.credentialId) {
      throw adminJson(
        { error: "credential_session_required" },
        { status: 409 },
      );
    }
    values.push(input.credentialId, input.userId);
  }
  const inserted = await db
    .prepare(insertSql)
    .bind(...values)
    .run();
  if (input.requireActiveCredential && resultChanges(inserted) !== 1) {
    throw adminJson({ error: "credential_not_active" }, { status: 409 });
  }

  return {
    token,
    sessionId,
    expiresAt,
    csrfToken: await csrfTokenForSessionToken(token),
  };
}

function resultChanges(result: { meta?: unknown }): number {
  return Number(
    (result.meta as { changes?: number } | undefined)?.changes ?? 0,
  );
}

export async function requireAdminMutation(
  context: AdminAuthContext,
  capability: AdminCapability,
): Promise<AdminPrincipal> {
  assertExactOrigin(context.request, context.url);
  const principal =
    context.locals.adminPrincipal ??
    (await resolveAdminSession(context)).principal;
  if (!principal) {
    throw adminJson({ error: "admin_session_required" }, { status: 401 });
  }
  if (principal.restriction) {
    throw adminJson({ error: "restricted_session" }, { status: 403 });
  }
  if (!hasAdminCapability(principal.role, capability)) {
    throw adminJson(
      { error: "role_denied", required_capability: capability },
      { status: 403 },
    );
  }
  if (!isFreshStepUp(principal.stepUpAt)) {
    throw adminJson(
      { error: "fresh_passkey_required", step_up_window_seconds: 600 },
      { status: 403 },
    );
  }

  const token = context.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const suppliedCsrf = context.request.headers.get("x-admin-csrf");
  if (!token || !suppliedCsrf) {
    throw adminJson({ error: "csrf_required" }, { status: 403 });
  }
  const expectedCsrf = await csrfTokenForSessionToken(token);
  if (!constantTimeEqual(suppliedCsrf, expectedCsrf)) {
    throw adminJson({ error: "csrf_invalid" }, { status: 403 });
  }
  return principal;
}

export async function requireAdminSessionAction(
  context: AdminAuthContext,
): Promise<AdminPrincipal> {
  assertExactOrigin(context.request, context.url);
  const principal =
    context.locals.adminPrincipal ??
    (await resolveAdminSession(context)).principal;
  if (!principal) {
    throw adminJson({ error: "admin_session_required" }, { status: 401 });
  }

  const token = context.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const suppliedCsrf = context.request.headers.get("x-admin-csrf");
  if (!token || !suppliedCsrf) {
    throw adminJson({ error: "csrf_required" }, { status: 403 });
  }
  const expectedCsrf = await csrfTokenForSessionToken(token);
  if (!constantTimeEqual(suppliedCsrf, expectedCsrf)) {
    throw adminJson({ error: "csrf_invalid" }, { status: 403 });
  }
  return principal;
}

export async function sessionCsrfToken(
  context: AdminAuthContext,
): Promise<string | null> {
  const token = context.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || !context.locals.adminPrincipal) return null;
  return csrfTokenForSessionToken(token);
}

export async function revokeAdminSession(
  db: AdminD1Database,
  sessionId: string,
  reason: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE admin_sessions
       SET revoked_at = ?, revoked_reason = ?, updated_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    )
    .bind(nowIso(), reason, nowIso(), sessionId)
    .run();
}

export async function revokeAllUserAccess(
  db: AdminD1Database,
  userId: string,
  exceptCredentialId: string | null = null,
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE admin_sessions
       SET revoked_at = ?, revoked_reason = 'owner_recovery', updated_at = ?
       WHERE user_id = ? AND revoked_at IS NULL`,
    )
    .bind(now, now, userId)
    .run();
  await db
    .prepare(
      `UPDATE admin_passkey_credentials
       SET revoked_at = ?, updated_at = ?
       WHERE user_id = ? AND revoked_at IS NULL
         AND (? IS NULL OR credential_id != ?)`,
    )
    .bind(now, now, userId, exceptCredentialId, exceptCredentialId)
    .run();
}

export function adminSessionCookie(
  token: string,
  maxAgeSeconds = ADMIN_SESSION_ABSOLUTE_SECONDS,
): string {
  return cookie(ADMIN_SESSION_COOKIE, token, maxAgeSeconds);
}

export function expiredAdminSessionCookies(): string[] {
  return [
    expiredCookie(ADMIN_SESSION_COOKIE),
    expiredCookie(LEGACY_PASSKEY_SESSION_COOKIE),
    expiredCookie(LEGACY_PASSWORD_SESSION_COOKIE),
  ];
}

export function applyAdminSetCookies(
  response: Response,
  cookies: readonly string[],
): Response {
  for (const value of cookies) response.headers.append("set-cookie", value);
  return response;
}

export function adminDb(context: AdminAuthContext): AdminD1Database | null {
  return (
    (context.locals.runtime?.env.DB as AdminD1Database | undefined) ?? null
  );
}

export function requireAdminDb(context: AdminAuthContext): AdminD1Database {
  const db = adminDb(context);
  if (!db) {
    throw adminJson({ error: "db_binding_missing" }, { status: 503 });
  }
  return db;
}

export function adminJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
      ...(init.headers ?? {}),
    },
  });
}

export function handleAdminAuthError(error: unknown): Response {
  if (error instanceof Response) return error;
  return adminJson(
    {
      error: "admin_auth_request_failed",
      ...(import.meta.env.DEV && error instanceof Error
        ? { detail: error.message }
        : {}),
    },
    { status: 400 },
  );
}

export async function recordAdminAudit(
  db: AdminD1Database,
  input: {
    eventType: string;
    summary: string;
    userId?: string | null;
    sessionId?: string | null;
    credentialId?: string | null;
    outcome?: "allowed" | "denied" | "completed";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_passkey_audit
        (id, event_type, user_id, session_id, credential_id, outcome,
         summary, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.eventType,
      input.userId ?? null,
      input.sessionId ?? null,
      input.credentialId ?? null,
      input.outcome ?? "completed",
      input.summary,
      JSON.stringify(input.metadata ?? {}),
      nowIso(),
    )
    .run();
}

export async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function nowIso(): string {
  return new Date().toISOString();
}

async function findUnifiedSession(
  db: AdminD1Database,
  token: string,
): Promise<UnifiedSessionRow | null> {
  const tokenHash = await hashToken(token);
  return db
    .prepare(
      `SELECT s.*, u.role, u.status AS user_status, u.display_name
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND u.status = 'active'
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<UnifiedSessionRow>();
}

async function findLegacyPasskeySession(
  db: AdminD1Database,
  token: string,
): Promise<LegacySessionRow | null> {
  const tokenHash = await hashToken(token);
  return db
    .prepare(
      `SELECT s.id, s.credential_id, c.user_id, s.expires_at, s.last_seen_at
       FROM admin_passkey_sessions s
       JOIN admin_passkey_credentials c
         ON c.credential_id = s.credential_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?
         AND c.revoked_at IS NULL
       LIMIT 1`,
    )
    .bind(tokenHash, nowIso())
    .first<LegacySessionRow>();
}

async function ensureOwnerUser(
  db: AdminD1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO admin_users
        (id, display_name, role, status, created_at, updated_at, approved_at)
       VALUES (?, 'Ani', 'owner', 'active', ?, ?, ?)`,
    )
    .bind(userId, nowIso(), nowIso(), nowIso())
    .run();
}

async function touchUnifiedSession(
  db: AdminD1Database,
  sessionId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE admin_sessions
       SET last_seen_at = ?, updated_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    )
    .bind(nowIso(), nowIso(), sessionId)
    .run();
}

async function revokeLegacySession(
  db: AdminD1Database,
  sessionId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE admin_passkey_sessions
       SET revoked_at = ?, updated_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    )
    .bind(nowIso(), nowIso(), sessionId)
    .run();
}

function principalFromRow(row: UnifiedSessionRow): AdminPrincipal {
  return {
    userId: row.user_id,
    role: row.role,
    sessionId: row.id,
    authMethod: row.auth_method,
    stepUpAt: row.step_up_at,
    restriction: row.restriction,
    displayName: row.display_name,
    credentialId: row.credential_id,
  };
}

async function csrfTokenForSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`admin-csrf-v1:${token}`),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function cookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function expiredCookie(name: string): string {
  return cookie(name, "", 0);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return mismatch === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
