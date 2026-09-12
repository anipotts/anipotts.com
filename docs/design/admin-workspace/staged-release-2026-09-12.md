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
equivalent theme spacing expressions. Nine shell tests pass; visual parity is
still pending because the in-app Browser control runtime is unavailable.

## Connection boundaries

Workers Paid checkout was inspected while the account was on Free: $5 due
today and $5/month plus usage. Ani authorized using Mercury instead of the
saved personal card. Secure Mercury card entry and final provider confirmation
remain unverified; no charge or plan activation is established. Recheck the
checkout before submitting. R2 access is a separate unresolved permission
issue. No existing database is repurposed.

Operations has real read-only 1Password Connect health/container evidence;
sync activity remains unknown and production observation transport is pending.
Life has a nonactivating access proposal; hostname, canonical store and source
allowlist must be resolved before approving any new private network boundary.
