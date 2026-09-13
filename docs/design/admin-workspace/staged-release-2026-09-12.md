# Staged admin release

## Scope

The first increment carries the approved Content, Operations and Life shell,
workspace search, private editor foundation, favicon and shared interaction
refinements. Life details use the shared Astryx metadata layout. The candidate
is isolated on `codex/admin-ui-staged-release` from the unfinished direct
publication and local-to-production transfer changes in the integration tree.

Direct publishing, publication storage and the public runtime follow in a
separate www + admin release. Operations live observations and Life private
reads ship independently when their real-data acceptance passes.

## Verification

- Frozen dependency install passed.
- Admin dependency-ordered build and type checks passed.
- Admin tests: 520 component/library tests and 89 editorial worker tests passed.
- Initial isolated classification: admin only; no D1 migration. All other targets
  are false. Repeat against the immutable PR head before deployment.
- In-app Browser at the actual 792 x 783 viewport: workspace menu contained,
  expanded panel starts at 12px, collapsed panel starts at 0 beside a 52px rail,
  no horizontal overflow, light/dark shell reviewed.
- Command palette: 600 x 520 centered surface; input height remains 20px with
  empty and no-match queries; Escape restores Search focus.
- Browser checks use the managed integration preview. Its shared UI matches
  this candidate, but its unfinished publication runtime is not release proof.
- Life owner supplied desktop/mobile light/dark and metadata-layout checks;
  ready-data states are synthetic tests, not live private-record acceptance.

## Remaining release gates

PR #339 head `f263d722780036a9f369ef6c4be9c0fae6b2a83f` passed required
build/lint/typecheck/tests, Security Review and CodeQL. Three initial review
findings are fixed and resolved. Follow-up review covers route-specific
Operations filters, duplicate Machines navigation and the sidebar styling
contract. Subsequent commits require fresh exact-head checks.

Complete responsive and keyboard acceptance for the release candidate,
repository checks, exact-head protected PR checks, target classification,
rollback capture, admin deployment and authenticated live interactions. No
merge, deployment or real content publication is established by this document.

## Sidebar implementation review

The approved 52px rail and 125ms parent width animation need a narrow library
override: installed Astryx AppShell exposes no sidebar-width prop, while SideNav
hardcodes its own width. Popover supplies minimum anchor width rather than exact
trigger width; ToggleButtonGroup lacks joined-segment spacing props; Button
does not expose tooltip direction. Keep these scoped overrides until equivalent
component APIs are available. Header alignment uses Astryx HStack props.
Superseded geometry rules were removed and remaining icon/menu dimensions use
equivalent theme spacing expressions. Nine shell tests pass. The restored in-app Browser now supports verified viewport
overrides; final candidate acceptance remains in progress.

## Connection boundaries

Workers Paid activation was confirmed in the provider checkout confirmation on
2026-09-13 at $5/month plus usage. Do not retry the purchase. The dedicated
`anipotts-content` database was created and independently read back with zero
tables. No migration, binding or publication activation has occurred. R2 bucket
listing still returns HTTP 403 / error 10000 with the existing credential; its
access must be resolved separately. No existing database was repurposed.

Operations has real read-only 1Password Connect health/container evidence;
sync activity remains unknown and production observation transport is pending.
Life has a nonactivating access proposal; hostname, canonical store and source
allowlist must be resolved before approving any new private network boundary.

## September 13 follow-up

- Commit `636f1f5b` fixes longest-item workspace menu sizing, library filter
  isolation, save-before-leave recovery, and unsupported newsletter preview.
- 27 focused component tests and admin type checks passed.
- Managed preview Browser checks: 390x844 mobile menu shows every workspace
  without truncation; drawer and dark appearance reviewed. At 834x1112 the
  palette remains 600x520 and its input remains 20px before/after Clear appears.
  At 1440x900 the expanded inset begins at 12px beside the 200px sidebar.
- These visual checks cover the integration preview, not an immutable deployment.
  Native logout revocation, remaining acceptance, and exact-head CI remain open.

## Final review fixes in progress

The dedicated logout route reads presented native sessions without refreshing or
migrating them, checks Origin and a cookie-bound CSRF capability, and atomically
revokes only those sessions with audit entries. The inert confirmation page
requires an explicit click. Recovery clears only after success; unavailable
Access verification or native storage fails closed. Tests exercise real migrated
SQLite, concurrent retries and transactional rollback. No real sessions were
revoked during QA.

The Astryx patch defers only focus-triggered tooltip opening to the next task,
avoiding native popover reentry. Hover timing remains immediate. Browser Escape
checks now restore focus in both sidebar states without new console errors;
blur dismisses the tooltip. The managed preview needed its normal config watcher
to refresh stale Vite dependencies.

The recoverable QA draft passed edit, immediate navigation, reopen, preview and
review. Its original body was restored, and no publication action ran. Full
repository validation passed, including 593 admin component/library tests and
89 editorial worker tests. A subsequent Access-verification failure-path fix
requires its affected tests and fresh exact-head CI before promotion.
