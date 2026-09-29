# Dependency maintenance

The website task is the single owner. Dependabot opens grouped updates; GitHub's
protected PR checks remain the merge gate. No mutation workflow or paid review API
is involved.

Run `pnpm maintenance:dependencies` for a read-only JSON inspection and concise
stderr summary. Pass `--previous <fingerprint>` to identify unchanged observations.
GitHub remains authoritative; the fingerprint is an observation, not permission to
merge. The command checks bot identity, source repository, head/base, draft state,
file inventory, unresolved review conversations, required check provenance, merge
eligibility and recent deployment runs. Pagination is a stop, not silent omission.
Inspect live rulesets and actual diffs before mutations; the command does not claim
that branch protection alone proves a PR requirement.

Dependency maintenance belongs to the existing website task and its single
continuation/maintenance channel. Inspect first, then repair at most one candidate
at a time in a reviewable PR. Unchanged blocked results receive no repeated build
or comment. Store concise evidence and retry conditions in the existing task
summary, not another PR registry. An upstream or base change may justify a retry;
elapsed time alone does not justify repeating a known incompatibility.

Every dependency PR requires Ani's explicit review before merging. Do not enable
auto-merge or create a separate dependency-merge automation. An
`inspect_auto_merge` result takes priority over pending or failing checks because
an existing auto-merge request could execute as soon as they pass. Resolve that
condition through the applicable controls; the inspector itself remains read-only.
After owner approval, refresh exact-head checks and use the native protected merge
path. Preserve the reviewed branch and evidence until integration is verified.

Execution is local to the Codex desktop host. It is not an always-on cloud worker:
host sleep, app shutdown, authentication expiry, or a busy task can delay work.
The heartbeat still wakes the task to perform cheap inspection; it cannot promise
zero model usage for that wake. A successful tool registration is not proof of an
unattended run. Scheduler execution after the interactive task ends remains to be
observed and recorded before calling maintenance operational.

Draft diff checks use no dependency installation or cache. The required full
validation context fails explicitly on drafts, since GitHub treats skipped jobs as
successful. Marking ready triggers the full suite. Preserve explicit product/auth
holds; review draft history before changing readiness.

Local verification aligned with the CI policy step: `pnpm test:workflows`.
After candidate merge, inspect target classification, affected deployment jobs,
live release SHA and rollback evidence before cleaning its owned worktree. An
Actions success or closed PR alone is not deployment proof.
