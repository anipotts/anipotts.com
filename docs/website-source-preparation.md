# Website source preparation

October 10, 2026. Source preparation is approved; production approval and
deployment are held separately. This chat has merged no source repairs into
main or deployed. Published wording and production CMS data are unchanged.

## Current candidate and evidence

Current main is `988b7edfebe26593725216c08ff715d2e5bb67b2`, following an
external #512 source merge. Its four Worker release remains at the initial
Production gate, not proven deployed. This chat merged no PR into main and
approved no Production release.

Fresh full `pnpm validate` passed on exact
`6d1e30d5750a8a1badb3835ddf26ff52b8b9de0e`, tree
`ad4a496d56e2ada8a4862c8466a3be7d990336f4`. It includes current main988b and
all strict refreshed heads. The new generated-route regression's initial
TypeScript overload error is repaired with literal raw/json calls.
Six builds, four lint tasks, fourteen typechecks and fourteen test tasks pass
with normal Turbo caching. Admin2280tests/174files, Astro79, editorial98,
content202, www192; CSP2pass/1skip. Frozen install passed. The tree stayed clean
through validation. Log: `/tmp/anipotts-final-reader-combined-validation.log`.
Historical77367571 success is no longer substituted for this changed tree.
Later packet-only documentation updates preserve every executable blob.

Standalone #513/#514 restore main's state Node22 scope. The broader assembly
retains #509's separate state Node26 update and #523's newer tools, restoring the
previous combined lock byte-identically. Reader
branches must normalize that importer to the then-current main after each
approved source merge. #507 is separately owned and excluded; the assembly
uses React19.2.8.

See [the bounded packet](website-next-source-batch.md) for exact heads, terminal
checks, independent review, deployment scopes and unresolved conditions.
#513/#514/#515/#518/#522/#524 remain draft-held. #516's current-main required
checks and111 independent focused tests passed; #523's fresh checks passed.
No readiness or green checks grant merge/deploy authority.

## Initial checkpoint (historical; not current-head proof)

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
from the full validation tree; refreshed CodeQL checks passed on both #522 and
#524 at their corrected heads.

Another agent subsequently merged #517 into main at
`2375022277c28286461666d765ed5f44a7083cd1` and refreshed #512 to
`489e7c8a8d553b9c49c46216ecdf68e2b3421ce5`. Both were merged into this
isolated candidate at `41dd460c30118653106e34795f8700523b29ef5e`, with no
tree change relative to `0d124a4e`. Existing PR branches are left to the active
integration owner; ownership clarification is pending.

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
The ten finished infrastructure drafts (#510 and #512–#520) were
advanced individually to review after combined validation, with prerequisites
advanced before consumers. The repaired dependency PRs #509/#523 were already
ready. The incomplete feature and combined review artifacts #522/#524 stay draft.
This record does not authorize merging main, changing protection, approving
Production or deploying. Re-read protection and validate the final integrated
head before any later approved merge. Do not substitute the combined candidate
for the user's canonical Mac preview.

PR #521 deployed successfully as `1ccc08da95b7cddd0f766bf86f436c56341eb5fc`
in [run 38025022414](https://github.com/anipotts/anipotts.com/actions/runs/38025022414).
Ani approved exactly this release; the separate React repair chat
`01a12428-da0c-70de-b963-580d74b9e0fb` was its sole executor. This chat
performed no Production approval or deployment. Later source merges and
production releases remain separately gated.

Both www and admin report this exact release and schema `0044`. Provider
versions are www `c9ce3c80-221f-4e33-b13e-80fcdc5de79d` and admin
`5d7adf9d-5431-44e8-8cc5-90b30557b4e7`. All four separate workers were
skipped; no D1 migration or CMS write occurred. Eight anonymous private-route
denials passed. Live GET/HEAD returned 200 PNG for `awareness-is-alpha` and
404 with `no-store` for the absent `jpegmafia-is-our-kanye-west` and
`may-your-intelligence-be-ever-reliable` cards.

The executor also verified the existing owner's signed-in read journey: five
page records, the unchanged home editor, preview revision 105 and loaded history,
plus the public awareness article. These checks need not be repeated by Ani.
Write acceptance still needs a named disposable or intended record and explicit
scope for draft saving, publication or unpublishing; no write was exercised.

GitHub automatically replaced pending tooling run `38025809196` with
[38027502965](https://github.com/anipotts/anipotts.com/actions/runs/38027502965)
at `2375022277c28286461666d765ed5f44a7083cd1`. The replacement completed
successfully: exact validation and summary passed, Production and all six deploy
jobs skipped, with no pending approvals. This is actual no-deployment evidence.
Neither this chat nor the executor cancelled a run. `cancel-in-progress: false`
preserves the active release, while GitHub retains only one pending run.

GitHub auto-merge was enabled on #510 at 05:28:01 UTC by account `anipotts`;
repair checks subsequently satisfied that inherited setting. It merged at
06:01:33 UTC as `8a197427`, incorporating #520 ancestry. The actual human/agent
enabler and approval provenance remain unproven. This chat neither enabled
auto-merge nor directly merged, and observed execution does not establish authority.
Both PRs are marked merged. [Deploy 38029505907](https://github.com/anipotts/anipotts.com/actions/runs/38029505907)
completed successfully with exact validation/summary passing and Production plus
all six deploy jobs skipped. Production remains `1ccc08da`; this chat merged
neither PR and approved no deployment. Do not propose duplicate #520/#510 merges.

For any later approved source integration, retain these orders:
#517 → #520 → #510 (completed); #520 → #512 → #516; #509 → #514 → #513;
#515 → #518. #519 merged; its cardinality correction is prepared in #524. #523 is the
dependency/theme repair. #522 follows its shared content/runtime prerequisites.
If #507 is included, validate the final React 19.3 graph with #523 and the feature
changes before seeking joint source approval. No individual green PR substitutes
for that final tree validation.

For #507 at refreshed `5abafb4b4d8c3d8207a3cb863c5e3a580c45b4ba`, the separate
owner has refreshed current main; exact-head Build, Security Review and
CodeQL all passed. No review threads remain; auto-merge is off. Independent lockfile review confirms only the
admin importer changes, with React/react-dom and their types aligned at 19.3.
With live www at `1ccc08da`, its prospective plan selects admin only, no workers
or D1 changes, schema `0044`. It has no source prerequisite on #524. Prefer a
separate admin dependency approval packet from the #520 → #510 source-only
packet; fresh exact-head checks and later explicit merge/release approval are
still required before execution. Combining it with feature/dependency branches requires fresh
validation of that combined graph.

The fresh validation above supersedes the earlier run for the later runtime,
guard and typechecking fixes. See the [next source batch packet](website-next-source-batch.md)
for current scoped heads, checks and remaining approval conditions.

The website is not comprehensively complete or live-verified. Full media decoding
and crop provenance, Knowledge/Health source acceptance, backup/restore proof,
physical-device acceptance and provider inventory remain open. The cloud
[access configuration](cloud-website-access.md) must be applied through supported
settings; this chat can read its state but cannot publish that configuration.
