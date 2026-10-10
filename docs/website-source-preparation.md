# Website source preparation

October 10, 2026. Source preparation is approved; production approval and
deployment are held separately. No changes from this preparation have merged
to main or deployed. Published wording and production CMS data are unchanged.

## Reviewed candidate

Base main: `f9992c59e0b3f8748e4ff44e3fab3e4f7447c455`.

Branch: `codex/website-source-preparation-2026-10-10`.

Full validation ran on `dba69a8df9969fa632076c4472346246875bbac5`.
Subsequent merges of the four scoped repair heads produced
`ae0345127d486083fcd485e3b55bcb547cf8f7a3` with the **identical Git tree**:
`8ec2212e3ee53c1baccf2d6b63014a140676f312`.
The final documentation update does not change executable source.

GitHub CodeQL subsequently flagged case sensitivity in the test helper that
extracts the local `Nav.astro` script. The extraction now matches tags without
case sensitivity; all five pointer/navigation tests and formatting checks pass.
This test-only correction is also pushed to #522. Production code is unchanged
from the full validation tree; refreshed CodeQL checks remain necessary.

This candidate integrates the approved chains:

- #517 → #520 → #510, and #520 → #512 → #516.
- #514 → #513, with #509's Node 26 timer compatibility repair.
- #515 → #518, preserving #521's active-CMS social-card behavior.
- #519's documentation privacy cleanup.
- #522's editorial CLI, shared settings and bounded media admission.
- #523's development dependency updates and repaired theme generation.

PR #505 was closed by Dependabot and replaced by #523. Its repair moved to the
replacement branch, preserving all fourteen replacement updates. PR #507
remains exclusively owned by the separate React repair chat and is excluded
from this candidate. React remains at the candidate's existing 19.2.8 versions.

## Scoped repairs

These were pushed normally to the existing PR branches after checking their
unchanged remote heads and fast-forward ancestry:

| PR   | Repair head                                | Behavior                                                                                 |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| #509 | `c00805ec72aa0e68f14d93d219441d09b62de2dc` | Browser/Node timer-handle types agree; cancellation retains handle zero.                 |
| #516 | `e91b1a177c99349d5199dba406ef2be8b3f4eaf4` | Runtime-contract consumers include www/admin; expectations and historical corpus agree.  |
| #518 | `cb5e52dd420a2f138bf07709eabbaf1786cfbd9a` | Editorial layout tests use active CMS visibility, preserving the merged social-card fix. |
| #523 | `52a5b2b5be5a8ca1375fb8ffb2c44a33b81f16e4` | Theme CLI observes the intended neutral-theme inputs through its guarded wrapper.        |

The #516 corpus explicitly records historical tracked paths: 5,124 entries,
zero differences. A historical #510 path in that fixture is not a dependency
on #510 source. The scoped #516 branch contains #517, #520, #512 and main;
it excludes the unrelated feature and reader chains.

## Validation

Node 24.19.0 and pnpm 10.5.2, with the shared heavy-job lock:

- Frozen dependency installation passed.
- Full `pnpm validate` passed: policy and migration checks, formatting,
  five builds, three lint tasks, thirteen typecheck tasks and thirteen test tasks.
- Content: 202 tests in fourteen files. Admin unit: 2,279 tests in 174 files.
  Admin Astro: 79 tests. Editorial Worker: 98 tests. CSP: two passed, one skipped.
- Native editorial CLI: nineteen synthetic tests; public and worker suites pass.
- Reader review found credential scopes, expiry, owner checks and logout guards
  preserved. Focused timer/reader verification passed 200 tests.
- A synthetic browser checked shared labels and persisted navigation at 320,
  390 and 1,440 pixels without page errors or horizontal overflow. This used
  system Chromium 151; matching Playwright Chromium downloads remain blocked.
- Six compatible dependency patches reduce the candidate audit from ten distinct
  advisories to four. KaTeX, legacy esbuild, http-cache-semantics and braces remain
  unresolved; their inspected paths and limits are recorded in the completeness
  audit. Wrangler stays at the replacement PR's 4.148.0.

Full validation logs: `/tmp/anipotts-com-source-candidate-validation.log`.
Workerd logged an unavailable public DNS lookup and an exercised revision
conflict during the passing editorial suite. These logs do not establish live
publication or owner-session acceptance.

## Integration and deployment hold

Ready source checkpoints still require their exact-head GitHub checks and review.
The nine finished infrastructure drafts (#510, #512–#520 except #511) were
advanced individually to review after combined validation, with prerequisites
advanced before consumers. The repaired dependency PRs #509/#523 were already
ready. The incomplete feature and combined review artifacts #522/#524 stay draft.
This record does not authorize merging main, changing protection, approving
Production or deploying. Re-read protection and validate the final integrated
head before any later approved merge. Do not substitute the combined candidate
for the user's canonical Mac preview.

PR #521 merged as `1ccc08da95b7cddd0f766bf86f436c56341eb5fc`; its
[Deploy run](https://github.com/anipotts/anipotts.com/actions/runs/38025022414)
is waiting for Production approval. Main's subsequent #508 release at `f9992c59`
is pending behind it. The production-release concurrency group does not cancel
the active release.

The #521 release log explicitly selects **www and admin**, schema `0044`, with
all four worker targets false and no D1 change. Its only source changes gate
writing social cards on active published CMS inventory and add regression tests.
The queued `f9992c59` delta consists only of #508's root ESLint package/lock update.
It does not supersede the held release. After successful #521 deployment and
live public health at `1ccc08da`, its planner should select no deployment because
there is no cumulative public diff. Verify that result when the queued run starts;
do not assume it while health remains older or unavailable.

The smallest later production approval packet is the existing #521 release for
both sites, with separate approval at the Production gate and selected deploy
jobs. Require successful exact-www release smoke, provider-confirmed admin
release/schema identity and denied unauthenticated owner routes. The editorial
admin lane intentionally skips the generic service-identity smoke; its boundary
check does not prove a signed-in human owner session. Live absent/visible card
GET/HEAD behavior and signed-in owner acceptance are still missing. Verify them
read-only against existing content, without publishing prose or mutating CMS.

For any later approved source integration, retain these orders:
#517 → #520 → #510; #520 → #512 → #516; #514 → #513 → #509 timer repair;
#515 → #518. #519 is independently reviewable documentation. #523 is the
dependency/theme repair. #522 follows its shared content/runtime prerequisites.
If #507 is included, validate the final React 19.3 graph with #523 and the feature
changes before seeking joint source approval. No individual green PR substitutes
for that final tree validation.

For #507 at `c1a646460f5192d83cc2b3260218acc3f17bb6df`, recommend waiting
for coordinated release approval despite green checks. Its two changed files
select admin deployment under current main's classifier. The planner may also
select www when live health is unavailable or reports an outdated public source.
No migration or worker target is selected by that dependency diff. There is no
source prerequisite between #507 and these repairs, but merging queues another
protected production release. If later combined with this candidate, revalidate
the combined React 19.3 tree before approval.

The website is not comprehensively complete or live-verified. Full media decoding
and crop provenance, Knowledge/Health source acceptance, backup/restore proof,
physical-device acceptance and provider inventory remain open. The cloud
[access configuration](cloud-website-access.md) must be applied through supported
settings; this chat can read its state but cannot publish that configuration.
