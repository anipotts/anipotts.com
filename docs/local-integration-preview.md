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
