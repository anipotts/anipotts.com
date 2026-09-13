# Admin coverage and implementation ledger

Status: in progress. Inventory counts are not reviewed-code claims.

The machine-readable [file inventory](coverage.json) starts with 304 tracked or
untracked admin files and their source hashes. Every entry initially remains
pending. Record explicit evidence and an updated/retained/compatibility/removal
candidate disposition after review; refresh hashes after edits. Newly created
files must be added before completion.

## Current work

- Inventory projection: published/private metadata joining, shared catalog/search,
  fixed-page view, bounded storage reads. Implemented; seven focused tests and Astro check pass. Post-save refresh and browser proof remain pending.
- Website shell: responsive Astryx sidebar, tablet/mobile navigation, removal of
  duplicated global top navigation. Implemented; fifteen focused tests and Astro check pass. Library state integration and browser proof remain pending.
- Media lifecycle: prevent callbacks from unmounted upload/crop controls from
  changing the editor. Two mounted/unmounted completion tests pass. Browser cancellation QA pending.
- Existing editor, save, recovery and capitalization work: preserved, with prior
  local checks; new workspace integration requires renewed relevant verification.

## Integration receipt

`pnpm check:changed --working-tree` exited 0 during workspace integration on
2026-09-12. Full output: `/private/tmp/admin-workspace-integration-check.log`.
Editorial integration: 89 tests across 19 files passed. Library extraction and
its final edits may postdate that run and need their own final checks.

New-post recovery now uses account-scoped, origin-scoped recovery and stops
pending creation on logout. Eight focused interaction tests pass. Legacy
unscoped session data remains untouched and is not automatically adopted.

Mode audit found missing URL/history integration and late-response guards for
Preview/History. Review currently binds only source text and must also bind the
acknowledged revision, including an equal-source newer-revision regression test.
Deferred focus restoration needs RAF cancellation. Properties/History/publication
must move under one exclusive panel owner. Back should flush ordinary navigation
while preserving modifier clicks. These remain implementation work, not accepted
limitations.

## Shared integrations requiring separate review

- packages/content: editorial source schema, Markdown/inline formatting, visibility,
  public path/preview contracts. Retain public semantics.
- packages/brand: theme preference, font and approved identity assets.
- packages/lib and packages/types: operational contracts and authorization boundaries.
- scripts/ci and .github/workflows: route parity, source boundaries, release policy,
  exact-head checks, target classification and protected admin deployment.
- scripts/admin: managed preview ownership and final main checkout compatibility.
- Root package/lockfile and admin bundling: dependency scope, build/type/test outputs.

## Reconciliation baseline

Canonical checkout: codex/document-editor at
`d3f98ed139c09ceaf6afa7bc49a3d73420f9aab0` before workspace implementation.
Uncommitted changes and private `docs/writing-drafts/` remain intact.
Several registered /private/tmp worktrees are marked prunable because their gitdir
paths are absent. Four other external worktrees remain registered. Neither this
observation nor age establishes task ownership, merge status or deletion safety.
No cleanup has been performed.

## Browser baseline

The Node REPL tool is exposed again, but the previous runtime bindings are absent.
The Browser package still has its runtime and documentation; its previously listed
SKILL.md is missing. Supported setup recovery is being investigated. No new visual
QA claim is made from this discovery alone.

## Record workspace integration

Implemented URL-backed Edit/Preview/Review/Source and exclusive Properties,
History and Publication panels. The same writing DOM/controller survives mode
changes. Review captures acknowledged source and revision; publication rechecks
after session preparation. Preview/History ignore late results after navigation.
Four DOM interaction tests cover deep links, document identity, exclusive panels,
metadata changes not silently refreshing review, and cancellation before publish.
Seven helper tests and eight inspector layout/focus tests pass. Native Browser
visual, latency, caret/IME and live verification still required.

## Adopted live feedback

- Mobile header: one aligned row, native trailing Search/Menu controls, no clipped
  workspace subtitle. Workspace switcher widened and padded using Astryx tokens.
- Library filters: one compact row of section/status/sort menus plus count.
- Inventory decisions: Next step replaces repeated publication badges. Private
  drafts link to editing; unpublished edits/visibility changes link directly to
  exact record review. Visibility direction remains explicit. Current public
  content is quiet, mixed collection labels are muted, summaries use one line,
  and the default ordering prioritizes evidenced work. Status filtering remains.
- Focused decision/library/navigation suite: 28 tests passed. These are code/DOM
  receipts, not substitutes for required in-app Browser visual verification.

## Sidebar and inventory annotation follow-up (2026-09-12)

Implemented the latest annotated local refinements: typographic ani potts/admin and ani potts/operations identity; sidebar-width workspace switcher; uniform navigation rows; expanded-only inset and top-left radius without a divider; collapse control beside identity; grouped direct theme selection and monochrome approved Live site mark; desktop-centered palette and no mobile global search. Browser visual measurements remain pending.

Overview now offers recent private/local edits separately from the decision-ordered inventory. The visible default sort is Needs attention, with most recent updates and stable title/identity tie-breakers within each priority. Table timestamps use live relative-short formatting with an exact local-time/provenance hover card. Table title/action/date cells align at the top with consistent gutters. Five ContentLibrary tests pass, including recent-work provenance and deterministic ordering; shell six-test receipt is retained. Operations branding matches the typographic identity.

The shared CI route inventory now identifies /inbox as the Operations navigation destination and / as the preserved Website redirect. The route-parity check passes. Full current-tree checks are being rerun; no current release or new browser-QA claim is made here. Managed localhost:4311 preview remains running (PID 22426 at check time).

Verification receipt: full `pnpm check:changed --working-tree` passed after the sidebar/inventory and Inbox route corrections (`/private/tmp/admin-current-complete-check.log`). Subsequent shared record-summary mapping and newsletter field-label fixes passed 48 focused tests; root integration of save acknowledgment/projection/review passed 24 tests (`/private/tmp/admin-summary-integration-tests.log`). Final Astro check covered 203 files with zero errors/warnings and three existing hints (`/private/tmp/admin-summary-types.log`). These later fixes have not received a second full release build. Source audits are recorded in operations-audit.md and inventory-audit.md; only matching file hashes were adopted into the coverage ledger. No source audit substitutes for remaining browser/live QA.
