# Auth compatibility source audit

Snapshot: 2026-09-13. Read the 15 pending helper/test files listed below. No auth, session, account, credential, provider, or permission behavior changed. The core admin-auth, machine-token source and active middleware/API boundary were audited separately and are not counted again here.

## Reachability and integration boundary

Current page inventory has `auth.astro`, but no API routes for native auth session, passkey registration/login, password login, invitations, device claims, or Google recovery. The sign-in page links to the sanitized editorial destination behind the existing Access flow. Tests call compatibility helper functions directly; endpoint-shaped test URLs do not establish deployed route availability. These modules must not be wired into the new workspace merely because they exist.

`admin-client-auth.ts` still fetches `/api/admin/auth/session` before mutations. That endpoint is absent. Its current source consumers are the retained `WritingEditor.tsx` and `ControlPlaneReceipt.astro`; the compatibility `/content/edit/[pageKey].astro` imports WritingEditor. Therefore that legacy editor cannot obtain CSRF through this helper in the current app if a mutation is exposed. This is a verified route/helper mismatch, not a reason to restore retired authentication. The new editorial editor uses its own existing authorized route contract. Decide whether compatibility controls remain read-only or show a truthful unavailable state. ControlPlaneReceipt has no direct page import found in the bounded caller search; do not claim it is active solely from its script.

## Concrete dormant risks and limitations

1. **Partial one-time transitions:** invite verification consumes its challenge and marks the invitation used before separate user/credential inserts; device claim locks claimed_at before separate session creation; Google recovery consumes the OAuth request before provider exchange and inserts a replacement credential before separate revocation/session steps. Failures can leave a consumed operation without a delivered usable session or completed enrollment. Existing tests do not inject every intermediate failure or prove transactional recovery. This is a retained compatibility design limitation, not a live incident; no transactional auth refactor belongs in this workspace UI release.
2. **External wait/resource bounds:** security notification fetch and OAuth token exchange use fixed provider URLs but no explicit timeout or streaming response-size limit. Notifications run after some credential/session state writes and before response cookies are delivered; slow delivery or notification bookkeeping failure can delay/fail the caller after the principal mutation. Alert sends require their existing environment enablement. No alert was sent or provider session inspected here.
3. **Mutation helper destination:** `adminMutationFetch` accepts RequestInfo/URL without enforcing same-origin and attaches x-admin-csrf after reading the local session token. Current inspected consumers pass fixed local paths, so no current attacker-controlled destination is established. Do not reuse it with untrusted URLs. Its test name says same-origin but only asserts credentials configuration, which does not restrict custom-header destinations.
4. **Bootstrap identity scope:** retained `passkey-auth.verifyAccessIdentity` accepts any successfully verified email identity within configured Access audience and bootstrap uses zero active credentials, rather than an exact owner email predicate. This differs from the active editorial owner gate and must not replace it. Native bootstrap routes are absent; actual Access policy membership was not inspected.
5. **Unsupported readiness inference:** passkey status readiness derives historical audit counts and session presence. Such counters cannot prove all live browser/access-removal requirements. Preserve the repository's explicit provider/browser proof sequence; this UI work does not authorize Access removal.

Body-size and token-user revocation concerns already documented in `api-audit.md` are not duplicated as new findings. No source claims above authorize reactivating password, invite, or recovery routes.

## Contracts retained

- **Client:** uncached same-origin session-token request, explicit authenticated envelope, typed error, session CSRF header. Step-up path encodes its next parameter; final destination safety depends on the receiving route, not encoding alone.
- **Public allocation:** atomic conditional insertion enforces five requests/source and 120 global per 10-minute device/recovery bucket; source address is hashed before storage. Failed/missing change counts reject allocation. Forwarded-IP trust remains a deployment boundary.
- **Invites:** only operator/viewer creation behind member approval capability; hashed opaque 30-minute token; challenge/record binding; pending member enrollment; separate owner approval; revoked/used/expired states. No owner role invitation.
- **Device approval:** five-minute request, hashed verifier cookie, exact origin on allocation/claim, passkey credential provenance for approval, restricted principals denied, conditional once-only claim, and active approving credential requirement for created sessions. User-agent description is advisory display text, not security proof.
- **Google recovery:** random state/nonce/verifier, PKCE S256, OpenID-only scope, fresh authentication, issuer/audience JWT verification, nonce hash, allowlisted subject joined to active owner, restricted short-lived session, challenge-bound replacement passkey, generic exchange errors. No email-based automatic owner enrollment.
- **Passkeys:** SimpleWebAuthn verification with expected RP/origin and required user verification; resident credentials and hybrid/security-key hints; purpose-specific expiring one-time challenges; user/session binding for enrollment; active-user checks; collision-safe same-user revoked-credential reactivation; generic production errors; mutation/step-up requirements for identity management; last-credential check retained.
- **Password compatibility:** PBKDF2 SHA-256 format, minimum iteration check, constant-time equal-length byte comparison, exact login origin, generic bad-credential response, signed 30-day cookie, production fail-closed limiter when DB lookup unavailable. This self-contained legacy session is not imported by active middleware in this inspected source graph.
- **Notifications:** local security-event row always attempted; optional fixed Resend transport only under explicit environment configuration; delivery/failure recorded separately. Current code does not expose raw response bodies to the caller.

## Test evidence

Ran seven targeted Vitest files at 02:48:19: **33 tests passed**. No real authenticator, OAuth, D1 production DB, account, access policy, or provider call was exercised.

| File                         | Meaningful coverage and limit                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin-auth-flows.test.ts     | Device/invite states, PKCE/fresh-auth parameters, nonce and stale auth rejection, bearer syntax. Pure helper tests, not end-to-end enrollment.                                                                             |
| admin-auth-security.test.ts  | Passkey-only approval provenance, active credential conditional session SQL, allocation budget refusal, and removed invitation entry routes. Mock SQL execution, not concurrent production D1.                             |
| admin-client-auth.test.ts    | No-cache token request, header preservation, unauthorized failure, encoded next path. Does not prove current endpoint exists or external URL rejection.                                                                    |
| admin-machine-tokens.test.ts | Conditional rotation batch, race cleanup, owner-scoped revoke/audit. Core token helper separately audited; no provider token minted.                                                                                       |
| passkey-auth.test.ts         | JWT config/issuer/audience contract, rejection of unsigned identity headers, key-set reuse, failure denial. jose verification mocked.                                                                                      |
| passkey-ceremony.test.ts     | Discoverable credential options, resident/UV requirements, challenge replay, revoked credential, malformed assertion rejection, same/cross-user collision. Uses lightweight DB fake; no full successful hardware ceremony. |
| password-auth.test.ts        | Independent PBKDF2/HMAC fixtures, valid/invalid signed token, origin rejection, private cookie, generic password failure. DEV context, no production rate-limit concurrency or real login.                                 |

No dedicated notification delivery or full invitation/recovery transaction-failure tests were found in this bounded set. A passing helper test is not evidence that retired routes are supported.

## Exact reviewed files

All files are `reviewed-retained` at these hashes, with the above limitations explicit.

| File                                              | SHA-256                                                            | Disposition       |
| ------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| `apps/admin/src/lib/admin-auth-flows.test.ts`     | `a94c3cc9c3a2f2ffa0a5c2e37e785cd8052903984bc3c2ddbd51fa93eacb956b` | reviewed-retained |
| `apps/admin/src/lib/admin-auth-security.test.ts`  | `39f2795bddda2e40c4e2e904634d8a11f4388af622cc4570e8fe2ee9433797b3` | reviewed-retained |
| `apps/admin/src/lib/admin-client-auth.test.ts`    | `d6ce0654d73d9c513275b2ab613d3f3017efd30d7e2ae6261a342dfbf1553204` | reviewed-retained |
| `apps/admin/src/lib/admin-client-auth.ts`         | `df529b3cf48b6e6d436e1bd0a02475b2514741dbcf7ab5d86ca18392e62f5bcc` | reviewed-retained |
| `apps/admin/src/lib/admin-invites.ts`             | `f2e67ad5838fc1f2285caacf6903f1f41e900a854a07fcbcc3a93e762cbe9f6e` | reviewed-retained |
| `apps/admin/src/lib/admin-machine-tokens.test.ts` | `9dc7209da097003e1fc8eb19f10351f92244332f9184840f09aa1c20f9f618fe` | reviewed-retained |
| `apps/admin/src/lib/admin-public-rate-limit.ts`   | `d0f509e1c45b34f47b2d995e23aa91c290abe19598cfe022d3df61a3998362b2` | reviewed-retained |
| `apps/admin/src/lib/admin-recovery.ts`            | `be7fc12b9985c5f141668c8a172dbb71f184fe1178f251d197521b004a767b61` | reviewed-retained |
| `apps/admin/src/lib/device-authorization.ts`      | `0d40bf68c1ab2e64a9d4c4dc8b0206e48e464beb34133c9b783a02f06c92cfdf` | reviewed-retained |
| `apps/admin/src/lib/passkey-auth.test.ts`         | `6eb0f006a860239c5b3a32c4d863fdcebeba82bc503ef3dde052438da848a661` | reviewed-retained |
| `apps/admin/src/lib/passkey-auth.ts`              | `79fe053fda9fccab845eab63573f9cc09d60e9371771fcebc5ed4d3b9b55a967` | reviewed-retained |
| `apps/admin/src/lib/passkey-ceremony.test.ts`     | `ff5a2443548af600bb3fddb2ba222ab27f6e33b592c419315dddb401586f6506` | reviewed-retained |
| `apps/admin/src/lib/password-auth.test.ts`        | `5d56ba0547f71b24450bd15004a96bb218ab1eb78dcea5740c9f8b22c8fce232` | reviewed-retained |
| `apps/admin/src/lib/password-auth.ts`             | `e9bbc30187015ca3fe7aa0270f3bfd367e390878f6b3a6191aff1380fdadce2e` | reviewed-retained |
| `apps/admin/src/lib/security-notifications.ts`    | `0a5668fc3d29b336b0fef658e694ad4092b3fbf4aa77153cf0f6092663dbb473` | reviewed-retained |
