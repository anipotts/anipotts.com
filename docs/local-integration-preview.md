# Canonical local integration preview

Ani established this review lane on October 4, 2026. All website changes from
Codex, Claude, PRs and isolated worktrees integrate here before Ani approves
production integration. GitHub `main` remains the deployed branch.

- Integration owner: website chat `01a0837d-8547-7e33-a34d-2c7ba78b8036`.
- Branch: `codex/combined-local-review`.
- Checkout: `/Users/anipotts/.codex/worktrees/combined-public-review/anipotts-com`.
- Admin: `http://localhost:4311/` through the managed preview.
- Public URL: use `pnpm dev:status` in this checkout.

Workers retain isolated branches and give the integration owner exact commits,
changed paths and verification. Only the integration owner updates this preview.
Review acceptance is revision-specific. Keep PR identities and origin/main
ancestry; do not rewrite production history or treat a local merge as deployment.
Do not independently replace preview processes or promote a candidate. After
Ani reviews the combined candidate, refresh required checks and native release
protection before serial production integration.

Initial candidate includes production `1ca0eb0e7`, PRs #483, #486 and #487,
and public card spacing/BI changes. #487 remains a draft upstream. Its red
release check requires ready status, rather than demonstrating a source failure.
Production CMS records are separate from the local seed database; this preview
does not publish private drafts or change live content.

## Production publication mirror

Run `pnpm review` in this checkout. It ensures both previews and one owned
publication watcher. Repeating it reuses healthy processes and restores a stopped
watcher. Its supervisor checks ownership every five seconds and automatically
restarts a stopped watcher. `pnpm review:status` prints the exact branch, revision, dirty state, URLs
and freshness blockers. `pnpm review:doctor` additionally verifies read-only
production authorization without displaying credential values. Use
`pnpm review:doctor --offline` to skip that provider check.

Preview identity and sync freshness are available through `pnpm review:status`.
The identity endpoint is development-only. The on-page dropdown was removed
at Ani's request.

`pnpm review:queue` shows the maintained integration queue. See
[integration-queue.md](integration-queue.md) for exact-revision transitions. Code
approval happens here, article/page publication happens in production Content,
and deployment approval applies to a checked code revision. None implies either
of the others.

Reusable synthetic editorial records live in `apps/admin/test/support/`.

The watcher polls the public inventory version every five seconds, then reads
one coherent snapshot of active production publications using existing
Cloudflare authorization. It refreshes local published tables in both apps.
It never writes remotely or imports production private drafts. Local drafts,
publish jobs and receipts remain intact. Reload a local page after sync; an
open editor retains its current private editing state. The mirror is for
production-content layout review; stop it for independent local publication
experiments. It is a development script, not part of deployable app bundles.

Backups and sync status live under ignored `.local/published-preview/`.
The watcher keeps the last snapshot if production cannot be read and logs a
failure rather than silently replacing content with Git seeds.
