# admin auth v2 architecture

Date: 2026-07-31

Status: retired 2026-09-22. Cloudflare Access with the exact-owner check is the
only Admin sign-in. The passkey, password, invite, recovery, device, machine
token and native session code this describes was removed and is recoverable
from the `archive/admin-retired-auth-2026-09-22` tag. Its D1 tables and
migrations stay in place. The rest of this document is historical.

## decision

`admin.anipotts.com` uses one passkey-first human auth boundary. `/auth` is the
canonical signed-out route. `/auth/passkey` is a compatibility-only 308 redirect
that preserves a sanitized same-origin `next` path.

Cloudflare Access remains the outer gate until registration, login, logout,
session persistence, owner recovery, authenticated route access, and
unauthenticated app-native denial all pass against the deployed native boundary.
Removing Access is a separate authorized operation after that proof.

The implementation follows the security contracts in
[WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/),
[NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b/session/),
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[OAuth 2.0 Security BCP](https://www.rfc-editor.org/info/rfc9700/), and
[OAuth device authorization](https://datatracker.ietf.org/doc/html/rfc8628).

## fixed trust boundaries

- the production WebAuthn relying-party id is `admin.anipotts.com` and the
  expected origin is exactly `https://admin.anipotts.com`.
- passkeys are the only normal human authenticator. The signed-out surface has
  no password tab or password form.
- Cloudflare Access is defense in depth during rollout. It is not treated as a
  substitute for the native session, role, CSRF, or step-up checks.
- app roles never grant repository, provider, publish, deploy, outbound, or
  other external authority that is absent from the repo authority gates.
- browser session cookies never authorize `/api/mcp`. That route accepts only a
  valid bearer token with `mcp:read`.

## identity and authorization

The application principal is:

```ts
type AdminPrincipal = {
  userId: string;
  role: "owner" | "operator" | "viewer";
  sessionId: string;
  authMethod:
    "passkey" | "device_approval" | "google_recovery" | "legacy_passkey";
  stepUpAt: string | null;
  restriction: "recovery" | null;
  displayName: string;
  credentialId: string | null;
};
```

There is one non-revoked owner. Role capabilities are fixed:

| role     | app capabilities                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| viewer   | `admin:read`                                                                                                           |
| operator | viewer capabilities plus `draft:save` and `action:stage`                                                               |
| owner    | operator capabilities plus `identity:manage`, `member:approve`, `content:publish`, `deploy:run`, and `control:execute` |

Every authenticated administrative mutation calls
`requireAdminMutation(context, capability)`. The guard enforces the exact
request origin, an active unrestricted session, the role capability, passkey
step-up within ten minutes, and the session-bound `x-admin-csrf` header. Public
login, invitation-enrollment, device-claim, and recovery ceremonies use exact
origin plus their own one-time challenge, token, verifier, state, or nonce
contracts. A valid owner session still cannot bypass a separate repo authority
gate.

Clients read the current principal and CSRF value from
`GET /api/admin/auth/session`, then use `adminMutationFetch`. The helper sends
`x-admin-csrf` and same-origin credentials. New mutation clients should use this
helper rather than constructing the header independently.

## session contract

The normal browser session is one opaque `__Host-admin_session` cookie with
`Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.

| policy                    | value      |
| ------------------------- | ---------- |
| absolute lifetime         | 30 days    |
| inactivity limit          | 7 days     |
| sensitive-action step-up  | 10 minutes |
| recovery-session lifetime | 10 minutes |

Only a token hash is stored in `admin_sessions`. Resolution rejects revoked,
expired, over-age, and inactive rows. The old passkey cookie is accepted once,
rotated into the unified session, audited, and expired. The password cookie is
expired and never migrated.

Recovery sessions carry `restriction = "recovery"`. They cannot use ordinary
admin capabilities. They exist only long enough to register a replacement owner
passkey.

## WebAuthn ceremonies

Authentication is username-free. Login options omit `allowCredentials`; the
returned credential id resolves the user. User verification is required for
both authentication and registration.

Future registration requires a discoverable credential and advertises
`client-device`, `hybrid`, and `security-key` hints without restricting the
authenticator to a platform device. Existing credential ids remain valid unless
explicitly revoked.

Challenges are one-time, purpose-scoped, origin-bound, and auditable. Replay,
wrong origin, missing user verification, expired challenge, and revoked
credential paths fail closed.

## cross-device approval

`POST /api/admin/device/start` creates a five-minute request. The QR contains
only the opaque request id. A separate high-entropy verifier is stored in the
host-only `__Host-admin_device_verifier` cookie and only its hash reaches D1.

The phone review route requires an existing unrestricted passkey session. It
shows the requesting device and request time, then requires explicit approval.
The waiting browser must possess the verifier to read, poll, or claim the
request. Approval is single-use and claim creates a new unified session for the
waiting browser. A stolen QR without the verifier cannot claim it.

## invitations and membership

Only the owner can create an operator or viewer invitation. Invitation links
contain a one-time token, while D1 stores only its hash. Links expire after 30
minutes.

The invitee registers a passkey and becomes pending. No ordinary session is
created until the owner approves the member with a fresh passkey step-up.
Non-owner recovery is owner-assisted revocation followed by a new invitation.
There is no ownership-transfer flow in this version.

## owner recovery

Google is owner recovery only. The authorization code flow uses PKCE S256,
exact callback matching, state, nonce, a fresh Google authentication, and an
allowlisted hashed Google `sub`. Email is never an identity key.

A successful Google callback creates a restricted ten-minute recovery session.
Registering the replacement passkey revokes old owner sessions and old owner
passkeys, preserves only the replacement credential, rotates into a clean normal
session, and records the recovery audit event.

Recovery and credential changes always create a narrow
`admin_security_notifications` row. Resend delivery is disabled unless the
explicit feature flag, provider secret, sender, and destination are present.
Enabling or sending the alert remains a separately authorized provider action.

## machine access

Named MCP tokens store only a hash and an eight-character hint. They carry only
`mcp:read`, expire after 90 days, and record last-use time plus a hashed request
IP. Create, rotate, and revoke require owner identity management with fresh
step-up and CSRF.

Rotation uses a conditional D1 batch. Exactly one caller can replace an active
token. A race revokes the uncommitted replacement and returns 409. `/api/mcp`
rejects browser cookies and missing, expired, revoked, or incorrectly scoped
bearer tokens.

## additive storage

Migration `drizzle/migrations/0043_admin_auth_v2.sql` adds:

- `admin_users`
- `admin_sessions`
- `admin_invites`
- `admin_device_authorizations`
- `admin_external_identities`
- `admin_recovery_requests`
- `admin_machine_tokens`
- `admin_security_notifications`

It extends existing passkey credential, challenge, and audit tables. It does not
delete or revoke an existing credential, remove Access, enable Google, or send a
notification. Additive D1 rows remain in place during rollback.

## implementation map

| concern                              | canonical code                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| session, role, origin, CSRF, step-up | `apps/admin/src/lib/admin-auth.ts`                                           |
| middleware route boundary            | `apps/admin/src/middleware.ts`                                               |
| passkey ceremonies                   | `apps/admin/src/lib/passkey-auth.ts`                                         |
| cross-device approval                | `apps/admin/src/lib/device-authorization.ts`                                 |
| membership invitations               | `apps/admin/src/lib/admin-invites.ts`                                        |
| Google owner recovery                | `apps/admin/src/lib/admin-recovery.ts`                                       |
| security notification seam           | `apps/admin/src/lib/security-notifications.ts`                               |
| scoped bearer tokens                 | `apps/admin/src/lib/admin-machine-tokens.ts`                                 |
| browser CSRF client                  | `apps/admin/src/lib/admin-client-auth.ts`                                    |
| canonical signed-out UI              | `apps/admin/src/pages/auth.astro`                                            |
| additive schema                      | `drizzle/migrations/0043_admin_auth_v2.sql`, `packages/lib/src/db/schema.ts` |

## proof before production promotion

The code gate must pass on the exact integration head:

1. run route parity, focused auth tests, typecheck, build, and `pnpm validate`.
2. compare the selected source and implementation at 1440 x 1024 in the same
   visual input. Verify 390 x 844, dark mode, reduced motion, focus, labels,
   direct login, phone approval, invitation, pending, recovery, error, and
   expiry states.
3. preserve Cloudflare Access and confirm that no local preview proof is being
   represented as a live passkey ceremony.

The visual record is `design-qa.md`. It does not satisfy the production
ceremony gates below.

## production rollout and proof

Run each numbered phase separately. Stop at the first failure.

1. Capture the current Access application and policy, current admin deployment,
   live credential/session counts, current route responses, and the rollback
   deployment id. Do not print secret values.
2. Review and apply migration `0043_admin_auth_v2.sql` to `anipotts-db` while
   Access remains active. Prove table/index presence and unchanged trusted
   credential counts.
3. Deploy `admin=true` only from the accepted integration SHA. Prove every other
   deploy target skipped and health is green.
4. Bootstrap the one owner row and the allowlisted Google subject hash through
   the authorized path. Provider secrets stay outside Git.
5. Behind Access, prove native registration, username-free login, logout,
   30-day session persistence policy, 7-day inactivity enforcement, 10-minute
   step-up expiry, and authenticated rendering for every protected page and API
   in `scripts/ci/admin-route-inventory.mjs`.
6. Prove denial for no session, wrong origin, unsafe `next`, missing or invalid
   CSRF, replayed challenge, missing user verification, revoked credential,
   expired invite, duplicate approval, QR theft without verifier, wrong Google
   subject, OAuth state or nonce failure, role denial, and cookie-authenticated
   `/api/mcp`.
7. Create one temporary proof credential. Revoke it, request a challenge scoped
   to that revoked credential, deny its signed assertion, and record the
   revocation plus denied-login audit events without touching either trusted
   credential.
8. Prove Chrome on macOS, physical iPhone Safari, direct Codex WebAuthn when
   available, and Codex phone approval when it is not. Prove owner recovery
   cleanup and any enabled security notification using the authorized provider
   configuration.
9. Remove the password surface only after the native flows pass behind Access.
   The current implementation has already removed it from the human UI.
10. Request exact approval to remove Cloudflare Access. Remove it only after all
    prior evidence is attached to the accepted SHA and deployment.
11. From outside Access, rerun unauthenticated denial, authenticated access,
    logout, every role boundary, bearer-only MCP, recovery, and the full route
    inventory. Record the Access change and live route proof.
12. Keep `apps/admin-solid` during the rollback window. Archiving or removing it
    is a separate cleanup after the native boundary remains stable.

## rollback

Before Access removal, rollback restores the captured prior admin deployment and
keeps the existing Access application and policy unchanged.

After Access removal, any native-auth, recovery, role, route, or provider proof
failure triggers this order:

1. restore the captured Cloudflare Access application and policy.
2. restore the prior known-good admin deployment.
3. verify Access denial for an unauthenticated client and authenticated Access
   reachability to the prior admin.
4. stop promotion and preserve audit evidence. Do not delete the additive D1
   tables or rewrite credential history.

The rollback never revokes the two trusted existing passkeys unless the exact
recovery or credential-management operation was separately authorized and its
proof confirms the intended targets.

## current result

Code, focused tests, full combined validation, route-parity proof, and local
desktop/mobile visual QA pass. Cloudflare Access is still active. No migration,
credential, session, Google, Resend, D1, Access, secret, environment, deploy, or
production mutation occurred in this delivery task.
