# admin.anipotts.com v2 architecture

Historical design proposal. The Astro admin is now the current app and the
Solid source/deployment target are retired. Follow [platform architecture](platform-architecture.md#authentication-and-production-boundaries)
for current ownership and authentication gates; retention steps below are superseded.

## goal

`admin.anipotts.com` should become Ani's practical operator dashboard and,
later, the web editing surface for public-site text and content.

The dashboard must answer one operational question first:

`what is safe to do next?`

The current control-plane model remains the backbone:

`intent / authority / operation / proof / state`

## current baseline

Live baseline:

- app: `apps/admin`
- worker: `anipotts-admin`
- host: `admin.anipotts.com`
- protection: Cloudflare Access plus staged app-native passkey middleware
- deployed state: Astro admin operator and content shell
- latest protected route set: `/`, `/inbox`, `/content`, `/content/review`,
  `/content/drafts`, `/content/edit/home`,
  `/api/admin/content/draft-operation`, `/content/preview`,
  `/content/operations`, `/newsletter`,
  `/newsletter/first-thing-agents-need-control-plane`, `/proof`, `/deploys`,
  `/repos`, `/handoffs`, `/fleet`, `/mutations`, and `/ops/destructive`

Current strengths:

- Astro admin is canonical for `admin.anipotts.com`
- the canonical inbox, content inventory, content review, operations,
  newsletter, proof, repos, handoffs, fleet, mutations, and destructive ops
  have protected routes
- `/repos` can render the local-dev Infra runtime repo overlay metadata through
  `/api/admin/runtime-feed`
- `admin_proof_events` provides durable proof rows in D1
- `/deploys` shows the scoped deploy target map without dispatch controls
- deploy workflow can target only admin
- unauthenticated users are blocked by Cloudflare Access before app content
  renders
- passkey tables and app middleware are deployed

Current gaps:

- no active passkey credential exists yet
- Cloudflare Access is still the outer boundary until passkey proof is complete
- first draft-save proof is still pending passkey-authenticated save proof
- content draft-operation saves are staged, but publish writes remain blocked
- `apps/admin-solid` remains as a legacy rollback surface

## recommended v2 shape

Continue with `apps/admin` as the canonical Astro admin app. Do not create a
second admin app unless it removes more complexity than it adds.

Keep the sidebar-first operator shell. Use Astro for routing, layout, and
server-rendered read views. Add islands only where live state, filters,
optimistic previews, or stream updates need client-side state.

The next architecture milestone is proof, not another framework migration:

- enroll the first passkey while Access still protects the app
- prove app-native login, logout, persistence, and denial paths
- remove Access only after the proof script and browser proof both pass
- then archive or remove `apps/admin-solid`

## information architecture

Primary sidebar:

- inbox
- health
- content
- income
- system

Inbox should show:

- safe next action
- action-required queue count
- active operations
- stale handoffs
- dirty repo count
- deploy impact
- newest proof
- hard gates

`/content` should be read-only first:

- homepage copy and proof cards
- project cards and project detail bodies
- writing titles, summaries, tags, status, and body preview
- newsletter block copy
- source path or record id
- last proof or last edited timestamp when available

## data architecture

Use one adapter boundary:

`source feed -> normalized admin model -> route view model -> UI`

Source categories:

- static admin feed from Infra
- runtime admin feed from Infra state
- public-site content collections from `apps/www/src/content`
- page content from D1-backed CMS records
- future state-worker feed for live fleet state

Adapters should emit safe read models that carry:

- `id`
- `title`
- `status`
- `risk_level`
- `next_safe_action`
- `authority_state`
- `required_approval_ids`
- `allowed_actions`
- `forbidden_actions`
- `proof_ids`
- `evidence_uri`
- `redaction`
- `source_ref`
- `updated_at`

Never include secret values, dirty filenames, file contents, private messages,
health payload rows, message ids, signed document bodies, or dollar amounts in
admin feed payloads unless a future authority explicitly permits that exact
field.

The runtime feed remains local-dev only in `apps/admin`. Production returns a
disabled metadata response until a reviewed collector and redaction contract are
approved.

## content editing model

Read-only content preview comes first.

Future editable content should be modeled as operations, not direct writes:

1. editor creates a proposed content operation
2. preview renders old value and proposed value
3. authority decides whether the operation is public-site safe or admin-gated
4. proof records source, reviewer, and expected live impact
5. approved operation writes to the chosen content store
6. post-write proof verifies rendered route or record state

Initial content surfaces:

- homepage heading, summary, mention copy, and proof cards
- selected project card fields
- project detail markdown body
- writing frontmatter and body
- newsletter block copy
- redirect and route labels only after separate review

Do not start with cross-posting or social publishing. Those are outbound send
paths and need stricter authority.

## permission split

Public site lane:

- agents may branch, edit, verify, push, and PR safe content and UI work
- agents may merge approved public-site PRs when checks pass
- deploy through path-filtered workflow is expected after approved merge
- live impact should be recorded in the PR or handoff

Admin read-only lane:

- agents may branch, edit, verify, push, PR, mark ready, merge after green
  checks, and deploy only the affected admin target
- route, feed, dashboard, schema display, content-review, and auth-staging UI
  work is in this lane when it stays read-only or proof-only
- authenticated proof should be captured when available, and unauthenticated
  boundary proof must be recorded after deploy
- route output must respect redaction rules

Admin control lane:

- write paths require exact current authority
- approval bridge execution requires exact current authority
- deploy buttons require exact current authority
- content-save APIs require exact current authority
- collector, DNS, Access removal, env, secret, root, launchd, endpoint,
  outbound, payment, filing, contract, and live-control changes require exact
  current authority and proof

Auth boundary note:

- Cloudflare Access remains the outer gate until passkey proof is complete.
- App-native passkey auth is implemented in the canonical Astro admin and uses
  D1-backed credentials, sessions, challenges, and audit events.
- The current unblocker is first passkey enrollment, then proof for register,
  login, logout, session persistence, revoked credential denial, and
  unauthenticated app-native blocking after Access removal.
- `pnpm --silent proof:admin-passkey` reports pre-removal blockers in
  `access_removal_blockers`; `cloudflare_access_still_active: true` is expected
  until the final Access removal step.
- Historical auth and Access planning packets live under `docs/archive/`.
- See `docs/admin-content-draft-operations.md` for the inert content draft
  operation schema that should precede any save or publish path.
- Current merge/deploy policy lives in `CLAUDE.md` and
  `docs/platform-architecture.md`.

## smallest first implementation slice

First slice completed: add a read-only `/content` route to the current admin
shell.

Scope:

- no framework rewrite
- no writes
- no D1 mutation
- scoped admin deploy is allowed when the diff stays in the standing read-only
  admin lane and checks are green
- no new secret or Access changes

Deliverables:

- route: `/content`
- adapter: public-site content read model
- sections for homepage, projects, writing, and newsletter
- each row shows source, current rendered value, editability candidate, risk, and
  next safe action
- docs link to `docs/content-admin-editor-brief.md`
- local build and typecheck

Why this slice:

- it moves admin toward the requested editing surface
- it stays read-only
- it exposes what should become editable before adding save behavior
- it helps separate content data from source-code deploy habit
- it can ship on the current app without waiting for Astro migration

Current next slice:

- complete passkey enrollment proof
- rerun `pnpm --silent proof:admin-passkey`
- remove Cloudflare Access only after proof passes
- archive or remove `apps/admin-solid`

Follow-up content slice:

- move proof records into D1-backed read models
- make content draft-operation saves and proof rows visible from D1
- keep publish, send, and live controls inert until audit proof exists

## verification expectations

For admin slices:

```bash
pnpm turbo typecheck --filter=@anipotts/admin...
pnpm turbo build --filter=@anipotts/admin...
```

For deploy proof after approved merge:

- PR merge commit
- Deploy run id
- target jobs run and skipped
- unauthenticated Cloudflare Access behavior
- authenticated route render when browser auth is available
