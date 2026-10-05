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

Follow the current global Working with Ani agreement and native session controls.
Current explicit task authority supersedes older dated project guidance. Routine
in-scope edits, checks, commits and agent-branch pushes are authorized. Keep
incomplete work in draft PRs; ready checkpoints run the relevant required checks.
Changed heads refresh affected checks and acceptance evidence.

Before merging or enabling auto-merge, re-read live default-branch protection.
Pull requests are required. Required checks must pass on the exact current head,
with strict checking where supported, no bypass, and force-push and deletion
blocked. Missing protection stops integration; chat approval does not replace it.
Changing branch protection requires its own approval. Follow native approval
controls and the target's current release gates.

### integration ownership

Codex and Claude Code are co-equal agents. Assign one active integration owner for
each shared lane and record the owner and current head in the task or handoff.
The owner reviews the exact head, resolves required review threads and integrates
one PR at a time after its required checks pass. Confirm that the owner is active;
if ownership changes, make the handoff explicit and preserve other agents' work.

Ordinary production releases are authorized after the required checks pass on the
exact release tree. Record the merge SHA, deploy run, affected and skipped targets
and route proof. Authentication, secrets, account/access changes, destructive
data or schema changes, and outbound sends retain their native approval boundary.
Cloudflare Access and the exact-owner assertion remain the admin sign-in boundary.
Additive migrations require inspection, the correct target and rollback, and the
existing release controls.

The admin house style has no divider lines: no `hasDividers`, `<hr>`, or
decorative block borders.

### admin lane

For admin UI, feed, content review, auth staging, and operator-dashboard work:

- use a same-repository pull request for deployable files
- integrate the exact head under the standing authority and protection gates above
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
- integrate the exact head under the standing authority and protection gates above
- deploy `www=true` only after release gates are enabled
- record deploy run, route proof, and exact release SHA

### docs lane

Docs-only changes use a PR and the same standing authority and protection gates.
They should not run app deploy targets.

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

Use the narrowest command that could expose a wrong result in the changed behavior.
Keep verification proportional to the change. Stop when the requested outcome is
demonstrated; expand or repeat checks only for new changes, failures or unresolved
concerns. Instruction and tooling changes need representative non-mutating tasks
and focused tests, not a browser matrix.

```bash
pnpm check:changed
pnpm turbo typecheck --filter=@anipotts/www...
pnpm turbo build --filter=@anipotts/www...
pnpm turbo typecheck --filter=@anipotts/admin...
pnpm turbo build --filter=@anipotts/admin...
pnpm validate
```

`pnpm check:changed` includes committed, staged, unstaged and untracked changes by
default; ignored files stay excluded. Use `pnpm check:changed --commits-only` only
when intentionally verifying a committed tree. That mode omits uncommitted work
and labels its result accordingly. The shared CI file collector retains its
committed-tree default. `--working-tree` remains an explicit local alias.

### website visual review

Review the changed behavior and its nearby effects: rendered layout, typography,
motion, accessibility and responsive states that the diff can affect. Use an
isolated task-owned preview for automation. When Ani is using or reviewing a
visible browser, keep his tab and viewport under his control; run automated
resizing and navigation in a separate test surface.

For urgent polish, fix the requested defect first and use a focused visual check.
Broaden the audit only when the task asks for it or evidence exposes a related
problem. An unrelated design preference does not expand the task. Report any
unexercised acceptance cases and keep saved, accepted, checked and deployed states
distinct.

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

`pnpm check:changed` selects affected checks from the branch and local changes.
`pnpm validate` remains the full-workspace path for shared or consequential changes.

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
