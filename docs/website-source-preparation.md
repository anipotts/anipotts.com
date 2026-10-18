# Website source preparation

## October 18 review corrections and second batch

Ani approved merging #529 and deploying its affected targets after reviewing
`75ae67139b3073fffa08deaa7c340a222a83e701`. The live pre-merge check found
three newly unresolved review conversations. All were validated and corrected
in `b946acd96cc5f5a9345e95a0167c8187ac5577a3`: the theme compiler contract now
matches installed CLI 0.6.7; the local preview uses Vite filesystem URLs for
public components served by Admin; homepage normalization preserves optional
validated shared settings. The exported normalizer has no current production
caller, so this is contract completeness rather than demonstrated editor loss.

The conversations are resolved. Refreshed validation belongs to the updated PR
head; approval of the older candidate does not cover these later edits. Merge
and deployment remain pending review of the corrected candidate. All six targets
are affected by the consolidated dependency changes; no remote migration is
selected. Existing older queued production runs are not approved by this receipt.

The independent next batch restores a keyboard path past shared navigation and
native scroll indicators, and renders the article source/artifact metadata
already supported by publication. It changes no published content. Synthetic
CMS fixtures cover internal, external, fragment, fallback-label and absent-link
states; browser journeys cover keyboard focus before and after an Astro client
transition and real document/code scrolling. Implementation checkpoint:
`c814e41ec66e541eb274c397fde85ba3fc007ac6`, with #529 corrections integrated
without rewriting either branch. Checks and the final review revision are
recorded on its PR. This batch also waits for Ani’s review before merge.

## October 18 first batch

Owner/source chat: `01a14ffb-519c-73b1-a63a-380f9d7274d0` on ap-pro. Ani
authorized dependency repairs, PR consolidation and content/rendering fixes,
checked and ready for review before any merge. The isolated candidate is
`codex/site-first-batch`, based on assembly #524 plus main
`28a7087793cf8951736597835f4bc6bb9e3ea632`. The older integration-owner chat is
archived; this chat owns the batch and preserves the existing canonical lane.

### Consolidation and scope

The assembly already contains every substantive commit from #509, #513, #514,
#515, #518 and #522. Their newer remote heads add current-main merge wrappers;
#522 also resolves a harmless test comment. Direct tree/ancestry inspection,
including multiple merge bases, established containment. The source checkpoints
are #509 `d698b76e`, #513 `f25395cc`, #514 `5b60c917`, #515 `a58a5d68`,
#518 `6eeec4c8`, and #522 `93b437ab`. Their branches and prior review records
remain recoverable. Superseded PRs close only after the canonical replacement
has passing checks and preservation evidence. Authored branches are retained.
Dependabot removed its six update branches automatically when their PRs closed;
each exact head was recovered from its pull ref, verified and pushed to
`codex/preserve-pr-<number>-2026-10-18`. PR #529 records those preservation refs.

The candidate adds the coordinated #507/#527 React family, #525 runtime
patches, #526 font update and #528 tooling updates without downgrading prior
security repairs. Node declarations follow Node 24, preserving #509 timer
fixes. The guarded neutral-theme compiler is retained for the Astryx CLI update.
Dependabot groups compatibility families before generic dev/production updates;
browser CI installs through the actual e2e-web engine. Auto-merge stays off.

Homepage rendering honors stored section order and visibility, including the
intro group. Generated project defaults retain optional card titles and compact
copy. Defaults and authored public copy are unchanged. `content:check` becomes
non-mutating, with a disposable-project regression proving it rejects stale
outputs without repairing them. Source, generator and real emitted-Worker
rendering tests cover non-default content.

### Verification and remaining gates

Review candidate: [PR #529](https://github.com/anipotts/anipotts.com/pull/529),
branch `codex/site-first-batch`. Implementation checkpoint:
`629edb5bdc627e7e8da8ccc234af33832a2b1907`. Final PR-head checks also cover the
receipt-only documentation commit. Auto-merge is disabled; Ani's exact-head
review is still required. No merge or deployment has occurred.

Node 24.19.0, pnpm 10.5.2 and Bun 1.3.4 are the verification runtimes. Frozen
install, guarded theme generation/check, dependency/workflow regressions and the
real-package non-mutating content check regression pass. Public runtime tests:
194 passed. Content tests: 204 passed. Public browser journeys: 7 passed, with
one intentional desktop skip for the narrow-menu case. Admin browser journeys:
10 passed across desktop Chromium and phone WebKit, using isolated synthetic
local data. No model-driven browser tests or production writes ran.

The local verification matrix passes: six builds, four lint tasks, fourteen
typechecks, 2,300 admin DOM tests across 174 files, 79 Astro rendering tests,
98 editorial Worker tests, and three bundle/CSP checks with one intentional skip. Normal
Turbo caching applies to unchanged tasks. Final whole-command and exact-head
GitHub receipts belong on PR #529; passing checks do not grant Ani's review.

DOM and editorial workerd suites use two workers each to bound contention on a
shared review host. Existing timeout limits and assertions are retained. Five
replay-marker scenarios now run independently. Hydration coverage executes the
emitted bootstrap, verifying actual island registration and the load event
instead of depending on compiler quote formatting. Discovery options live in a
pure module shared by Astro and the entry tests, so the local-development gate
runs before workspace builds. A disposable copy of the actual app source and
entry tests passes with no node_modules or package dist, under CI flags.

The Astro/Cloudflare patch family is pinned to Astro 7.3.8 and adapter 14.3.4;
direct Wrangler manifests use 4.149.0. Unbounded caret resolution had selected
Astro 7.4.0 and broken the public manifest contract. The admin optimizer also
needed test-file exclusions in both client and Cloudflare SSR discovery, because
a unit test imports Node-only build configuration. The actual app and server
entries remain discoverable. A real local server startup and the browser suite
verify the repair. Task-owned E2E servers use Astro's foreground `--ignore-lock`
flag; the managed review preview remains separate.

Production server source maps retain source identifiers and file/line mappings
while omitting embedded original source. The updated Cloudflare plugin emits
Worker maps by default; raw development-only owner branches must stay out of
those deployable artifacts too. The all-file owner scanner is unchanged. The
built-bundle suite now checks all artifacts for owner markers and verifies that
usable maps remain without embedded source text. Provider debugging needs the
matching release source for original-code excerpts.

The original canonical preview history is preserved at
`codex/preserve-preview-2026-10-18` (`9c6808bd16fae59c64119102e4f573cfeb939bf7`).
Its useful preview asset-URL fix is retained; duplicate table rules/imports and
stale approval records were reconciled with the assembly. Both managed previews
responded with the same clean candidate and current production publication v17
mirror (20 published records). Public: `http://127.0.0.1:4580/`; admin:
`http://localhost:4311/`. The mirror only reads active publications remotely and
writes local preview tables. Human visual acceptance remains Ani's review.

The October 18 lockfile audit reports three remaining advisories: low KaTeX
through the UI SDK's math dependencies, moderate esbuild through drizzle-kit's
legacy loader, and high braces through lint-staged/micromatch. The braces
advisory reports no patched version. The KaTeX fix crosses the upstream package's
declared range; no speculative transitive override was added. This is not a clean
audit claim. The local report is `/tmp/anipotts-first-batch-audit.json`.

Working-tree-aware classification selects www, admin and the four retained
workers because dependencies are shared. There is no D1 migration change.
Future release needs Ani's exact review plus current protection and release
checks; the classification does not grant production permission. Content,
Access, secrets, database bindings, migrations, backup custody and provider
configuration are unchanged. The existing waiting worker deployment remains
separate. Operational backup qualification, held media-decoder research and
publication-aware social images remain follow-up work.

## October 10 checkpoint (historical)

October 10, 2026. Source preparation is approved; production approval and
deployment are held separately. This chat has merged no source repairs into
main or deployed. Published wording and production CMS data are unchanged.

## Current candidate and evidence

Current main is `988b7edfebe26593725216c08ff715d2e5bb67b2`, following an
external #512 source merge. Its four Worker release remains at the initial
Production gate, not proven deployed. This chat merged no PR into main and
approved no Production release.

Fresh full `pnpm validate` passed on exact
`61008624dc2013759c065f2665f18e04f244dc2b`, tree
`965ad7afe45d5323af1ff788618d2a7e833e618e`. It includes current main988b and
all strict refreshed heads. The new generated-route regression's initial
TypeScript overload error is repaired with literal raw/json calls.
Six builds, four lint tasks, fourteen typechecks and fourteen test tasks pass
with normal Turbo caching (the unchanged application tasks were cached).
Admin2296tests/174files, Astro79, editorial98,
content202, www192; CSP2pass/1skip. Frozen install passed. The tree stayed clean
through validation. The27 CLI/offline tests ran afresh, including105 revisions
restored through canonical SQLite schemas. Log:
`/tmp/anipotts-offline-recovery-combined-validation.log`.
Historical77367571 and6d1e30d5 success is not substituted for this changed tree.
Later packet-only documentation updates preserve every executable blob.

The nine-file recovery repair, isolated at22fcda83 and transferred into the
editorial branch at36325a62, captures current buffered edits and retry identity
without sending a save or retry. Session guards suppress plaintext downloads
after logout or expiry. Independent source review found no blockers;110 focused
tests, full compiler checks and a stored-only export mutation passed. This
closes the browser-download defect, not full-store backup/restore coverage.
The four-file offline adapter at4bb272c1 covers supplied state across eight
editorial and three publication tables, exact media chunks/references, preserved
receipts and suspended pending intents. Caller-key AES-GCM envelopes reject
tampering.27 tests, two meaningful reference/table mutations and independent
review pass. A discovered dependency on518's layout helper was removed;
standalone522 also passes without that helper or installed dependencies.
See [the offline contract](design/admin-workspace/offline-recovery-contract.md).
This implements supplied-snapshot validation and synthetic restore, not live
consistent capture, provider export/import, key custody or operational backups.
Media decoding remains isolated under qualification; the current10MiB/16MP
upload path is unchanged. The held API document describes that prototype, not
an implementation included in this validated tree. Isolated media research
commit a15335f5 passed100 focused tests and compiler/build/local Worker proofs,
but remains unqualified and excluded. No safe processing limit is established.

Standalone #513/#514 restore main's state Node22 scope. The broader assembly
retains #509's separate state Node26 update and #523's newer tools, restoring the
previous combined lock byte-identically. Reader
branches must normalize that importer to the then-current main after each
approved source merge. #507 is separately owned and excluded; the assembly
uses React19.2.8.

See [the bounded packet](website-next-source-batch.md) for exact heads, terminal
checks, independent review, deployment scopes and unresolved conditions.
#513/#514/#515/#518/#522/#524 remain draft-held. #516's current-main required
checks and111 independent focused tests passed; #509 and #523's fresh checks passed.
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
