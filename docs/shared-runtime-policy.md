# shared agent runtime policy

Established by Ani on October 4, 2026. Applies to Codex, Claude Code and their
workers in every worktree of this repository. This is an agent instruction
contract; it does not impose an OS resource limit or alter global tool settings.

## parallel work and runtime budget

Keep independent coding and investigation parallel, with explicit file ownership.
Worktrees provide isolation; an idle checkout does not need a running server.

On this host, the default budget across all repo agents is:

- two persistent integration previews: www and the managed admin on 4311;
- one additional temporary preview for a worker's necessary isolated review;
- one heavy build, full validation or browser test job at a time.

The integration owner schedules these slots. Focused lightweight checks may run
alongside editing. Count nested workers inside a heavy command as part of that
job, and avoid unbounded runner concurrency. Ani or the owner may temporarily
expand a slot for a concrete acceptance need; record the owner, purpose and
cleanup point. Do not expand by default for each new chat.

Workers first use source inspection and proportional checks. Request the temporary
slot only when isolated behavior cannot be reviewed in the integrated candidate.
Start only the affected surface, never `dev:all` by habit. Record checkout, port,
PID ownership and review purpose. Stop task-owned temporary servers through their
manager after the review or handoff. Preserve the worktree, changes and local data.
Never kill processes by name, stop another task's server or stop canonical review
services when a worker finishes. Unclear ownership goes to the integration owner.

## tools and browser sessions

Use the smallest supported tool set for the task. Website workers do not launch
imessage, xcodebuild or AppleScript MCP servers unless the task needs them. Use
one browser automation backend and reuse its session for related checks. Avoid
opening an editor, browser profile or inspector for every coding worker.

Where native per-project or per-session configuration supports it, disable unused
servers before launching workers. Do not invent unsupported config keys, edit
credential-bearing configuration or change global settings silently. Harnesses
may eagerly launch configured MCP servers: instructions alone cannot prevent
that. Report this gap and use supported settings, rather than claiming it fixed.

Close task-owned browser sessions and dispose of task-owned temporary processes
after acceptance. Do not close Ani's browsing sessions or the canonical preview.

## integration owner and persistent review

Use the owner chat and checkout recorded in [local-integration-preview.md](local-integration-preview.md).
Only that owner changes the shared candidate and starts or restarts its services.
Run `pnpm review` there to maintain the existing www/admin previews and one
publication watcher/supervisor. Keep this review lane running across task endings.
Use `pnpm review:status` to inspect revision, checkout, URLs and freshness.
The shared `.claude/launch.json` reuses this checkout and runs `pnpm review`;
it never fetches, switches, resets or installs dependencies on startup. Its public
URL reflects the current owner port; update that entry if the owner port changes.

The candidate branch retains GitHub main ancestry and combines incoming exact
worker commits locally before production approval. A preview of main means main
plus the queued candidate, not unapproved writes to GitHub main. Do not reset the
candidate to origin/main on startup, rewrite its history or reuse its checkout
for unrelated tasks. Preserve work before resolving integration conflicts.

Workers hand off their branch/PR, exact head, affected paths, checks and remaining
acceptance work. The owner integrates serially, resolves conflicts, refreshes
checks and updates the existing integration queue. Worker previews are temporary;
Ani reviews the combined result at the canonical URLs. Check preview identity and
content freshness so an old server is not mistaken for the new candidate.

## one approval for merge and production deploy

Before requesting approval, the owner presents the committed, clean candidate
revision, included PR heads, affected production targets and verification evidence
at the canonical preview. Commit before requesting approval; dirty changes do not
have an approvable revision. Keep candidate membership fixed during review.

Ani's approval to merge and deploy that identified candidate supplies both code
review and production-release authority. Record `code` and `production` approvals
in the existing queue using the same human approval reference and the appropriate
exact revisions. The distinct evidence fields do not require two user prompts.
Software approval does not authorize CMS content publication or other hard stops.

Only included PR heads are authorized. Candidate edits, changed PR heads or changed
release contents invalidate affected approval and require refreshed checks and
review. A Git merge SHA may differ from the candidate SHA; verify the approved
content against the resulting release tree and record the mapping. Refresh required
checks after updating a PR to current main. Do not transfer approvals across heads
merely because the branch name stayed the same.

After approval, re-read live default-branch protection immediately before each
serial merge. Required PRs, exact-head passing checks, strict checking where
supported, no bypass, and blocked force-push/deletion remain mandatory. Resolve
review threads and comply with scoped release gates. Run required checks on the
exact release tree and proceed with the listed ordinary deploys without a second
approval prompt. Report actual merged/deployed state and live route proof.

If gates fail, fix within approved scope and reassess changed content; do not bypass
them. Auth, secrets, production data changes and other reserved actions keep their
own controls. Local integration and a green preview never constitute production
approval or deployment.

## adopting the policy

The shared root `AGENTS.md` points to `CLAUDE.md`. New chats read this contract.
Existing chats must reload it at their next work boundary. The integration owner
includes the policy in worker assignments, checks existing preview ownership and
coordinates cleanup after ongoing reviews finish. Bring stale worktrees forward
through normal integration; do not mass-edit or reset concurrent worktrees.

Use the canonical physical project path when opening the project if the harness
rejects a symlinked sandbox root. Never weaken sandbox controls to work around it.
