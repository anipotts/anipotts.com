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

Complete responsive and keyboard acceptance for the release candidate,
repository checks, exact-head protected PR checks, target classification,
rollback capture, admin deployment and authenticated live interactions. No
merge, deployment or real content publication is established by this document.

## Connection boundaries

Workers Paid checkout was inspected: Free is current, $5 due today and
$5/month plus usage. Billing/legal activation awaits exact approval. R2 access
is a separate unresolved permission issue. No existing database is repurposed.

Operations has real read-only 1Password Connect health/container evidence;
sync activity remains unknown and production observation transport is pending.
Life has a nonactivating access proposal; hostname, canonical store and source
allowlist must be resolved before approving any new private network boundary.
