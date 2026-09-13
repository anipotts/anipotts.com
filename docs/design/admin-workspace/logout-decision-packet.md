# Shared logout decision packet

Source-only inspection, 2026-09-12. No auth code changes, live session probes, credentials, provider configuration or logout actions. Production configuration is unknown.

## Confirmed seams

- Shared `EditorialWorkspaceShell.tsx` footer links to `/cdn-cgi/access/logout`. This is a provider endpoint, not a repository route or proof of native session revocation.
- `EditorialApp.tsx` alone listens for that link click and calls `clearEditorialRecovery`. AdminShell mounts no equivalent listener. Cleanup currently clears every editorial recovery key on this origin, publishes `editorial-recovery:logout`, and dispatches the same-tab event. HomeEditor and NewWriting listen for same-tab and cross-tab logout and disable recovery rewriting. This includes private creation recovery, not server drafts.
- `middleware.ts` Content namespace requires verified editorial Access owner (or approved local preview). Operations/Life can accept retained Access for GET/HEAD or native sessions. **Retained Access never admits POST**; native resolution therefore runs for ordinary mutation requests. Avoid transferring a synthetic GET Access principal into a native logout context.
- `lib/passkey-auth.ts:logout` already performs `requireAdminSessionAction`, `revokeAdminSession(..., "logout")`, audit event, and `expiredAdminSessionCookies`. It is retained implementation, not an active route.
- `scripts/ci/admin-route-inventory.mjs:RETIRED_ADMIN_AUTH_FILES` explicitly lists passkey/logout, password/logout and auth/session handlers. Those files do not exist. `adminMutationFetch` requests the retired auth/session endpoint; directly wiring it into the footer will fail.
- `requireAdminSessionAction` checks exact request Origin, native cookie and session-bound `x-admin-csrf`; it intentionally does not require fresh passkey step-up merely to log out. `sessionCsrfToken` derives the existing CSRF value from the cookie, conditional on a principal.
- `resolveAdminSession` is not a pure probe. It touches existing sessions and can migrate legacy passkeys, creating a unified session, revoking the legacy session and emitting audit/cookies. Do not add speculative cross-workspace calls just to detect native presence.

## Smallest implementation decision

Immediate independent shell fix: put recovery cleanup in the shared explicit logout handler, remove EditorialApp's duplicate click listener, preserve existing logout event propagation, and keep server drafts untouched. Make cleanup timing explicit: failed native logout must retain recoverable unsaved work; do not clear it before the native step acknowledges success. Dirty editor navigation should reuse its flush/guard rather than silently discarding local-only text. Storage-disabled behavior must not break logout navigation.

Complete native + Access logout needs one deliberately reviewed active adapter; there is no existing live native route to reuse. Prefer a dedicated logout-only endpoint over restoring retired registration/password/session-management surfaces. It must accept same-origin POST only, reuse existing native session CSRF/revocation/cookie primitives, and return a fixed provider logout destination rather than a user-controlled return URL. Native success must precede redirect to Access logout, so combined sessions are both ended. Native-only logout should land at the fixed auth screen if no provider logout is needed. Access-only can continue the existing provider flow without a spurious native failure, but the server must distinguish no native cookie from native storage unavailable; unavailable cannot be treated as signed out.

A CSRF bootstrap is needed because the existing client session endpoint is retired. Choose a minimal authenticated same-origin/no-store logout context or server-injected logout token; either needs explicit integration review. It must expose only logout capability and CSRF, never session tokens or sensitive record data. GET retained-Access principal alone does not establish which native session to revoke. For cookie-backed native logout, use actual native session resolution and account for all returned expiration/rotation cookies. If avoiding legacy migration is required, introduce a logout-specific non-creating native lookup that revokes an existing legacy session directly rather than making `resolveAdminSession` pretend to be read-only.

Do not activate endpoints, restore routes, change Access policy, or revoke real sessions until the integration owner approves this explicit source/API contract. Implementing tested local code does not prove deployed authentication configuration.

## Test strategy and acceptance

- Route inventory: dedicated adapter added intentionally; retired auth routes stay absent. GET cannot revoke. Exact Origin mismatch and missing/wrong CSRF reject without writes.
- Native-only: correct actual session id revoked, expected audit once, all native/legacy cookies expired, response private/no-store. Restricted or stale-step-up authenticated sessions can still end themselves; credentials and other sessions remain unchanged.
- Access-only: provider flow works, no fabricated session revocation, no activation of native authentication. No cookie plus verified owner differs from missing storage with a cookie.
- Combined: GET synthetic Access identity never substitutes for native session id; POST revokes native before provider navigation. No success on storage/audit failure; one recovery action, no duplicate submissions.
- Legacy/expired: explicitly test chosen migration-free revocation or documented resolver rotation semantics; response applies all cookies and never returns a usable residual session accidentally.
- Shared shell: Content, Operations and Life all clear the intended current-origin recovery on successful logout; other tabs stop rewriting it, creation buffers included. Failure retains recovery and does not navigate. Test disabled storage and pending saves.
- Browser with recoverable fixtures: click and keyboard logout behavior, focus/failure recovery, dirty editor handling. No real logout merely to test UI without the relevant current action authorization. Provider cookie clearing requires separately observed provider proof.
