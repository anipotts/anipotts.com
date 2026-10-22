# Website source preparation

## October 22 inactive recovery source refresh

Draft #541 was refreshed locally from `f91f6b62426b9b9a6e5ac8fd63469d484ab589af`
by normally merging released main `07da221d82aa4b0d6b7d4dabcc363103fdd3959a`.
Only README and this history conflicted. Current-main dependency versions and
formatter changes are retained; #551 remains a separate unreleased candidate.
#550 is merged and deployed to www and Admin, with four workers skipped and no
migration. The media refresh stays recoverable at `865211b8` on its own branch.

This refresh adds no recovery implementation changes. It does not mean all
branch code is dormant: DraftStore constructs durable recovery control/writer/
capture tables and wraps save, rebase, lifecycle, media and publication/alarm
mutations in local writer bookkeeping. Direct publication, published-media
copies and seed operations also gain conditional D1 writer fencing. Unmigrated
D1 remains writable through the existing unenrolled path but cannot capture;
enrolled D1 uses durable admission and retains ambiguous failed external writes.
The operational writer-cohort assertion still always rejects.

Earlier Node/native/full validation receipts below apply only to their named
revisions. No install, tests, build, browser, push, remote migration or provider
operation accompanied this source refresh. Frozen dependency installation,
focused Node codecs, actual local recovery and ordinary editorial workerd
compatibility, content publication/seed regression, strict typing and affected
build checks remain owner-scheduled before readiness.

Keep #541 draft. Capture/restore activation, migration 0003, production artifact
bindings, provider/destination selection, key custody, external copy, enrollment
and a demonstrated operational restore drill remain held. The test-only cohort
adapter and supplied local R2 fixtures do not enable production admission.

## October 21 queue refresh and worktree ownership

Current main is `1efed957`, including approved brand geometry #553. The formatter
refresh preserves its transforms and animation changes. #549 is already deployed;
its old dependency proposals #546/#548 and #545/#547 are closed as superseded.
#550 and #551 remain the active source candidates; #552 is the new runner patch.

Seven checkout directories were removed after preservation during October 19
cleanup. Native creation events identify owner chat
`01a14ffb-519c-73b1-a63a-380f9d7274d0` for site-first-batch,
site-dependency-refresh and site-project-authoring; subagent chat
`01a15008-1dac-7480-90b2-424f4c9d0787` created first-batch-content,
admin-loading-scroll, local-csrf-webkit and modal-menu-webkit. Native archive
calls from both contexts still reject ownership. Direct chat dispatch rejects
multi-agent v2 subagents. The app cards remain blocked on native ownership
reconciliation; no app database edits or filesystem recreation were used.
Recovery records remain under `.local/project-cleanup/2026-10-19/`.

## October 19 Astro formatter migration

This isolated candidate reproduces #547 with prettier-plugin-astro 1.1.1 and
`astroCompressHTML: "html"` matched to both apps' `compressHTML: true`.
The fresh bot branch is preserved. The old formatter patch is a distinct
migration from compatible runtime dependency candidate #549 and the coherent
Core/Neutral family work for #545.

Source `614883d63672f4ce5a16c53b8e2ce412bef6ec98` changes 38 tracked Astro
files plus formatter config, package and lock. Existing ignore rules, canonical
content, private drafts and generated inputs remain untouched. All 65 tracked
Astro files pass a second format check, whole-repo formatting and frozen lock
consistency. Static security has no findings. Retained package records and
non-formatter importer versions are unchanged.

Static comparison using the actual formatter and application compilers parses
every changed before/after source. Generated-JS AST plus extracted CSS/scripts
are structurally equal for 34 files. The other four contain five reviewed literal
differences: normal label whitespace, inline-flex button edge whitespace, byline
spacing and inline stylesheet formatting with the same declarations. These are
not rendered acceptance. Full checks and actual public/Admin browser, inline
text/link, media, byline and CSP acceptance remain owner-scheduled gates.
Receipts: `/private/tmp/anipotts-astro-formatter-{idempotence,format-check,frozen-lock}.log`,
`semantics-all.json`, `reviewed-literals.json` and `whitespace.diff`.

#539 is deployed to Admin at `cf7b757b`; its provider/schema and eight Access
redirects pass. #542 is merged at `aa860b4b`; its source release39275594601
skipped all six runtime targets and ran no migration. Current receipts are in
their PRs. Media/recovery remain inactive drafts; source adapter work does not
authorize operational custody, provider setup or activation.

Proposed formatter source targets are www and Admin, including the shared brand
component. Keep this candidate draft until the current-main source/render and hosted checks
finish. Integration follows current standing authority and native release gates.

## October 19 compatible runtime dependency refresh

#539 is merged as `cf7b757b` and Admin-only deploy39272399483 succeeded.
Its exact provider/schema/eight Access redirect proof passes. #542 is merged as
`aa860b4b`; release39275594601 succeeded with every runtime target and
Production skipped, no migration. Their PR descriptions contain current receipts.

Fresh Dependabot proposals arrived after those releases. This isolated candidate
independently reproduces compatible #546 and #548 updates on main `aa860b4b`:
Admin React integration 7.1.0, ESLint 10.13.0, Wrangler 4.151.1 across root and all
four retained workers, and Admin's matching Cloudflare Vitest plugin 1.4.4.
React/DOM remain 19.3.1, types 19.3.0, Astro 7.4.0, its Cloudflare adapter 14.3.4,
and Node 24.19.0. Five old package records are removed and three new records added;
existing retained package records are unchanged. Frozen installation and dependency
family assertions pass. Full validation, actual browser/native qualification,
hosted checks, canonical integration and exact review remain pending.

The proposed runtime scope is Admin plus four workers; www is excluded while its
deployed public tree remains unchanged. No migration, bindings, send logic,
authentication or production content edits are planned. The fresh bot branches
are preserved; no bot branch has been edited or merged.

#545 is a separate coherent Core/Neutral 0.7.1 migration: Neutral's exact Core
peer and adaptive typography make the theme-only bot update incompatible with
Core 0.4.6. #547 is a separate formatter migration: its default JSX whitespace
mode differs from both apps' compressHTML:true. Match html before reviewing
printer changes. Those implementation workers have isolated worktrees and no
heavy verification slot; the integration owner schedules tests serially.

Inactive #540 media and #541 recovery remain independently checked drafts.
Their latest source/qualification receipts are in their PRs. A caller-supplied
ciphertext artifact adapter is a separable source step underway for recovery;
operational custody, provider setup, migrations and activation remain gated.

## October 19 supplied-R2 artifact qualification

Draft #541 now includes the inactive supplied-R2 artifact slice at
`845c3bc2cccb1206c35197fa45a2a39a70ff000c`, based on qualified `0bf632ff`.
The adapter stores ciphertext events with conditional claims, bounded 128-entry
index shards and a final commit index. Fresh replay pins length, etag, version
and SHA256; the v3 codec authenticates both passes before successful restore.
Pending GET/body reads and PUT acknowledgments observe codec cancellation;
late persisted ciphertext remains ambiguous and preserved.

All 129 recovery Node cases and all 27 actual local Workerd/SQLite/D1/R2 cases
pass. The three new native cases include actual 10MiB objects in both media
planes with 4MiB-class controls, encrypted capture/reopen/suspended restore,
metadata/hash readback, conditional collisions and held-body cancellation.
Independent source and cancellation-delta reviews are clear. Full `pnpm validate`
passes all 14 tasks, with 11 cache hits; strict editorial typing, formatting and
source drift checks pass. The production owner fixture is absent in 344 built
files. Exact-source logs:
`/private/tmp/anipotts-recovery-artifact-{native,all,validation}.log`.
A following documentation-only checkpoint records these results.

Operational admission still always rejects. The third artifact bucket and RPC
wrappers are local fixtures only. No production artifact route/binding, provider
provisioning, destination/key custody, remote migration `0003`, enrollment,
retention deletion or operational restore guarantee is enabled. The draft stays
held for those explicit operational gates; green source checks do not complete
them. Main remains `aa860b4b`; the canonical preview is the separate compatible
dependency candidate `dbcd69a1` with the current v17/20-record local mirror.

## October 19 final tooling integration and recovery proof

### Final approved tooling integration

The normal merge at `bc3a122618648a513ff10fa5fe1d0588f625bbba` incorporates
approved main `aa860b4b`, including #542's independently qualified unused CLI,
plain configuration and lock cleanup. All app, package, script, worker, Turbo,
workflow, runtime configuration and migration source bytes remain identical to
the full-qualified recovery source `ea91d5212f407f1f771476226db8c8720adc5881`.
No foundation runtime changed. A fresh offline frozen installation, complete
CI invariants and formatting pass on the final combination; static review passes
33 sensitive paths and tracked-source drift is clean. Logs:
`/private/tmp/anipotts-v3-main542-{install,checks}.log`.
The full 14-task/native qualification above remains tied to its exact source;
these affected tooling checks qualify the later dependency/documentation merge.
Proposed targets remain www/Admin, with all workers skipped and no remote
migration. Later checkpoint changes only record this evidence.

#539 Admin release39272399483 and #542 source release39275594601 are complete.
Their exact approvals and release receipts are preserved in the existing queue.
The canonical preview is clean on `aa860b4b`, with the current published v17 /
20-record mirror. Operational admission, production artifact/custody/provider
setup, migration and restore acceptance remain gated.

## October 19 refreshed recovery foundation on released main

#539 is merged as `cf7b757b` and its Admin-only release
[39272399483](https://github.com/anipotts/anipotts.com/actions/runs/39272399483)
succeeded after Ani's exact `f8e90810` approval. All five other targets were
skipped; no migration ran, schema remains `0044`. Admin provider version
`ab08369b-bd13-4eb4-aeb0-f544384fb7b9` and eight Access redirects pass.
The existing integration queue records both approval scopes and release proof.

The inactive recovery candidate normally merged that main at
`ea91d5212f407f1f771476226db8c8720adc5881`; foundation runtime bytes were
preserved. Fresh offline frozen installation and full `pnpm validate` pass all
fourteen tasks: Admin 2,465 core / 79 Astro / 105 editorial workerd / 103 recovery
Node / all 24 native recovery cases, plus three CSP checks and one existing skip.
Unchanged tasks use normal Turbo cache. Static review passes 33 sensitive paths;
the production bundle excludes local-owner markers across 344 files and source
drift is clean. Logs: `/private/tmp/anipotts-v3-main539-{install,validation}.log`.

Keep #541 draft. No operational cohort, artifact provider, key custody, external
copy, migration or restore-drill activation is authorized or established.
#542 is independently ready for review at `e4b4576f` with current-main full
validation, passing hosted checks and no runtime deploy targets; approval remains
pending. The canonical preview is restored on released main with current
published v17 / 20 records. Its recovery and ownership observations are recorded
in [the local preview guide](local-integration-preview.md).

## October 19 main refresh after approved #539 release

Integration owner remains chat `01a14ffb-519c-73b1-a63a-380f9d7274d0`, Codex on ap-pro.
This current checkpoint supersedes the pending #539 approval/release statements
in the preserved revision-specific packets below.

Ani approved #539 at `f8e90810c3e75fcd9e6982f2bd57c76bae1b6e69`.
It merged as `cf7b757be2c0bfc72d9886a27599e615b7ec3b66`; the integration owner
verified the merged tree is identical to the approved tree.
[Release 39272399483](https://github.com/anipotts/anipotts.com/actions/runs/39272399483)
succeeded for Admin only. The other five runtime targets were skipped; schema
remains `0044`, with no migration. Provider readback verifies Admin version
`ab08369b-bd13-4eb4-aeb0-f544384fb7b9`; all eight private-route probes return
302 to Access, and the deployable bundle contains no local-owner marker in 344
files. The public site remains on `79592009`, reporting healthy with D1
connected. No deploy approvals remain pending. These are the integration owner's
release receipts, separate from the source merge performed for #541 here.

The #541 refresh normally merges this approved main into its previously pushed
`7fc1589b97b85e05747628fbd20040ed6cbd6b12` checkpoint. Both histories are
preserved. Only README and this packet need conflict resolution; no recovery
runtime compatibility edit is required. Earlier full/source/native evidence
applies to its named revisions. The refreshed combined tree remains unqualified
until the owner schedules its checks; this worker runs no tests, build, preview
or browser and does not push or update the PR.

#540 and #541 remain inactive draft foundations. Operational recovery admission
still always rejects; migration `0003` is unapplied. No production capture route,
artifact provider, operational key custody, external copy or restore drill is
established. The local browser key-file acceptance does not grant operational
backup custody. The [offline recovery contract](design/admin-workspace/offline-recovery-contract.md)
retains the qualified v3 evidence and those release gates. #542 remains a
separate tooling draft undergoing refreshed owner qualification; it selects no
runtime targets. No approval for #541 is inferred from the approved #539 release.

## Preserved historical checkpoint packets

The following dated packets retain their original source, checks, failed runs
and decision provenance. Their pending approvals and candidate exclusions describe
those checkpoints, rather than current release state. Use the current checkpoint
and root README for active actions.

## October 19 recovery v3 qualification and review queue (historical checkpoint before #539 merge)

Owner chat: `01a14ffb-519c-73b1-a63a-380f9d7274d0`, Codex on ap-pro.
This checkpoint supersedes the pending-release and recovery-format limitations
in the older October 18 and earlier source packets below.

- #538 merged as `795920090a594dbf347e2c7de35967e6d1ee76bb`.
  [Release 39209913406](https://github.com/anipotts/anipotts.com/actions/runs/39209913406)
  succeeded for all six approved targets; no migration was selected, schema
  remains `0044`. State's producer status and Brands freshness remain separate
  operational issues, rather than a claim that every service is healthy.
- #539 is ready at `f8e90810c3e75fcd9e6982f2bd57c76bae1b6e69`.
  Exact-head CI, Security Review, CodeQL and completed automated code/security
  reviews passed, with all conversations resolved. Full local validation and
  all 42 Chromium/WebKit browser cases passed. Ani's exact review is pending;
  its proposed release affects Admin only. No merge/deploy is claimed.
- #540 remains a draft inactive media-processing foundation. The current
  `de4f9fcf` documentation head preserves its fully checked runtime.
  Actual provider entitlement, resource qualification and activation remain open.
- #541 adds an inactive encrypted v3 capture/restore path to the existing
  coherent recovery foundation. It supports streamed 10 MiB objects in each
  media plane and structured control data without the legacy base64 envelope
  limitation. The legacy v1/v2 formats retain their original bounds.
- #542 is a separate draft dependency cleanup at `e6aafc63`, with fully
  qualified source `e9578615`. Removing the unused Drizzle CLI eliminates the
  remaining moderate advisory. The lock audit has zero moderate/high/critical
  advisories and one low upstream KaTeX advisory. No runtime targets are selected.
  Refresh against later approved main before preparing exact-head review.

Operational recovery admission still always rejects. Migration 0003 is unapplied;
no production capture route, artifact provider, key custody, external copy or
restore drill is established. Browser recovery's accepted local key file does
not authorize operational backup custody. The full source/native evidence and
remaining gates are in the [offline recovery contract](design/admin-workspace/offline-recovery-contract.md).
Keep #540, #541 and #542 draft until their respective gates are met.

## October 19 archive and lock-mapping repair (historical checkpoint)

## October 19 browser recovery release and dependency refresh

Ani approved #539 at `f8e90810c3e75fcd9e6982f2bd57c76bae1b6e69` for merge
and Admin-only deployment in owner chat `01a14ffb-519c-73b1-a63a-380f9d7274d0`.
Live strict protection and the active no-bypass ruleset were reread immediately
before merge `cf7b757be2c0bfc72d9886a27599e615b7ec3b66`; its Git tree equals
the reviewed tree. Exact-head CI, Security Review, CodeQL and both completed
automated reviews passed, with all ten conversations resolved.

[Release 39272399483](https://github.com/anipotts/anipotts.com/actions/runs/39272399483)
succeeded. Only Admin deployed; www, ingest, newsletter, state and weekly email
were skipped. Schema remains `0044`; no migration ran. The same approval covered
both staged native Production gates. Provider readback verifies Admin version
`ab08369b-bd13-4eb4-aeb0-f544384fb7b9` at the expected release/schema.
All eight private-route probes return 302 to Access. The deployable bundle
excludes local-owner markers across 344 files. Public health remains healthy on
www release `79592009` with D1 connected. Physical-device key custody and
authenticated production content writes are separate acceptance, not claimed here.

#542 normally merged that released main at
`b66c00abcd9d93e01b9d48290cd39405e05db40f`. Its own runtime delta remains
only removal of unused Drizzle CLI tooling; schema, SQL, journal, ORM and active
runtime versions are preserved. Independent source review is clear. A fresh
offline frozen install and full `pnpm validate` pass all fourteen tasks,
including fresh Admin 2,465 core / 79 Astro / 98 editorial workerd and three CSP
checks plus one intentional skip. Other unchanged tasks use normal Turbo cache.
Post-validation drift and the 344-file local-owner scan pass. The exact changed
paths pass static review, and all six runtime deploy targets are false.

Logs: `/private/tmp/anipotts-drizzle-main539-{install,validation}.log`.
A fresh exact-lock audit, `/private/tmp/anipotts-drizzle-main539-audit.json`,
reports zero moderate/high/critical advisories and one low upstream KaTeX issue.
Subsequent checkpoint changes are documentation only. Hosted exact-head checks
and Ani's review still gate #542; no merge approval is inferred.
Earlier pending #539 and old dependency receipts below are historical.

## October 19 unused dependency cleanup, original qualification

#538 is merged as `795920090a594dbf347e2c7de35967e6d1ee76bb`; approved deployment [39209913406](https://github.com/anipotts/anipotts.com/actions/runs/39209913406) succeeded for all six targets with no migration. Provider identities, public smoke and admin Access boundary proof pass. State/Brands producer health gaps remain separate.

Separate draft [#542](https://github.com/anipotts/anipotts.com/pull/542), source
`e9578615b27f8eb5d7f6885415b4c2d3868985c4`, removes unused `drizzle-kit` and its
legacy loader chain from main `79592009`. The historical configuration remains
plain data; drizzle-orm, schema, SQL, migration manifest and journal are preserved.
Retained package versions and other importers are unchanged. The retained
`tsx` snapshot becomes optional after CLI removal. No forced out-of-range
override is used.

A fresh isolated offline frozen install and full `pnpm validate` pass all 14
workspace tasks: Admin 2,361 core / 79 Astro / 98 editorial workerd / three CSP
with one intentional skip, and content 206. Frozen lock consistency, native config
import with exact historical values, D1 documentation, dependency maintenance,
formatting and static security pass. Tracked build drift is absent. Logs are
`/private/tmp/anipotts-drizzle-cli-{install,validation}.log`.

The exact lockfile audit has zero moderate, high or critical findings and one low
KaTeX advisory. The active UI SDK still requires the affected math dependency;
current app callers leave math disabled. This bounded source observation is not a
claim that all prototype pollution or all bundle reachability has been audited.
The compatible upstream repair remains open. Audit evidence is
`/private/tmp/anipotts-drizzle-cli-audit.json`.

This draft is separate from #539 and the canonical UI candidate; it has no merge
or deploy approval. #539's `b29fb42e` hosted CI / security / zero-finding CodeQL
checks pass, but its approval request is withdrawn after a later quota-failure
review. An unchanged duplicate archive can survive a failed canonical replacement;
that focused repair and refreshed exact-head qualification must precede review.
No new approval supersedes these holds.

## October 19 latest archive and lock-mapping repair

Source `3e22ecb13ad0f9d659d740f5884e6b0792276437` preserves the archive created by the
current explicit recovery choice while retaining the existing three-archive bound.
Random UUID ordering cannot immediately remove that displaced ciphertext. Missing
Web Locks reports unavailable for a valid document; closed or revoked channels
report signed-out consistently on reads and writes. Closing expiry capabilities
retain their existing admission semantics. All45 focused native-crypto/storage
cases and strict typing pass. Both primary regressions fail on prior source;
five successive lowest-UUID choices preserve the latest displaced ciphertext,
foreign-key records and exact encrypted export while keeping three owned archives.

The earlier `78a6b01f` full validation (14tasks /2,460core),42 browser cases,
CI39223093838, Security Review39223093725 and zero-finding CodeQL39223058028 pass.
Its completed code review then found these two issues; no approval was requested
for that head. Full/browser/hosted checks, canonical identity and completed
current-head code/security review must qualify this new source before exact
review. Earlier613/b29approval requests remain withdrawn. This candidate is
admin only, schema0044, no migration; #540/#541/#542 remain excluded.

## October 19 bounded storage-fault candidate

Source `0f4be166df869dbf615dd7002b89d395a4d561f5` combines the explicit-choice archive
cleanup and the subsequent capture-failure repair. The prior `b29fb42e` approval
request remains withdrawn. All40 focused native-crypto/storage cases pass.
After appending a capture, validity/read/prune failure best-effort removes only
this attempt's exact unchanged new entry. Changed older or new bytes are
preserved; an older-entry mismatch cannot report success with an unreadable fourth
capture. Old copies are never removed before a durable new insert. A one-shot
storage fault leaves the original three captures readable after unlock and allows
retry. If storage continues refusing cleanup, failure is explicit and all opaque
bytes remain exportable; no successful seal or readability guarantee is claimed.

Full validation, clean Chromium/WebKit qualification, current-head hosted checks
and review are the remaining gates. The owner will record their exact frozen-head
receipts in #539 without another documentation-only head change. This remains
admin only, schema0044, no migration. Inactive #540/#541 and tool-only #542 are
excluded. The canonical preview is updated only after qualification; no merge or
production approval is inferred.

## October 19 quota repair and refreshed candidate

The `b29fb42e` approval request is withdrawn. Its full hosted CI39220395722,
Security Review39220395857 and zero-finding CodeQL39220352886 pass, but a later
08:15 UTC review found a quota failure that can retain an unchanged duplicate
archive after explicit-choice replacement fails. Source `3ba1f6f068d99c848bfa5fbb40973209c6b49d9a`
reclaims only this attempt's unchanged archive on replacement failure; inaccessible
or changed bytes are preserved and cleanup cannot mask the original storage error.
All31 focused native-crypto/storage cases pass, including quota, exact source and
archive preservation, retry, changed archive and cleanup read/remove failure.
Combined full/browser checks, canonical preview, refreshed hosted checks and
current-head review must pass before a new exact approval request. The integration
owner remains this chat; no new merge/deploy approval is inferred.

Separate draft [#542](https://github.com/anipotts/anipotts.com/pull/542),
`35a80beced177dba2195b297575f4f2aadcbf718`, removes unused Drizzle CLI tooling on
main795 without schema/SQL/journal changes. Its isolated frozen install and full
validation pass all14 workspace tasks; the exact lock audit has zero moderate,
high or critical findings and one low upstream KaTeX advisory. It selects zero
runtime targets. That draft and inactive foundations #540/#541 remain excluded
from this candidate. Source and receipt details are in their same-repository PRs.

## October 19 combined qualification and CodeQL fixture repair

Frozen `1b04edf453d15beeb057683dedcf483d812ee35a` passes full `pnpm validate`:
all 14 tasks, including 2,447 Admin core / 79 Astro / 98 actual editorial workerd
and three CSP cases plus one intentional skip. Its clean maintained Admin browser
run passes 42/42 Chromium/WebKit cases, including real immediate Back, unlock and
exact title/custom-address restoration. Public browsers pass 13 cases with one
intentional desktop skip. Production local-owner scan passes all 344 files;
tracked source stays clean and task ports 8873/18123 have no listener afterward.
The canonical preview was fast-forwarded cleanly to this checked source, with
published mirror v17 / 20 records current and no status blockers.

A later CodeQL review of this head reports alert 36, `js/bad-code-sanitization`,
in synthetic setup-fixture JavaScript construction. Test-only `39e1841c` replaces
runtime-interpolated program bodies with static programs and separate JSON data.
All 16 process/config fixtures pass, including quoted / space / newline paths,
JavaScript-looking configuration values and actual forced shutdown. The runtime
harness and app source remain byte-identical to `1b04edf4`; its browser proof
therefore remains applicable. No suppression, dismissal or protection change is
used. Refreshed exact-head hosted checks and CodeQL alert clearance still gate
review; no later merge/deploy approval exists. The earlier `613b5711` request
remains superseded.

Logs are `/private/tmp/anipotts-recovery-later-review-validation.log`,
`/private/tmp/anipotts-recovery-later-review-admin-browser.log`,
`/private/tmp/anipotts-recovery-later-review-public-browser.log` and
`/private/tmp/anipotts-recovery-seeding-static-focused.log`.

## October 19 integrated later-review repairs

The superseded `613b5711` approval request remains withdrawn. The three later
review findings are implemented in the integration candidate; combined full,
actual-browser and hosted qualification follows before a new exact-head request.
No merge, auto-merge or release approval is inferred.

- Navigation source `59cf0d0f` marks typed input unsafe synchronously, awaits a
  local durable recovery barrier before anchor or requested navigation, and fences
  stale input/intent, expiry, logout and unmount. Full-document unload warns while
  input is pending or recovery fails. Article/project creation routes do not host
  the library's SPA router, so no speculative history-index framework was added.
  Follow-up `92f94b27` also protects restored CAS conflicts and clearing a durable
  title to empty; failed comparisons expose the existing explicit choices.
  Held-native-Web-Crypto regressions pass 38 cases including 25 existing; the
  original `613b5711` source fails the new early-unload assertion. Strict editorial
  typing and Astro checking pass. A new real-browser create/back/re-import case
  awaits owner execution in both engines.
- Shared-kit source `3e51ea50` moves the existing Writing control implementations
  into the workspace kit and keeps their 12 compatibility exports unchanged.
  RecoveryUnlock uses kit exports. Writing's buttons already rendered actual Apps
  SDK controls; the repair concerns ownership and the shared file field. The file
  input remains native because the installed SDK text-input wrapper performs
  selection operations that are invalid for files. No key/session logic, provider,
  scoped reset or portal boundary changes. Focused gate/control/hydration/portal
  checks pass 53 cases, with actual SDK and legacy variants.
- Harness source `35215453` handles cancellation before setup, awaits migration /
  media-upload / apply child shutdown, and removes temporary D1/R2 state afterward.
  Setup has task-owned POSIX groups; the final Worker remains in the runner group.
  All 15 focused fixtures pass, including six phase/signal cancellations and the
  installed runner's real forced stop against TERM-ignoring descendants. That case
  closes in 5,015 ms inside its 10-second budget and proves state/PID cleanup.
  Uncatchable wrapper termination is outside a cleanup guarantee; unconfirmed
  group closure preserves state rather than deleting it beneath a live command.

The root integration chat owns final qualification and canonical previews; workers
used separate worktrees and started no previews. Earlier exact-head CI proof below
is historical and does not cover these later edits. Source-protocol, physical
custody and operational backup acceptance remain distinct.

## October 19 later review hold and next foundation drafts

The `613b5711` approval request is superseded. Exact-head CI `39214447042`,
Security Review `39214446961` and CodeQL `39214419654` pass, but a later
07:23 UTC review added three findings. #539 is back in draft: the Writing
recovery gate must use the workspace kit, immediate new-writing navigation
can cancel a pending encrypted snapshot, and cancellation during synchronous
test seeding can skip temporary-state cleanup. GitHub's blocked merge state is
consistent with those unresolved conversations, not evidence that protection
needs weakening. Isolated workers own the three repairs; this chat remains
integration owner. Refresh source/browser/hosted checks and exact review before
admin-only release. The earlier `613b5711` CI proof remains valid historical
qualification, not approval of a repaired head.

The next foundations are now preserved as same-repository drafts:

- [#540](https://github.com/anipotts/anipotts.com/pull/540),
  `codex/media-processing-foundation`, head `de4f9fcfc`: full validation passes
  at `c70cff33`; later changes are documentation and a normal main merge, with
  runtime equality verified. Admin 2,405 core / 79 Astro / 113 actual editorial
  workerd / three CSP cases plus one intentional skip pass. The missing importer
  setup was repaired through an offline frozen install into its own physical
  dependencies, preserving shared targets. Static review passes nine sensitive
  paths. Actual provider entitlement/decode/crop/resource qualification and
  activation remain open.
- [#541](https://github.com/anipotts/anipotts.com/pull/541),
  `codex/editorial-recovery-capture`, head `94c1e727`: full validation passes
  at `2deb4fb0`, including fresh Admin test/type-check cache misses, 2,361 core /
  79 Astro / 105 editorial workerd / 84 recovery Node / 21 recovery workerd and
  three CSP cases plus one existing browser-gated skip. The new encrypted codec
  has 33 focused Node and four actual workerd cases, including bounded file-backed
  20 MiB transport, tamper/order/EOF, cancellation and final-ack checks. Independent
  review is clear; source is unchanged after qualification documentation. Actual
  Turbo helper-only probes reproduce stale test/type-check hashes before the
  input fix and invalidation afterward, restoring exact helper bytes. Static
  review passes 28 sensitive paths. Operational admission still rejects, older
  v2 size limits remain, and content-publication 0003 remains unapplied. Inventory,
  writer enrollment, format integration, custody/external-copy/restore gates remain.

These drafts activate no provider, collector or backup route. No operational key
custody, binding, migration, merge or deployment approval is inferred from source
qualification. Full receipts are in each draft and its maintained contract.

## October 19 qualified review repairs

#538 is deployed as `795920090` on all six approved targets, without migration.
No Production deploy runs were waiting when rechecked at this checkpoint.
#539's later candidate has no merge or admin-deploy approval.

All three confirmed hosted findings are repaired. Source `79865b9c` persists
contested expiry input separately, carries exact authenticated capture
acknowledgments through choices and tombstones, and maps storage exceptions to
recovery problems. Session fixes `2ea1ea36` / `da075297` revoke failed challenges
and interrupted setup without revoking a newer successful unlock. Independent
source review found no remaining blocker in these scoped fixes. Focused adapter
checks pass 157 cases; session/unlock checks pass 14.

Full `pnpm validate` passes at `7f11a40d`: all 14 workspace tasks, including
2,428 Admin core, 79 Astro, 98 actual editorial workerd and three CSP cases with
one intentional skip. The full local Admin browser run exercised 40 cases:
39 passed and one desktop assertion still expected superseded warning text.
Its failure screen showed the correct notice. Test-only `357ede55` corrects that
assertion; all four affected Chromium/WebKit lifecycle cases pass on rerun.
Application source is unchanged from full validation. All 40 maintained cases
therefore have passing coverage with that focused rerun; this is not a claim of
a separate clean 40-case run at the later test head.

The public browser suite passes 13 cases with one intentional desktop skip at
`357ede55`. The initial hosted CI `39211183263` had passed application checks and
84/84 CMS route proof before EADDRINUSE at browser startup. Its log identifies
no occupying socket or PID. Harness fix `14206fcc` uses one shared test-owned
18123 HTTP port, a validated override, an OS-assigned inspector, refusal to reuse
foreign listeners and child-close-aware cleanup. Six real runner/process fixtures
and the actual two-engine public suite pass. Final cleanup finds no task listener
on 8873 or 18123. Static review passes all 13 affected sensitive files; validation
preserves tracked source. The older failed logs are retained.

Logs are `/private/tmp/anipotts-recovery-review-fixes-validation-final.log`,
`/private/tmp/anipotts-recovery-review-fixes-admin-browser.log`,
`/private/tmp/anipotts-recovery-review-fixes-lifecycle-final.log` and
`/private/tmp/anipotts-recovery-review-fixes-public-browser.log`.
Refreshed exact-head hosted checks, current canonical preview and Ani's review
remain release gates. The target is admin only, schema 0044, no migration.
Physical-device key custody and authenticated live owner writes remain separate.

The next foundations remain isolated and inactive:

- Media branch `codex/media-processing-foundation` is pushed atc70cff33;
  runtime source38a9a270 passes44 Node and27 actual workerd cases, full editorial
  generated-types checking and formatting. Original/derivative/provenance/request
  receipt commit atomically, with bounded native byte snapshots and immutable
  replay/corruption checks. Provider activation, whole-app resource qualification
  and recovery-format support remain open. A read-only Images usage probe returns
  provider5403 (account invalid or service not authorized); entitlement is unverified.
- Capture branch `codex/editorial-recovery-capture` is pushed atc99b8edd after
  normal main795 merge. Full validation passes at33992467: public196/content206,
  Admin2361 core/79 Astro/101 actual editorial workerd,51 recovery Node and21
  capture workerd,3 CSP cases plus one intentional skip. The initial CI-path
  scope failure was corrected by four exact registry/assertion lines; its failed
  log remains preserved. New plaintext transport uses64KiB frames, incremental
  hashes, awaited backpressure and final-manifest validation;33 Node and3 native
  cases include10MiB in both planes without retaining a whole20MiB test buffer.
  It is not encrypted backup or operational capture integration. Legacy v2 limits,
  disabled cohort admission, custody/external-copy/restore gates and unapplied
  content-publication0003 recovery-fence migration remain explicit.

## October 19 approved consolidation release and recovery scheduling repair

Ani approved #538 at `2b797fb5d4a10a4aa63788ac63ed140b31cd8a26` and
all six targets in owner chat `01a14ffb-519c-73b1-a63a-380f9d7274d0`.
Exact-head CI39196056419, Security Review and CodeQL passed; there were no
unresolved review threads. Strict live main protection was reread immediately
before protected merge `795920090a594dbf347e2c7de35967e6d1ee76bb` at
2026-10-19T06:26:22Z. Direct Git tree comparison proves the merge content is
identical to the approved candidate. [Release39209913406](https://github.com/anipotts/anipotts.com/actions/runs/39209913406)
passed exact validation and selects www, admin, ingest, newsletter, state and
weekly email. D1 is unchanged, schema0044, no remote migration selected.
The same approval was applied to the staged native Production gates. The run
succeeded, and all six runtime targets deployed; none was skipped. No migration ran.

Native Cloudflare readback confirms these versions active at100%:

| Target       | Active version                         |
| ------------ | -------------------------------------- |
| www          | `ffa67ab0-d74c-42ca-8099-87adc1067fd2` |
| admin        | `d9a482ec-438b-42a0-bcfe-cc4e93c264c9` |
| ingest       | `35327197-09ec-4886-8ea8-6bb38472b845` |
| newsletter   | `a405b42d-e04d-4433-ac9b-9ea2442c70a0` |
| state        | `aa8d4bf1-94c4-4c26-b22c-4cd1c9a6c16a` |
| weekly email | `8fe78741-5a4a-46ce-b1df-e94bfa0c6919` |

The active admin version message names release795920090/schema0044. Public
exact-release smoke passed all current22 HTML routes plus security-header and
redirect probes. The release's eight admin private-route probes redirect to
Access; authenticated owner writes are not claimed. The deployable bundle scan
finds no local-owner marker in344 files. Direct public health at06:31:43Z reports
795920090/oktrue, D1 connected. Newsletter health is200/oktrue; state remains503
and ingest200/degraded from their separate producer freshness gaps. Weekly email
is intentionally410/retired. No deliberate newsletter send or producer mutation
was performed.

#539 is retargeted to main and kept in draft during the next qualification.
A held-lock probe of source3a3a561f retained24 legal serialized snapshots totaling
9,440,376 bytes, then encrypted every stale copy. Fix6a8572cc bounds ordinary
writes to one active and one latest pending copy. Superseded promises have an
explicit outcome; at most four durable/choice/tombstone barriers preserve
ordering and failure reporting. Closing capture supersedes obsolete pending
work within the existing capability and1.5-second expiry cutoff. Consumer
sequence guards prevent stale completion from clearing newer failures. Focused
qualification passes127 cases, including native crypto flooding, immutable
capture, ordered barriers, bounded admission and expiry supersession.

The65,536-nonce lifetime limit remains fail-closed. A maximum-sized repeated
payload can reach it during a long editing session; actionable save/reload
messaging and encrypted-export failure handling landed in c877a112 with77 focused tests passing. HomeEditor retains its explicit plaintext Markdown source action; NewWriting names its actual Create draft control.
This is an availability limit, not a nonce-safety bypass. Earlier receipts below apply to their stated revisions.

Final current-source qualification at
`d0f31d094d9ad9a8dc89cffda2e6f32bc1180a00` passes full `pnpm validate`:
all invariants, formatting, six builds, four lint tasks, fourteen typechecks
and fourteen test tasks. Admin passes2,408 core,79 Astro,98 actual workerd and
three CSP cases with one intentional CSP skip; public196 and content206 pass.
All38 maintained native browser cases pass in desktop Chromium and phone
WebKit (run01a152df-c30e-78cb-80c9-4891f73f66bf). This includes the real native
Web Lock flood:24 legal128KiB source/saved/pending payloads produce22 explicit
supersessions and exactly two committed ciphertexts, with exact decrypted
first/latest content after caller mutation. Existing key-file, expiry, two-tab,
logout, pagehide/history, hydration, metadata and media journeys also pass.

Actual changed-file static security review passes9 sensitive files. The
production bundle scan finds no local-owner marker in344 files; source drift
checks pass after validation and browsers. The task-owned8873 server has ended.
The classifier selects admin only: www and all four workers are false, D1 is
unchanged/schema0044, no migration. Final documentation only records this proof;
hosted main checks, canonical review and exact Ani review still gate release.

## October 19 encrypted browser recovery checkpoint

Integration owner remains chat `01a14ffb-519c-73b1-a63a-380f9d7274d0` on ap-pro.
[#538](https://github.com/anipotts/anipotts.com/pull/538) is frozen at
`2b797fb5d4a10a4aa63788ac63ed140b31cd8a26`. CI39196056419, static Security
Review and CodeQL pass; native code/security review found no findings. The exact
#534/#535/#537 heads are included and those superseded PRs are closed. #538 still
awaits Ani’s exact merge/deployment review for all six runtime targets, no migration.
The canonical preview remains clean at this head: www127.0.0.1:4580,
adminlocalhost:4311, current published v17/20-record mirror checked04:12:48Z.

The next batch is [#539](https://github.com/anipotts/anipotts.com/pull/539),
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

Final combined local validation and all36 native browser cases passed at
`1940a48411309295f0faad8d292b1c62218a98f0`. The subsequent format-tag metadata
rename at `efae677d` preserves serialized bytes and resolves the hosted scanner’s
public-label false positive. Actual changed-file static review passes for9
sensitive files, strict editorial TypeScript and38 affected tests pass; affected
native cases are refreshed separately. PR539 is ready for hosted full checks,
while the main-base and canonical-preview gates below remain outstanding.

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
