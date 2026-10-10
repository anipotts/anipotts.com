# Platform architecture

Updated: 2026-09-28. Release completion evidence lives in [the site release review](site-release-review-2026-09-07.md).

## Active surfaces

| Surface            | Source                 | Role                                                                                 |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------ |
| anipotts.com       | `apps/www`             | Public Astro pages served from the `anipotts-content` D1 store, newsletter endpoints |
| admin.anipotts.com | `apps/admin`           | Astro admin behind Cloudflare Access, editor, previews, operations state             |
| api.anipotts.com   | `workers/state`        | Durable state and authenticated command relay                                        |
| Ingest             | `workers/ingest`       | `brands_email` receiver for the Apps Script capture, no schedule                     |
| Newsletter         | `workers/newsletter`   | Subscription and issue queue consumer                                                |
| Weekly email       | `workers/weekly-email` | Retired in place: no schedule and no send, GET reports queue counts                  |

`api.anipotts.com` holds the links vault today: its commits plane has no producer, and its command relay stays disabled while no device key is bound (ledger A-22).

The legacy Solid app's source and deploy target are removed from this repo. Historical source is recoverable through Git at the parent of `26a6b98c`. Its production worker is gone too: the `legacy-admin-solid.anipotts.com` domain was removed on 2026-09-23 and the `anipotts-admin-solid` worker was deleted on 2026-09-24 (ledger A-36.7). `anipotts-db` was shared and is untouched. Active Astro route and authentication tests remain independent of retirement.

The four retained workers keep an explicit route, queue or Durable Object binding. None has a cron schedule since 2026-09-22; see [worker inventory](worker-inventory.md). They are operational functionality, not public-page rendering dependencies. Their remaining outbound and data-mutation boundaries are unchanged.

## Public content ownership

- `content/public/pages`: approved page copy
- `content/public/projects`: stable work records, visibility, media and detail content
- `content/public/writing`: essays, original dates, publication states and metadata
- `packages/content/src/public/site.ts`: site identity, origin, contact, navigation and social links
- `packages/content/src/public/schema.ts`: canonical project/writing frontmatter validation shared by Astro and generation
- `packages/content/src/public/providers.ts`: approved workflow artwork
- `packages/content/src/public/visibility.ts`: public inclusion rules

One generated projection has active consumers: typed defaults for app rendering and adapters. Generation is one-way from canonical sources and drift-checked. The admin review JSON, unused validation JSON, future database seed, and reverse-bootstrap mode are removed.

Public pages serve published records from the `anipotts-content` D1 store. `CONTENT_RUNTIME` must be exactly `cms`; any other value is a no-store 503 on every content route, and the bundled Git content is never a runtime source on its own. Git Markdown supplies the initial records and the Admin editor's source baseline; see [direct CMS publication](design/admin-workspace/direct-cms-publication.md). Stored identifiers such as `making` and `project:<slug>` survive only at compatibility boundaries. They do not create another published dataset. Historical migrations and production data are unchanged.

`/work` owns the public work index and details. Permanent old-URL redirects remain in the public middleware. Hidden projects and unpublished writing return 404 at detail URLs. Feeds, sitemap and release smoke consume the same public content inclusion decisions.

## Shared code

| Package                         | Responsibility                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| `packages/content`              | Public contracts/settings, editorial source and publication contracts |
| `packages/types`                | Shared app and operational contracts                                  |
| `packages/lib`                  | The Drizzle migration schema                                          |
| `packages/brand`                | Marks, fonts, shared tokens and typography                            |
| `packages/control-plane-runner` | Local relay client, journal and proof outbox                          |
| `packages/runtime-contract`     | Worker runtime binding contract evaluator and log reporter            |

The old database-first public readers, fallback datasets, Solid-only services and unused package exports are removed. The admin-control entrypoint is gone from `packages/lib`; Astro admin reads its own contracts, and root Drizzle tooling still consumes the database schema. Worker and runner implementations remain in their own active packages.

Admin still binds `anipotts-db` as `DB` so the deploy applies its migrations, but no admin page reads it, and the runtime contract reports no feature for it. The `admin_knowledge_cards` table and migration 0041 stay in place, quarantined rather than dropped.

Production sets `PRIVATE_READER_ENABLED` and `PRIVATE_READER_OPS_ENABLED`, and leaves `PRIVATE_READER_HEALTH_ENABLED` and `PRIVATE_READER_KNOWLEDGE_ENABLED` unset. So Records and Sources read the private reader, and Sources, Observability and the overview read the ops snapshot. Knowledge shows "Not built yet" and makes no request. Health makes no health request: it shows "No vitals collected", the last phone sync as "Not recorded" (System has no arrival marker yet), and, once System lists it, the `health.metrics` check from the ops snapshot. Each reads the private reader only behind its own flag, and enabling `PRIVATE_READER_HEALTH_ENABLED` (a new `health:read` credential) is an auth change for Ani to approve.

## Authentication and production boundaries

Cloudflare Access and the signed application assertion for exactly
`hello@anipotts.com` are the human authority. The required login contract is
Google through the existing human Access app/audience, with one selected Google
IdP and instant authentication after staged owner and denial proof. Instant
authentication skips the Access chooser; Google may require account selection,
reauthentication or MFA. It does not prove MFA on every login.

Provider cutover is independently gated. Record the actual app/IdP UUIDs,
policy/group bindings, path applications, bypasses, WARP authentication,
MFA/device restrictions, session durations and alternate hosts before effects.
Verify the actual Google email, not forwarding or alias delivery. Preserve the
effective restrictions and durations. A shared policy must be copied to an
app-owned policy before changing only the human app's binding. Shared IdPs,
groups, other applications and account security settings keep their controls.
The dated rollout receipt must distinguish this requirement from verified live
configuration and owner/device acceptance.

Stage an app-owned exact-email Include plus required Google login method, close
competing human authorization paths, and perform the separately approved
human-app token cutoff. This revokes all tokens for that app. After fresh Google
owner success and wrong-user, service-identity, old-token and OTP-only global
session denial, remove OTP from this app's IdP options and enable instant
authentication. An unsuitable identity, missing policy/host evidence or
incompatible MFA/device control holds cutover rather than relaxing controls.

The custom Worker admits only `https://admin.anipotts.com` in production before
Vite, assets, auth/health exceptions or adapter routing. Existing build-controlled
DEV loopback and compiled local-owner predicates remain bounded to local review;
forwarded headers cannot activate them. Other origins receive an inert uncached
rejection. The earlier A-36.6 report of a dashboard-only
`legacy-admin.anipotts.com` domain remains historical provider evidence, not proof
that the domain was removed or covered by Access. Host inventory and canonical
origin admission are independent controls. DNS/domain changes remain separately
governed.

Editorial reads and writes require the verified owner and retain CSRF, fixed
production mutation origin, input bounds and concurrency controls. Other pages
receive read authority only. Reader delegations retain fixed read scopes and a
60-second expiry capped by the parent assertion. The canary endpoint retains its
separate service identity/audience; human identity cannot authorize it. Health
and Knowledge keep their existing flags. No new role or machine-auth mode is
introduced. Newsletter and reserved operation controls retain their boundaries.

Same-origin Admin JSON requests send `X-Requested-With: XMLHttpRequest`, reject
redirected HTML and handle bounded JSON. Confirmed expiry locks the document and
provides safe top-level reentry without replaying writes. Locked views and the
auth shell also offer explicit sign out to change account through `/auth/logout`;
this uses the existing required plaintext cleanup and fixed Access logout flow.
Expiry never triggers logout or recovery deletion automatically. Network/HTML failures,
policy denial and application validation/CSRF refusals remain distinct. The
cross-origin tailnet reader keeps its existing transport and device grant.

Private documents capture the logout generation synchronously in the head, before
stylesheets or client islands can delay hydration. A later generation change
withdraws server-rendered content, serialized island props and late streamed
content, and prevents stale consumers from issuing protected requests.
A separate nonsecret logout-intent latch also fences documents opened during
required local cleanup and the bounded app-cookie attempt. The latch ends just
before the fixed vendor logout navigation, after required cleanup succeeds;
failure or interruption keeps it in place for explicit logout retry. This is
client coordination, not evidence that provider logout has propagated. Fresh
requests after vendor navigation still depend on Access verification and its
documented propagation window.
Standalone draft previews use this same-origin document fence around an opaque
preview frame. Embedded previews require explicit frame mode and browser iframe
fetch metadata; a raw-mode URL opened in a tab gets the fenced wrapper. Draft
rendering keeps its existing sandbox and no-connect/no-form restrictions.

Explicit logout invalidates browser generations, autosave, polling and pending
responses before network cleanup, clears local plaintext/recovery across tabs,
and awaits the same locks used by recovery writers. Storage or lock failure is
incomplete cleanup, not success. Authentication expiry preserves owner-scoped
browser recovery for deliberate resume; acknowledged server drafts remain.
Open documents from an older release must close or reload before cross-tab
acceptance: deployed JavaScript cannot retrofit the lifecycle guards into those
documents.
BFCache and resume cannot restore stale private state. After completed local
cleanup and bounded best-effort app-cookie cleanup, the fixed
`https://admin.anipotts.com/cdn-cgi/access/logout` destination ends the Access user
session across Access apps. Google stays signed in. Access documents a 20 to 30
second propagation window; each delegation remains valid for at most 60 seconds
from issuance. Late issuance could extend reader access to roughly 90 seconds
plus verified reader clock tolerance. This is an inference, not observed timing;
participating documents stop renewal/rendering immediately and in-flight remote
responses may finish later. See [Access session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

Native passkey, password, invite, recovery, device and D1 session fallback were
retired on 2026-09-22. The [archive manifest](archive/admin-native-auth-retirement-2026-09-22.md)
identifies recoverable remote Git source and dependency disposition. Historical
auth tables, migrations and audits remain intact; lean Access principal helpers
and browser draft recovery remain active.

The protected inventory in `scripts/ci/admin-route-inventory.mjs` drives route
parity and smoke. Content, Data, Observability and existing safe redirects remain
supported. Admin no longer binds the command relay or serves MCP, projection,
knowledge, control-plane or compatibility write APIs; the relay remains in
`workers/state`. Public code must not import admin-only contracts or operational
write tables; `pnpm test:public-boundary` enforces this separation.

## Verification and releases

The four workflows are `ci.yml`, `security-review.yml`, `deploy.yml` and `smoke.yml`. No external paid model review workflow is allowed.

- `check:changed` includes committed, staged, unstaged and untracked changes by default; ignored files stay excluded.
- `check:changed --commits-only` checks the committed branch diff and omits uncommitted work. The shared CI file collector retains its committed-tree default.
- `--working-tree` remains a compatible alias for the default local scope.
- `validate` checks the whole workspace.
- `content:check` checks generated content drift.
- `test:admin-solid-retirement` prevents the retired app or deploy target returning.

Deployable changes use same-repository PRs and exact-current-head provider checks. The release classifier selects affected targets; deleting the old deployment job must not select unrelated workers. Existing production migration and authenticated-smoke gates remain enforced.

See [release architecture](release-architecture.md), [local development](local-development.md), and [worker inventory](worker-inventory.md). Older dated architecture proposals are historical context, not alternate executable contracts.
