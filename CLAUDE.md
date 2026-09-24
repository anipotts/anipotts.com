# anipotts-com agent guide

`AGENTS.md` is a symlink to this file. Codex and Claude use the same project
contract.

## ownership

This repo owns:

- `anipotts.com`: public Astro site in `apps/www`
- `admin.anipotts.com`: target Astro admin app in `apps/admin`
- archived labs reference material in `docs/archive/labs` and retained
  `workers/*`
- shared code in `packages/*`

Agents should move this repo forward. Do the work, verify it, commit it, push
it, open or update the PR, merge when the lane allows it, and deploy only the
approved target.

## automation posture

Do not add or restore GitHub workflows that call Anthropic, Claude Code, or
other external LLM review APIs for this repo. Ani disabled those on 2026-06-27
to avoid unnecessary Claude API spend. `security-review.yml` is local static
checking only: sensitive path detection, literal-secret scans, banned external
LLM review hooks, and destructive migration guards. It must not call Claude,
Anthropic, or any paid model API. Real safety comes from small scoped diffs,
local checks, CodeRabbit/GitHub signals, focused human review when needed, and
deploy proof.

Primary workflows are intentionally limited to:

- `ci.yml`
- `security-review.yml`
- `deploy.yml`
- `smoke.yml`

Do not add separate Dependabot automerge, external review, production
promotion, or broad deploy workflows. Dependency updates should pass through
the same PR checks and scoped deploy logic as other changes.
`apps/labs` is archived and is not a deploy target.

## current standing authority

Ani's September 13, 2026 Quiet Precision implementation approval supersedes the
older automatic merge and docs bypass lanes. Every PR waits for Ani's explicit
review before merging, including documentation and dependency changes. Keep
incomplete work in draft PRs; ready checkpoints run the full relevant required
checks. Changed heads require refreshed checks and affected acceptance evidence.
Do not enable auto-merge. Same-repository PRs, exact-head provider protection and
scoped release gates still apply after Ani's review.

### integration owner delegation, September 14, 2026

Ani designated Claude Code as the single integration owner for the admin,
public-site and docs lanes while Codex usage is paused, until Ani reassigns the
lane. The Codex Quiet Precision heartbeats are paused so there is one owner. For
this period Ani delegated PR review and serial merge to the integration owner:
review the exact head, run the full relevant gates, merge one PR at a time after
required checks pass and review threads are resolved, and accept the automatic
production deploy. Record the review, merge SHA, deploy run, targets that ran,
skipped targets and route proof for each merge. Auto-merge stays disabled.

Scoped approvals that sit inside the hard stops below, granted for this round:

- a local owner session for admin that works only with an explicit local flag on
  loopback hostnames, refused by the deploy workflow and absent from
  deployable bundles; production Cloudflare Access is unchanged
- hardening the public newsletter, webhook, subscribe and ingest endpoints and the
  admin compatibility routes for confirmed security findings
- runtime binding contracts for www, admin and the four retained workers,
  including the worker redeploys they cause
- deleting dead code confirmed by the knip audit
- pruning missing worktree registrations and removing merged or preserved
  worktrees after additive preservation refs are verified
- preserving unshipped Codex working-tree changes to a pushed branch, excluding
  private writing drafts

Still requiring Ani's exact approval: changing the authentication mode, removing
Cloudflare Access or the exact-owner check, newsletter worker send changes,
production content database bindings or remote migrations, backup key custody or
provider setup, secrets and `.env*`, and force-push or history rewrite.

The admin house style has no divider lines: no `hasDividers`, `<hr>`, or
decorative block borders.

### admin lane

For admin UI, feed, content review, auth staging, and operator-dashboard work:

- use a same-repository pull request for deployable files
- merge the exact head only after Ani's review and every required check passes
- deploy only the affected admin target after release gates are enabled
- record deploy run, skipped targets, route proof, and exact release SHA

The legacy Solid admin is retired from this repository. Rollback uses the
previous verified Astro admin deployment. Production legacy resources and
data are not deleted as part of source cleanup.

Reviewed additive D1 migrations remain subject to release controls. Cloudflare
Access with the exact-owner check is the only sign-in. Authentication changes
require their separate exact approval.

### public-site lane

For `apps/www` copy, layout, static content, accessibility, route, and
presentation work:

- use a same-repository pull request for deployable files
- merge the exact head only after Ani's review and every required check passes
- deploy `www=true` only after release gates are enabled
- record deploy run, route proof, and exact release SHA

### docs lane

Docs-only changes use a PR and wait for Ani's review. They should not run app
deploy targets.

## retired passkey sequence

Admin once planned app-native passkeys behind Cloudflare Access. That code was
removed on 2026-09-22 and is recoverable from the
`archive/admin-retired-auth-2026-09-22` tag. Access plus the exact-owner check
is the only sign-in; do not remove Access.

## hard stops

These still need exact current authority for the exact action:

- force-push, history rewrite, hook bypass, or destructive cleanup
- printing secrets or private payloads
- editing `.env*`, secret values, account credentials, payment, filing, or
  legal/contract surfaces
- source or personal deletes
- health-data mutation or `/Users/ojas` mutation
- legacy admin, worker, newsletter-send, ingest, approval-bridge, outbound
  message, publish-write, live-control, root, launchd, endpoint, or production
  collector changes outside an approved lane

If work mixes a safe lane and a hard stop, split it. Ship the safe lane and
leave the hard stop explicit.

## verification

Use the narrowest command that covers the diff.

```bash
pnpm check:changed
pnpm turbo typecheck --filter=@anipotts/www...
pnpm turbo build --filter=@anipotts/www...
pnpm turbo typecheck --filter=@anipotts/admin...
pnpm turbo build --filter=@anipotts/admin...
pnpm validate
```

## local development

Use Node `24.19.0` and start only the surface under review:

```bash
pnpm dev:www
pnpm dev:admin
pnpm dev:all
pnpm dev:status
pnpm dev:stop
```

Dev servers bind `127.0.0.1` on a stable per-worktree port pair from 4400 to
4999; `pnpm dev:status` prints the URLs. `dev:www` does not start Admin or its
fallback.
See `docs/local-development.md`.

The canonical local review URL is `http://localhost:4311/`.

Start or reuse the durable preview with:

```bash
pnpm admin:preview:ensure
```

Check it with `pnpm admin:preview:status`. Stop it only when Ani explicitly
ends the feedback loop, using `pnpm admin:preview:stop`. Do not start an ad hoc
Astro process on a different port for admin review, and do not stop the managed
preview merely because an individual Codex task is ending.

The manager records only local process metadata and logs under ignored
`.local/admin-preview/`. It refuses to stop an unrecognized process or replace
an unrelated listener on port 4311.

`pnpm check:changed` mirrors the affected PR scope. `pnpm validate` remains the
full-workspace path for shared or consequential changes.

For deploys, record:

- PR number and merge SHA
- deploy workflow run URL
- which deploy target ran
- skipped target proof
- route proof
- live impact

## product direction

Follow the approved [Quiet Precision delivery contract](docs/design/admin-workspace/quiet-precision-delivery.md).
Content is the only editorial workspace, and production admin is the normal
authoring environment. Support articles and projects, existing page copy, shared
navigation/footer text, SEO and media. Layouts and executable behavior stay in code.

Public content defaults, normalizers, validators, settings, and homepage summary
helpers live in `@anipotts/content/public`. Canonical frontmatter schemas are
shared by Astro and generation. www serves only published records from `anipotts-content`
(`CONTENT_RUNTIME="cms"`), and Admin publishes and unpublishes directly. Git
content is the seed and the source for build-time social cards, not a
runtime reader. The Git renderer and the legacy GitHub publisher were removed
on 2026-09-22. Recovery is D1 Time Travel plus the nightly
`anipotts-content` export on ap-mini, which System owns.

Observability provides read-only service, job and host status, activity and
alerts from System's ops reader on ap-mini (scope `ops:read`). Data provides
authorized read-only records and sources from the Personal Context reader, with
provenance and session-bound presentation. Neither workspace publishes content
or persists a new cloud replica of personal records.

See `docs/platform-architecture.md` for the current inventory and cleanup map.

## style

Public copy should sound like Ani: direct, specific, terse, and grounded in real
work. Avoid generic startup copy, guru tone, unsupported hype, rhetorical
questions, fake vulnerability, and exactly-three-item cadence.

Public copy states the claim directly. Avoid litotes, negative definitions,
reversal frames, and staccato negation. Exact quotations, safety instructions,
and literal technical constraints keep their necessary wording and context.
`pnpm test:public-copy` enforces the evergreen public surfaces.

No em dashes in human-facing copy. Never use `git add .` or `git add -A`.

## admin interface

- Use `@phosphor-icons/react` as the only generic icon source in `apps/admin`.
  Default to regular weight and use icons only when they improve recognition.
- Provider identity uses localized approved source marks or explicit text
  labels. Generic icons do not stand in for provider brands or encode state.
- Every icon-only control needs a tooltip, an accessible label, visible focus,
  and a target of at least 36px on desktop or 44px on mobile.
- Do not use emoji, hand-drawn provider marks, or scattered inline SVGs in the
  admin interface.
