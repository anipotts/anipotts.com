# Release scope audit

2026-09-12. Read-only release inspection; no fetch, builds, installs, provider reads, merge, deployment or policy edits. This receipt uses cached refs and is not current provider or live release proof.

## Snapshot

- Branch: `codex/document-editor`.
- HEAD: `af84e79b4861f1c3a25f461b549856be22bddbbf`.
- Cached `origin/main`: `d3f98ed139c09ceaf6afa7bc49a3d73420f9aab0`.
- Cached ancestry: 0 commits behind, 30 ahead; merge-base diff contains 212 files (169 Admin, 31 docs, 7 scripts, 5 root/patch files).
- Reviewed both the full committed diff scope and current uncommitted follow-ups. Current follow-ups stay under Admin/docs, including new snapshot helpers and favicon. Private untracked `docs/writing-drafts/` must remain outside the PR. Release-ignored is not equivalent to safe to push: docs can still expose private content.

## Exact category findings

| Files/category                                                                                                                                        | Finding and consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`, `.prettierignore`                                                                                                                       | Existing classifier does not recognize these root paths. Their changes only ignore the local pnpm cache and generated workspace themes, but classification currently returns unknown. Explicit reviewed classification or separation is required; do not ignore the classifier exit code.                                                                                                                                                                                                                                                                                                   |
| `patches/@astryxdesign__core@0.4.6.patch`                                                                                                             | Also unclassified. It modifies Tooltip, HoverCard, menu-hover and submenu source plus distributed JS, including immediate hover behavior. It is an executable dependency patch, not docs. Any classification should be tightly scoped and retain dependency/check impact. Never broadly bless arbitrary patch paths.                                                                                                                                                                                                                                                                        |
| `package.json`, `pnpm-lock.yaml`                                                                                                                      | Root adds patchedDependencies for Astryx 0.4.6; lock records the patch and jsdom-related dependency/peer snapshot changes, including Vitest peer keys in other importers. Root manifests set ci_policy_changed but deliberately do not select all deployment targets. `check:changed` nevertheless escalates to full validate, and Turbo affected CI can cover more packages. Passing an Admin build alone does not close this root dependency gate.                                                                                                                                        |
| `apps/admin/package.json`                                                                                                                             | Adds jsdom dev dependency and exact generated theme checks for Operations/Life. Only Admin directly declares Astryx core among repository app/package manifests. Root patch affects its resolved installation; frozen lockfile/patch integrity still needs exact-head install/build evidence.                                                                                                                                                                                                                                                                                               |
| `apps/admin/src/pages/api/admin/observability.ts`, `apps/admin/src/pages/life/[section].astro`, `apps/admin/src/pages/operations/observability.astro` | Added routes are classified approval. Preserve this classification and the explicit route/access tests; do not weaken to automatic solely to unblock release.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/admin/src/lib/access-identity.ts`, `admin-access-policy.ts`, `pages/auth.astro`, knowledge/preview routes                                       | Scope includes identity compatibility, preview exceptions and private-source boundaries, not merely cosmetic CSS. Preserve focused auth/private boundary evidence alongside visual QA. No migration, Wrangler, auth credential or collector configuration file is in the committed diff.                                                                                                                                                                                                                                                                                                    |
| `scripts/admin/export-observability-activity.py`, `scripts/admin/test_export_observability_activity.py`                                               | New helper is a bounded read-only SQLite metadata export: explicit six-column SELECT, mode=ro, query_only, bounded cursor/limit and value checks. It is not an HTTP endpoint or deployed integration. It accepts a database path only when invoked. Fixture tests cover metadata-only output, unchanged database bytes, bounds and rejected states. These tests are not referenced by package scripts/CI; Prettier glob excludes Python. Run fixture unittest explicitly and decide long-term CI coverage. Do not invoke exporter against real personal databases merely for release proof. |
| `scripts/codex-action` and its new test                                                                                                               | Separates setup preflight from explicit bootstrap/install, validates dependencies for active commands. Local-dev classification applies; scripts also broaden local checks. Does not select workers.                                                                                                                                                                                                                                                                                                                                                                                        |
| `scripts/ci/admin-route-inventory.mjs`, `admin-route-parity.test.mjs`, `workspace-inventory.test.mjs`                                                 | CI policy changes; route inventory must keep exact Life/Operations boundaries. Native CI policy suites required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/www`, `content/public`, `packages/*`, `workers/*`, D1 migrations                                                                                | No committed changed source files in these categories. Event-based target selection is Admin only, all five other targets false, no D1 change/preflight. This does not settle the live cumulative deployment planner described below.                                                                                                                                                                                                                                                                                                                                                       |

## Blocking classification and deploy distinction

Running the pure current `classifyRelease` against all committed name-status entries returns **risk unknown**, `ci_policy_changed=true`, `local_dev_changed=true`, `admin=true`; www, ingest, newsletter, state and weekly_email are false. Reasons are exactly the three unclassified paths above plus the three added-route approval reasons. Schema remains 0043 with no migration consumers.

`deployment-plan.mjs` also reads public health's release_sha. Missing/invalid SHA, unavailable Git history for that SHA, or cumulative public-source differences can set www=true even for this Admin-only event. The push workflow then deploys www when that output is true and production gates are enabled. Current checked-in gates enable production/editorial Admin; provider environment gates were not read. **Do not merge until live-health cumulative classification proves no unrelated target will run, or a separately reviewed release-policy solution exists.** A later manual admin-only dispatch cannot undo an already-triggered broad push deployment.

Manual dispatch accepts explicit target booleans and exact main source SHA, and requires actor anipotts. It still runs the planner, but deploy job target conditions use explicit dispatch inputs. No dispatch is authorized by this audit. The existing Admin job uses always() plus gate/target outputs; retain exact current release/CI outcome checks rather than treating partially emitted classifier outputs as success.

## Commands for integration owner, when release gates and disk permit

The following are pending commands, not results. Refresh provider refs/protections through the normal exact-head release process before relying on cached ancestry. Read standing detailed release gates before merge/deployment.

```bash
# After final intended files are committed; exclude private drafts.
git diff --name-status origin/main...HEAD > /private/tmp/admin-release-changes.tsv
node scripts/ci/release-policy.mjs /private/tmp/admin-release-changes.tsv "$(git rev-parse HEAD)"
node scripts/ci/compute-deploy-targets.mjs /private/tmp/admin-release-changes.tsv

# Read public release metadata, not private content; inspect cumulative target plan.
curl -fsS https://anipotts.com/api/health -o /private/tmp/admin-release-www-health.json
node scripts/ci/deployment-plan.mjs /private/tmp/admin-release-changes.tsv /private/tmp/admin-release-www-health.json "$(git rev-parse HEAD)"

# Fixture-only Python coverage, no live export and no bytecode caches.
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/admin -p test_export_observability_activity.py

# Existing policy/route tests plus dependency-patch interaction regression.
pnpm test:release-policy
pnpm test:deploy-targets
node scripts/ci/deployment-plan.test.mjs
pnpm test:admin-routes
pnpm --filter @anipotts/admin exec vitest run src/lib/hover-timing.test.ts

# Required whole-branch validation once resource constraint is resolved.
pnpm check:changed
```

Then require exact current PR-head checks and fresh native provider protections, inspect post-merge deploy run target/skipped jobs, verify exact release SHA and critical authenticated live interactions. No build, HTTP status or classifier result substitutes for live visual/editing proof.

## Audited policy identities

| File                                                  | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/ci/release-policy.mjs`                       | `04ee737e300a3d76ea63424ae015b35573a2f55f8ccc4af9a8db1d943663b7a0` |
| `scripts/ci/deployment-plan.mjs`                      | `ad31e5c36795b2868701cf3a0d3605d20e608f0846eaa0fcae9b38bb7e71b269` |
| `.github/workflows/deploy.yml`                        | `101385d09fdc493647b6bff5fe6df7b3125b80be7240b475065f296f35c32a42` |
| `package.json`                                        | `f181e339a562c8a6c7922c01c446adb51f4ce5ca63e7868638b5b93b0b8e1c4c` |
| `pnpm-lock.yaml`                                      | `9206a7cc9786d40a3a5ab2e8fadcbcf6ed977f50d64b6e3d17aa9bdd3014f976` |
| `patches/@astryxdesign__core@0.4.6.patch`             | `373d44ef0583fda03fdc39226bf81ad65a9b5cb740eb59e8fbaae8f04566fcca` |
| `scripts/admin/export-observability-activity.py`      | `2f8ae2083b79593b6a655a7a1fcb768be1454039daddb4007a0777045052fec2` |
| `scripts/admin/test_export_observability_activity.py` | `53e99b6631e7c7ca6acccabe955240c5974aeb5a88931bcd7e2a0c75b1ebaf41` |

## Authorized classifier correction

After the read-only findings, integration authorized a narrow policy fix. `.gitignore` and `.prettierignore` now classify as tooling/CI changes with no deploy target. Only `patches/@astryxdesign__core@0.4.6.patch` is recognized as an Admin dependency change with CI policy checks. Other patch names/versions remain unknown. A regression enumerates tracked app/package/worker manifests and requires Admin to remain the sole direct Astryx core consumer; a future consumer must update this explicit mapping. Public cumulative drift planning and route/protected-surface approval behavior remain unchanged. Once included, the release-policy source itself remains a protected approval path.

Release-policy, compute-deploy-targets (including changed-file cases), and deployment-plan suites pass after formatting. The fixture-only Python unittest passes all 3 cases with bytecode disabled. No live database export was run. The workflow currently declares ubuntu-latest but no explicit Python setup/version contract; Python coverage remains an explicit manual release gate, pending an intentional runtime/CI declaration. No package manifest or workflow was altered in this correction.
