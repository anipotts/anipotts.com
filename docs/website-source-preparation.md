# Website source preparation

## October 19 encrypted browser recovery checkpoint

Integration owner remains chat `01a14ffb-519c-73b1-a63a-380f9d7274d0` on ap-pro.
[#538](https://github.com/anipotts/anipotts.com/pull/538) is frozen at
`2b797fb5d4a10a4aa63788ac63ed140b31cd8a26`. CI39196056419, static Security
Review and CodeQL pass; native code/security review found no findings. The exact
#534/#535/#537 heads are included and those superseded PRs are closed. #538 still
awaits Ani’s exact merge/deployment review for all six runtime targets, no migration.
The canonical preview remains clean at this head: www127.0.0.1:4580,
adminlocalhost:4311, current published v17/20-record mirror checked04:12:48Z.

The next batch is [draft #539](https://github.com/anipotts/anipotts.com/pull/539),
stacked on #538, branch `codex/browser-recovery-unlock`, isolated checkout
`/private/tmp/anipotts-browser-recovery-unlock`. Ani accepted local recovery key
files and manual re-unlock on reload/expiry. This accepts the design, not a later
unreviewed PR release. Production Access and API permissions are unchanged.

The browser engine and consumers now use non-extractable, document-memory keys,
AES-256-GCM v3 values, authenticated chunk manifests, per-unlock channel
capabilities and exact-byte CAS under existing Web Locks. Legacy bytes remain
additive and visible as retained plaintext. Safety exports encrypt current input
and opaque copies; explicit Markdown source/history exports stay labeled plaintext.
Lost keys preserve earlier identities and allow an opaque export without claiming
decryption. Setup requires a downloaded file to be re-imported and challenged.
The maintained [browser contract](design/admin-workspace/browser-recovery-contract.md)
describes lifecycle order, bounds and remaining acceptance.

Qualified source checkpoint `dadc2475b8bea8b49cd7f779abb44452cd06ffb7` includes
review fixes for stale channel/key reuse and storage-dependent hydration. Full
workspace validation passed at source `4f99e746`: 2,399 Admin core,79 Astro,
98 workerd,3 CSP cases with one intentional skip;196 public and206 content tests.
The complete native browser run passed32 existing/key-file/crypto cases at
`e23ade9a`; its four new lifecycle cases initially failed on test selectors and a
retired redirect expectation. After test-only corrections, all four lifecycle
cases pass at `dadc2475` in Chromium and WebKit. This includes independent tab
unlock, actual competing input, native cross-tab logout storage events, real
pagehide and history return. The history test accepts either locked retained
state or a fresh key gate; it does not assert a BFCache hit. Keys, fixtures and
API writes are synthetic/local only. The final combined check is refreshed on
the frozen review candidate before it is offered for approval.

The recovery-only classifier selects admin, D1 unchanged/schema0044, no migration.
The canonical preview remains on #538 until that review completes. #539 needs
base/main-check refresh, canonical integration and Ani’s exact review before
merge/deploy. Physical-device key custody, live Access expiry/owner save and
operational recovery custody/restore remain separate acceptance. No remote
migration, real content mutation, provider setup or production deployment occurred.

The media foundation is parked/pushed at `cd5011b2`; source5692a966 passed32 Node
and3 actual workerd cases after all three review findings were closed. It remains
disabled and outside these PRs. Coherent capture remains parked/pushed36178c98,
with operational admission disabled and its documented upload/cohort/custody gaps.

## October 18 browser-tools release and next completion batch

Ani approved #532 at `8243909232b955c279e7c48a40765f7c79313d85` for merge and
affected-target deployment in owner chat `01a14ffb-519c-73b1-a63a-380f9d7274d0`.
Required CI39169709333, Security Review and CodeQL passed. Live strict protection
was reread before protected merge `0517843d68a1ed47e6e76c8bcff34e9923a945ef`;
the merged tree is identical to the reviewed tree.
[Release39190784351](https://github.com/anipotts/anipotts.com/actions/runs/39190784351)
passed exact-release validation and selected no runtime targets: www, admin and
all four workers were skipped. Browser tooling and receipt documentation do not
change deployed bundles. D1 was unchanged; no migration or Production approval
was required. Production remains on the verified #531 release94889ee.

The next source candidate combines the remaining dependency branches #534/#535/#537 (which supersedes #536),
aligns the full Tiptap family, and replaces lint-staged's vulnerable braces chain
with its supported17.6release. The current lock audit has no high or critical
advisories. Moderate legacy esbuild under Drizzle Kit and low KaTeX under Apps SDK
remain upstream limitations, not a clean-audit claim. Astryx CLI0.7.1 compiles the
existing Core/Neutral0.4.6 theme with its compatibility guard active; generated
outputs and source instructions follow the installed compiler.

Article properties now expose the existing source/demo URL, label and type;
clearing an optional value removes its YAML key. Shared settings, body, comments,
and line endings remain intact. This completes the normal editor path for the
already-deployed public article source link. Admin native scroll indicators and
one continuous cold-record loading announcement are implemented. A rejected
editor module now leaves navigation available and offers a deliberate guarded
page reload, without automatic retry or write replay. New-record inputs wait for
hydration/recovery initialization; typing before hydration can no longer leave
the visible title disconnected from Create. SDK menus remain inside their native
modal owner, fixing untappable phone Properties controls. A distinct CSRF cookie
is restricted to compiled HTTP-loopback owner builds; production retains the
Secure `__Host` cookie, fixed origin and token checks.

Local source qualification at `18329ff14eaa174e56ef5ac5acd9c0571146e979`:

- `pnpm validate` passed: all invariants, formatting, six builds, four lint tasks,
  fourteen typechecks and fourteen test tasks. Admin passed 2,361 core, 79 Astro,
  98 editorial and three CSP cases with one intentional CSP skip; www passed 196
  tests and shared content passed 206.
- The complete local admin browser command passed 22 cases across desktop
  Chromium and phone WebKit: metadata/source/review, loading failure/retry/lock,
  native scroll/keyboard movement, real stored crop output/original retention,
  upload cancellation, CSRF and existing editor/read-only journeys. Synthetic
  records only; no production content writes or publication.
- Public workerd/D1 publication and unpublication proof and all 84 CMS routes
  passed. Public browser journeys passed 13 cases with one intentional desktop
  skip on this dependency graph; subsequent app edits were Admin-only.
- The deployable Admin scan found no local-owner marker or flag in 344 files.
  This includes the HTTP-only cookie name. The lock audit has zero high/critical,
  one moderate and one low advisory.

The checked classifier selects all six runtime targets because shared dependency
changes affect the app/worker graph. D1 is unchanged, schema is `0044`, migration
risk is none and no remote migration is selected. Required hosted checks and
Ani's exact merge/deployment review still gate release.

The coherent recovery prototype is preserved separately at
`codex/editorial-recovery-capture`, checkpoint
`36178c98559b43f595803cfea8b4119529543baf`: 18 formatter/crypto tests and 21 real
local DO/D1/R2 cases pass at source `2793c460`. Operational capture is disabled;
writer-cohort enrollment, full upload coverage, key custody, external copy and
operational restore remain unfinished. The 4 MiB collected / 8 MiB envelope
bounds do not cover every valid 10 MiB upload. It is excluded from this release.

Ani accepted local key-file custody and manual unlock for browser recovery.
Its separate `codex/browser-recovery-encryption` foundation has 19 native Web
Crypto tests; storage/UI migration and browser qualification remain separate.
Current production browser recovery remains plaintext. The
[private Images proposal](editorial-media-processing.md) preserves upload and
publication limits and does not configure a provider or activate decoding.

Per-article social imagery is superseded by the approved canonical brand card,
enforced by current Shell and painter tests. The unused writing-seed lookup and
ignored card prop are removed. No new image renderer, artwork or published prose
is introduced. The [current completeness audit](website-completeness-audit.md)
separates active software work, explicit deferrals and reserved live operations.
This next candidate remains unapproved for merge/deployment.

## October 18 approved production release

Ani explicitly approved corrected #529 at
`b946acd96cc5f5a9345e95a0167c8187ac5577a3` for merge and all six affected
targets in owner chat `01a14ffb-519c-73b1-a63a-380f9d7274d0`. Protected
integration merged it as `638944cdd115c02c3138802154e4d162ad5f1fc6`.
A direct Git tree comparison proves the reviewed and merged trees identical.
Live branch protection and ruleset 21578155 required strict build/security
checks and resolved conversations, with no bypass, force push or deletion.

[Production run 39166553611](https://github.com/anipotts/anipotts.com/actions/runs/39166553611)
succeeded for www, admin, ingest, newsletter, state and weekly email. Schema
remains `0044`, D1 changed is false, and no remote migration ran. All affected
targets ran; there was no labs target. Editorial release verification ran instead
of the held authenticated-smoke lane. Its absence is not authenticated-owner proof.

| Target       | Deployed Cloudflare version            |
| ------------ | -------------------------------------- |
| www          | `173c6f90-e939-48f1-afae-ebe4d18442ff` |
| admin        | `5857e710-cc17-4dc5-a200-31a36c26018d` |
| ingest       | `ebbbbde6-24da-4fc0-bf76-f5f273f3b41a` |
| newsletter   | `304bcf07-b6b7-4b55-9fdb-240b3440fb9c` |
| state        | `bd471b9b-9c7b-4db5-a579-7246f11b3ebc` |
| weekly email | `68ff8676-8d30-470c-9f98-e3ca0ccbd873` |

Fresh public HTTP proof returned 200 for health, home, work, writing, systems,
the awareness article and Quantercise. Health reports release `638944cd`, schema
`0044`, connected D1 and ok true. The workflow proved admin's active provider
version carries the exact release/schema message and eight protected paths
redirect through Access. No CMS publication or authenticated editing was performed.

The already-approved October 10 release remained at a native GitHub gate.
It is superseded by this cumulative release: old runs 38031295743 and
38074201063 are cancelled. The same October 18 approval was applied to the
production gate and selected target jobs, including Admin after www passed.
No days-old GitHub approval waits remained in the fresh repository audit.

Worker deployment success is distinct from operational freshness. Newsletter
health returned 200/ok. Weekly email returned the intentional 410/retired state.
State returned 503: links readable, commits never received, control disabled.
Ingest returned 200/degraded with a silent Brands arrival source and connected
D1. These are observed source/setup gaps, not pending release approvals or proof
of producer operation. No collector, producer, authentication or secret changes
were made. Operational follow-up must inspect the owning sources before mutation.

### Public usability release #530

Ani approved #530 and #531 for merge and affected-target deployment in the same
owner chat. #530's checked head `742c4a2d3a05510a0633ba212615cb8266af80f0`
merged through strict protection as `93f8c087ef262a20674572b3b2ee86e4ad402f82`.
A direct tree comparison passed. [Run 39168520476](https://github.com/anipotts/anipotts.com/actions/runs/39168520476)
deployed www and admin; ingest, newsletter, state and weekly email were skipped.
No migration ran; schema remains `0044`.

Public version `b7d1b32b-9f3b-485a-a9f9-6cdf72ff8793` and admin version
`f58cc8e8-292e-45d2-9706-97e114667755` carry that release. Exact-release smoke,
live health, actual homepage skip-link/main markup, admin provider identity and
eight Access boundary checks passed. Authenticated-owner editing and human
visual acceptance are separate from these automated checks.

### Qualified dependency release #531

Ani's same approval covered #531's Astro 7.4.0 and direct Wrangler 4.151.0
updates. Original approved dependency head: `0ce6ea622ed3afa34ab4ef24bb34fdb4df8618c2`.
Refreshing it with already-approved #530 produced `9edc678b98478a4b4917d060a8de52d6d69e632c`.
Binary comparison of the dependency patches before and after this base refresh
was identical. Fresh [CI 39168747684](https://github.com/anipotts/anipotts.com/actions/runs/39168747684),
Security Review and CodeQL passed. Live protection was reread immediately before
merging, with strict required checks and no bypass. Merge/release
`94889ee9626d166e7e5e3a277a1688921e6997bd` is tree-identical to refreshed head9edc678.

The historical Astro 7.4 manifest failure was requalified rather than bypassed.
A fresh frozen install with adapter14.3.4 passed the unchanged manifest guard,
194 public tests including the stale bundled-image exclusion, real workerd/D1
publication and unpublication, and all84CMSroutes. The integration adds #530's
tests for196public tests. No assertion was weakened or adapter behavior mocked.
The P1 review condition was satisfied and the conversation resolved.

[Production run 39169370064](https://github.com/anipotts/anipotts.com/actions/runs/39169370064)
succeeded for www, admin, ingest, newsletter, state and weekly email. All six
were selected; no app/worker target was skipped, and labs remains archived.
D1 changed is false, schema remains0044, and no migration ran. Public exact-release
smoke and direct live health passed. Admin's active provider release/schema and
eight Access redirects passed; authenticated-owner acceptance remains unclaimed.

| Target       | Deployed Cloudflare version            |
| ------------ | -------------------------------------- |
| www          | `049272ca-7069-4f5e-a1df-4089c4e94030` |
| admin        | `ad294cd0-3ae1-43a9-a943-c38aedaefec7` |
| ingest       | `19b308d6-6919-4c5a-bd29-13f16229d3a9` |
| newsletter   | `a99569b9-3782-4f4c-a1dc-b9ec3c41e80f` |
| state        | `818ebd8b-7ab1-464c-ae65-e0abc8adc662` |
| weekly email | `83d48764-bd88-48ca-99ba-8a8bbc04939a` |

The owner refreshed both canonical previews with the frozen dependency graph and
restarted their managed processes. Actual public skip-link/main markup and both
HTTP200responses were checked, beyond the dynamic Git identity. Production
publication mirror v17 contains20records and reports current. Existing state and
ingest freshness gaps remain separate operational work; this dependency release
makes no producer, authentication or deliberate email-send change.

### Browser-tools review #532

#532 is prepared on released main94889ee. e2e0.21.1 and direct Playwright1.64.1
are the only manifest updates; pnpm resolved the lockfile merge conflict.
@e2e-dev/web remains0.14.0 and installs its matching Playwright-core1.63.0 engine.
Source checkpoint: `021d65921f9f864a0092c50900601129534885ee`; the following
documentation commit records release receipts without changing runtime source.

Frozen install, full pnpm validate,13public browser tests (one intentional desktop
skip) and10admin browser tests passed with the new CLI on desktop Chromium and
phone WebKit. These are deterministic synthetic local tests, with no model-driven
browser calls or production writes. Final hosted checks cover the actual PR head.
Ani subsequently approved that exact head; its completed no-target release is recorded above.

## October 18 review corrections and second batch

Ani approved merging #529 and deploying its affected targets after reviewing
`75ae67139b3073fffa08deaa7c340a222a83e701`. The live pre-merge check found
three newly unresolved review conversations. All were validated and corrected
in `b946acd96cc5f5a9345e95a0167c8187ac5577a3`: the theme compiler contract now
matches installed CLI 0.6.7; the local preview uses Vite filesystem URLs for
public components served by Admin; homepage normalization preserves optional
validated shared settings. The exported normalizer has no current production
caller, so this is contract completeness rather than demonstrated editor loss.

The conversations were resolved and the corrected head passed fresh checks. Ani
then approved that exact head for merge and all six targets; the completed release
is recorded above. This historical review checkpoint did not itself grant approval.

The independent next batch restores a keyboard path past shared navigation and
native scroll indicators, and renders the article source/artifact metadata
already supported by publication. It changes no published content. Synthetic
CMS fixtures cover internal, external, fragment, fallback-label and absent-link
states; browser journeys cover keyboard focus before and after an Astro client
transition and real document/code scrolling. Implementation checkpoint:
`c814e41ec66e541eb274c397fde85ba3fc007ac6`, with #529 corrections integrated
without rewriting either branch. Checks and the final review revision are
recorded on its PR. Ani later approved this batch; its completed #530 release is recorded above.

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

### Historical review checkpoint

Review candidate: [PR #529](https://github.com/anipotts/anipotts.com/pull/529),
branch `codex/site-first-batch`. Implementation checkpoint:
`629edb5bdc627e7e8da8ccc234af33832a2b1907`. Final PR-head checks also cover the
receipt-only documentation commit. Auto-merge is disabled; Ani's exact-head
review was still required at that checkpoint. The later approved release is
recorded above.

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

At this historical checkpoint, the Astro/Cloudflare patch family was pinned to Astro 7.3.8 and adapter 14.3.4;
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
configuration are unchanged. The former waiting worker deployment was completed by #529. Operational backup
qualification and held media-decoder research remain follow-up work. The older
per-article social-image proposal is superseded by the canonical brand-card
contract; it is not an active rendering gap.

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
