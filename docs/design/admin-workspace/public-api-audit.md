# Public and compatibility API audit (#356)

Audited 2026-09-14 against `origin/main` at `9596e400`. Line numbers refer to that tree unless a row says otherwise. This is a code review receipt, not provider or live proof. No production D1 query, Cloudflare Access dashboard read, provider call, issue filing or deploy was performed.

Statuses that name the www endpoints PR or the ingest PR point at sibling branches. This receipt does not re-verify their diffs; their own PRs carry that evidence.

## Route inventory

Paths are relative to the repository root. `git ls-tree` lists 13 admin API files, 7 www API files and the www `/ingest` proxy.

### Admin (`admin.anipotts.com`)

| Route                                | File                                                        | Methods  | Guard                                                                                | Result                        |
| ------------------------------------ | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| `/api/health`                        | `apps/admin/src/pages/api/health.ts`                        | GET      | Public path (`apps/admin/src/lib/admin-access-policy.ts:6`)                          | Verified                      |
| `/api/mcp`                           | `apps/admin/src/pages/api/mcp.ts`                           | GET POST | Public path (`admin-access-policy.ts:7`), bearer `mcp:read`                          | F7, held                      |
| `/api/admin/logout`                  | `apps/admin/src/pages/api/admin/logout.ts`                  | ALL      | Middleware bypass (`apps/admin/src/middleware.ts:23-27`), own origin and CSRF checks | Verified                      |
| `/api/admin/control-plane`           | `apps/admin/src/pages/api/admin/control-plane.ts`           | GET POST | GET: Access viewer or native session. POST: native session, `control:execute`        | F6, fixed in this PR          |
| `/api/admin/inbox`                   | `apps/admin/src/pages/api/admin/inbox.ts`                   | GET POST | GET: Access viewer or native session. POST: native session, `action:stage`           | F6, fixed in this PR          |
| `/api/admin/knowledge`               | `apps/admin/src/pages/api/admin/knowledge.ts`               | GET      | Access viewer or native session                                                      | Read only, see `api-audit.md` |
| `/api/admin/observability`           | `apps/admin/src/pages/api/admin/observability.ts`           | GET      | Access viewer or native session                                                      | Read only, bounded reader     |
| `/api/admin/projections`             | `apps/admin/src/pages/api/admin/projections.ts`             | GET      | Access viewer or native session                                                      | Read only                     |
| `/api/admin/runtime-feed`            | `apps/admin/src/pages/api/admin/runtime-feed.ts`            | GET      | Access viewer or native session                                                      | Read only                     |
| `/api/admin/content/editor`          | `apps/admin/src/pages/api/admin/content/editor.ts`          | POST     | Native session, `draft:save` or `content:publish`                                    | F6, fixed in this PR          |
| `/api/admin/content/draft-operation` | `apps/admin/src/pages/api/admin/content/draft-operation.ts` | POST     | Native session, `draft:save`                                                         | F6, fixed in this PR          |
| `/api/editorial/[action]`            | `apps/admin/src/pages/api/editorial/[action].ts`            | ALL      | Signed Access owner assertion (`middleware.ts:28-50`)                                | Verified                      |
| `/api/editorial/media`               | `apps/admin/src/pages/api/editorial/media.ts`               | ALL      | Signed Access owner assertion (`middleware.ts:28-50`)                                | Verified                      |

### www (`anipotts.com`)

| Route                             | File                                                   | Methods          | Result                                  |
| --------------------------------- | ------------------------------------------------------ | ---------------- | --------------------------------------- |
| `/api/health`                     | `apps/www/src/pages/api/health.ts`                     | GET              | Verified                                |
| `/api/icon`                       | `apps/www/src/pages/api/icon.ts`                       | GET              | Read only                               |
| `/api/search`                     | `apps/www/src/pages/api/search.ts`                     | GET              | Read only                               |
| `/api/subscribe`                  | `apps/www/src/pages/api/subscribe.ts`                  | POST             | Alias of the newsletter subscribe route |
| `/api/newsletter/subscribe`       | `apps/www/src/pages/api/newsletter/subscribe.ts`       | POST             | F4                                      |
| `/api/newsletter/confirm`         | `apps/www/src/pages/api/newsletter/confirm.ts`         | GET              | Confirm on GET finding                  |
| `/api/newsletter/unsubscribe`     | `apps/www/src/pages/api/newsletter/unsubscribe.ts`     | GET POST         | Verified                                |
| `/api/newsletter/webhooks/resend` | `apps/www/src/pages/api/newsletter/webhooks/resend.ts` | POST             | F1, F2, F3                              |
| `/ingest/*`                       | `apps/www/src/pages/ingest/[...path].ts`               | GET POST OPTIONS | F5                                      |

## Verified correct

| Area                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editorial namespace      | Every method under `/`, `/content*`, `/newsletter*`, `/api/editorial/*` and the preview routes needs `verifyEditorialOwner` (`middleware.ts:28-50`). The token check requires RS256, a `*.cloudflareaccess.com` issuer, the configured audience, `type=app` and no `common_name`, and rejects tokens over 16,384 characters (`apps/admin/src/lib/access-identity.ts:36-89`).                               |
| Editorial mutations      | Same-origin `Origin` and `Sec-Fetch-Site`, a `__Host-` SameSite=Strict double-submit CSRF cookie with duplicate cookies rejected, a JSON content type, and a streamed byte ceiling (`apps/admin/src/lib/editorial-security.ts:44-116`). Failures fall back to a fixed 503 (`api/editorial/[action].ts:27-29`, `api/editorial/media.ts:14-16`).                                                             |
| Editorial inputs         | `requestId` must be a UUID (`apps/admin/src/editorial/draft-store.ts:477`). Media accepts JPEG, PNG and WebP by magic bytes with validated identities (`apps/admin/src/editorial/media-store.ts:3-29`).                                                                                                                                                                                                    |
| Retained Operations      | Access principals are GET and HEAD only (`access-identity.ts:20`) with role `viewer` (`access-identity.ts:25`). Mutations need a native session, fresh step-up, a session-bound CSRF token and an exact origin (`apps/admin/src/lib/admin-auth.ts:333-370`). Only `passkey-auth.ts:336`, `admin-recovery.ts:262` and `device-authorization.ts:259` set a step-up time, and no route imports those modules. |
| Logout                   | Exact origin on POST, cross-site `Sec-Fetch-Site` rejected, CSRF bound to the cookies and the Access assertion, fixed error codes (`apps/admin/src/lib/admin-logout.ts:53-135`).                                                                                                                                                                                                                           |
| MCP bearer checks        | Strict bearer parsing, hashed lookup, expiry, revocation and scope (`apps/admin/src/lib/admin-machine-tokens.ts:29-57`). Acceptance itself is F7.                                                                                                                                                                                                                                                          |
| Deployment guards        | `apps/admin/wrangler.toml:6` sets `workers_dev = false`. Retired auth route files are asserted absent by exact filename (`scripts/ci/admin-route-parity.test.mjs:314-315`).                                                                                                                                                                                                                                |
| Admin outbound fetches   | GitHub and release calls use `AbortSignal.timeout(15_000)` (`apps/admin/src/editorial/github-app.ts:64`, `github.ts:85`, `release.ts:30,155,164`). The observability reader caps responses at 262,144 bytes (`apps/admin/src/lib/observability-reader.ts:15`).                                                                                                                                             |
| www subscribe guards     | Origin check, a rate limit keyed on `cf-connecting-ip`, schema validation and a generic 500 (`apps/www/src/pages/api/newsletter/subscribe.ts:12-35`, `apps/www/src/lib/api.ts:19-64`), tested in `scripts/ci/public-api.test.mjs`.                                                                                                                                                                         |
| Resend webhook signature | HMAC-SHA256 over `id.timestamp.body` with a constant-time compare and multiple signatures (`apps/www/src/lib/newsletter.ts:342-371`). 401 on failure, 501 when the secret is unset (`resend.ts:34-44`). Duplicate provider events hit a unique index (`drizzle/migrations/0005_newsletter_system.sql:111-113`).                                                                                            |
| Unsubscribe              | GET renders a form and only POST changes state (`apps/www/src/pages/api/newsletter/unsubscribe.ts:11-44`).                                                                                                                                                                                                                                                                                                 |
| www health               | Reports availability without database errors (`apps/www/src/pages/api/health.ts:12-19`), tested in `scripts/ci/public-api.test.mjs`.                                                                                                                                                                                                                                                                       |

## Findings

| ID                | Surface                                                                                           | Status                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| F1                | Resend webhook replay window                                                                      | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| F2                | Resend webhook duplicate events                                                                   | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| F3                | Resend webhook body size and schema                                                               | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| F4                | Newsletter subscribe resend, oracle and malformed JSON                                            | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| Confirm on GET    | Newsletter confirmation link                                                                      | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| Resubscribe       | Unsubscribe suppression row blocks later issues                                                   | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| Rate-limit growth | `rate_limits` rows per rotating IP                                                                | Fixed in the www endpoints PR (branch `claude/356-www-endpoints`) |
| F5                | `/ingest` PostHog proxy                                                                           | Separate PR                                                       |
| F6                | Admin compatibility error bodies and request size                                                 | Fixed in this PR                                                  |
| F7                | Native session fallback, legacy passkey conversion, `/api/mcp` bearer acceptance, Access coverage | Held for Ani                                                      |
| F8                | Newsletter worker send timeout and error text                                                     | Held, newsletter-send lane                                        |

### F1: webhook has no replay window

`verifyResendWebhook` only null-checks `svix-timestamp` and signs it (`apps/www/src/lib/newsletter.ts:348-352`). It never compares the timestamp with the current time, so a captured signed delivery verifies indefinitely. Impact is low: a replay can only re-run `suppressEmail`, which keeps the first `suppressed_at` (`newsletter.ts:336`).

### F2: duplicate provider events re-apply side effects

`resend.ts:53-70` calls `suppressEmail` whether or not the `INSERT OR IGNORE` in `recordNewsletterEvent` (`newsletter.ts:151-182`) was a duplicate. No code path un-suppresses a subscriber (`newsletter.ts:130`, `:197`, `:251`), so re-suppressing a re-confirmed address is not reachable today. The event insert and the suppression are separate writes, so skipping side effects on a duplicate `svix-id` would drop a suppression after a partial failure followed by a same-id retry.

### F3: webhook body is unbounded and unvalidated

`resend.ts:38` reads `request.text()` with no byte ceiling before the HMAC. `resend.ts:46-51` casts the payload without schema validation.

### F4: subscribe re-sends, reveals suppression state and returns 500 on bad JSON

`createDoubleOptIn` returns early only for suppressed subscribers (`newsletter.ts:197`) and queues a new confirmation for pending and confirmed ones (`newsletter.ts:199-225`). The only throttle is per IP (`apps/www/src/lib/api.ts:42`). With `NEWSLETTER_QUEUE` bound (`apps/www/wrangler.toml:44-46`), the response body differs for suppressed addresses (`subscribe.ts:31`). Malformed JSON at `subscribe.ts:23` reaches the 500 branch (`subscribe.ts:32-34`). The only in-repo client reads `res.ok` alone (`apps/www/src/components/NewsletterSubscribe.astro:293-298`) and no page imports it.

### Confirm on GET

`apps/www/src/pages/api/newsletter/confirm.ts:11-31` confirms the subscriber on GET. Mail security scanners and link prefetchers can confirm an address someone else subscribed, which defeats double opt-in. Unsubscribe already uses the GET form and POST change pattern.

### Resubscribe after unsubscribe

`unsubscribeByToken` writes a `newsletter_suppressions` row (`newsletter.ts:292`). Resubscribing moves the subscriber to pending and then confirmed (`newsletter.ts:133`, `:251`), but the worker skips every delivery while that row exists (`workers/newsletter/src/index.ts:172-179`).

### Rate-limit table growth

`checkRateLimit` inserts one row per request and deletes old rows only for the same key (`apps/www/src/lib/api.ts:46-53`). Rotating client IPs grow `rate_limits` without bound.

### F5: `/ingest` proxy forwards everything

`apps/www/src/pages/ingest/[...path].ts:16-31` copies every inbound header to PostHog, has no timeout, no path or method allowlist, and returns upstream response headers unchanged on the first-party origin. `posthog.init` points `api_host` at `/ingest` (`apps/www/src/layouts/Shell.astro:193`), so any change reaches live analytics and a path allowlist needs checking against current posthog-js endpoints.

### F6: admin compatibility routes echoed exception text

Before this PR, on `origin/main`:

- `control-plane.ts:22-27` (GET) returned `error.message` with 503. Reachable by the Access viewer.
- `control-plane.ts:66-71` (POST, live control) returned `error.message` with 400 and bounded only a supplied Content-Length (`control-plane.ts:38-43`).
- `inbox.ts:37-45` returned `error.message`, including `unknown_field:<caller key>` from `packages/lib/src/admin-control/inbox-write.ts:238`.
- `content/editor.ts:46-51` (publish write) returned `error.message` and parsed an unbounded body at `:21`, before `requireAdminMutation` at `:23`.
- `content/draft-operation.ts:27-32` returned `error.message`.

Every POST reached `request.json()` without a byte ceiling, so a malformed body also echoed the parser's message. This closes `api-audit.md` F2 for these four routes. Its `/api/mcp` POST part stays open with F7.

This PR adds `apps/admin/src/lib/admin-compatibility-request.ts`. It reads JSON through the existing `readEditorialJson` byte counter and answers 413 or 400 with a fixed code. Unknown exceptions collapse to a route-owned code while HTTP statuses stay as they were. Code-owned codes still pass through: relay and request contract codes on control-plane, and inbox validation codes with any caller-supplied suffix removed. Guard and library `Response` objects pass through untouched. Success bodies, statuses and headers are unchanged.

| Route                                     | Body ceiling   | Too large                       | Bad JSON           | Unexpected failure              |
| ----------------------------------------- | -------------- | ------------------------------- | ------------------ | ------------------------------- |
| `GET /api/admin/control-plane`            | none (no body) | n/a                             | n/a                | 503 `control_plane_read_failed` |
| `POST /api/admin/control-plane`           | 2,048 bytes    | 413 `control_command_too_large` | 400 `invalid_json` | 400 `control_command_failed`    |
| `POST /api/admin/inbox`                   | 32,768 bytes   | 413 `request_too_large`         | 400 `invalid_json` | 400 `inbox_write_failed`        |
| `POST /api/admin/content/editor`          | 524,288 bytes  | 413 `request_too_large`         | 400 `invalid_json` | 400 `content_editor_failed`     |
| `POST /api/admin/content/draft-operation` | 131,072 bytes  | 413 `request_too_large`         | 400 `invalid_json` | 400 `draft_save_failed`         |

Each ceiling covers the route validator's largest accepted input with worst-case JSON escaping. The editor route still parses its now bounded body before `requireAdminMutation`, because the required capability depends on `action`. Reordering authorization in a publish-write route is left out of this change. `/api/mcp` POST still parses without a byte ceiling; it is held with F7.

`coverage.json` records the new SHA-256 for these four route files. The fingerprints in `api-audit.md` and `legacy-content-audit.md` are historical.

### F7: session fallback outside Access (held)

- For non-editorial paths without a valid Access assertion, middleware falls back to `resolveAdminSession` (`middleware.ts:94-146`, `admin-auth.ts:191-252`).
- That function accepts existing `__Host-admin_session` rows and converts a legacy `admin_passkey_session` cookie into a new owner-role session (`admin-auth.ts:215-251`, `ensureOwnerUser` at `:222`, role `owner` at `:242`, `INSERT OR IGNORE` at `:600`).
- `/api/mcp` is a public path (`admin-access-policy.ts:7`) and accepts any unrevoked, unexpired bearer token stored in D1.

Held because removing the fallback or bearer acceptance is an authentication change that needs Ani's exact approval. Exposure depends on unrevoked rows in production D1 and on whether the Access application covers every admin path. Both need production data access or a provider dashboard read, which no current authority covers.

### F8: newsletter worker send (held)

The Resend fetch has no timeout (`workers/newsletter/src/index.ts:269`). Provider error text is thrown (`index.ts:293-295`), logged (`index.ts:86`) and stored in `queue_error` events (`index.ts:88-91`). Mock mode logs recipient addresses (`index.ts:256-261`). The unused libraries `apps/admin/src/lib/admin-recovery.ts:398` and `security-notifications.ts:39` also fetch without timeouts. Held because `workers/newsletter` is a newsletter-send surface and an approval path (`scripts/ci/release-policy.mjs:59`).

## Release note

`config/release-train.json` enables `production_promotion` and `editorial_admin_release`, and `.github/workflows/deploy.yml:21-22` deploys on push to `main`. Merging an admin or www fix deploys it to production immediately.
