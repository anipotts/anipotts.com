# Next website source batch

October 10, 2026. Current main: `988b7edfebe26593725216c08ff715d2e5bb67b2`.
This packet grants no main merge, Production approval, CMS write, deployment,
protection, feature-flag or credential change. Source repair and normal branch
refreshes remain approved.

## Release and source reconciliation

#521 [run38025022414](https://github.com/anipotts/anipotts.com/actions/runs/38025022414)
succeeded at `1ccc08da95b7cddd0f766bf86f436c56341eb5fc`: www/admin only,
no separate Workers, D1 migration or CMS writes, schema `0044`. Visible-card
GET/HEAD returned 200 PNG; two absent cards returned 404 with `no-store`.
Signed-in listing, unchanged editor, preview revision105, history and public
article rendering passed without writes. Ani need not repeat these reads.

#510 auto-merge was enabled05:28:01UTC by GitHub account `anipotts` and executed
06:01:33UTC as `8a197427`, incorporating #520 ancestry. The actual human/agent
and approval reference are unproven. This chat did not enable auto-merge or
directly merge. [Deploy38029505907](https://github.com/anipotts/anipotts.com/actions/runs/38029505907)
succeeded with Production and all six deployment targets skipped.

#512 merged elsewhere06:32:28UTC as `988b7edf`; this chat performed neither
that merge nor any Production approval. Its exact release validation passed,
but [Deploy38031295743](https://github.com/anipotts/anipotts.com/actions/runs/38031295743)
is waiting at its initial Production gate. Its four Worker changes are source
on main, **not proven deployed**. Observed source execution grants no authority.
Later automatic refreshes enabled auto-merge on #513/#515; this chat returned
both to draft and verified auto-merge off. #514/#518 were also held as drafts.
No later Production release has been authorized here.

The waiting run is exactly38031295743 at988b7edf. The global
`production-release` concurrency group has `cancel-in-progress:false`; manual
dispatch shares this queue and the Production gates. No later release can pass
until this active run ends through an explicitly approved decision. No cancel,
reject, approval or replacement was performed by this chat.

An independent read-only prospective507 witness against988b produced tree
`9576d09e25cc3d6800c9c150ae1e78b06d89352b`: the event diff is admin package/lock
only. Although cumulative source differences from live1ccc include the four
Worker changes, the current planner cumulatively adds only www. Its final plan
selects admin only, not those Workers or D1. Withdrawing512 would therefore not
deploy its Worker changes or mark them released. Recompute on507's actual fresh
integration commit. Sequence507 before516 when preserving an admin-only packet;
unreleased516 public-app changes could otherwise add www cumulatively.

## Exact source packets

B/S/Q means Build, Security Review and CodeQL. Historical green checks on a
head behind main are not current-main readiness. A draft's intentional Build
gate failure is separate from software validation.

| PR   | Source head                                | Current checks/disposition                                            | Own delta against current main              |
| ---- | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| #507 | `5abafb4b4d8c3d8207a3cb863c5e3a580c45b4ba` | previous B/S/Q pass; now behind; separate owner                       | admin                                       |
| #509 | `d698b76e3e47f557139f7fb1192a7e1d517a8b57` | fresh B/S/Q pass, current main                                        | admin/state                                 |
| #512 | `f99e1351187898116b8a4f2dffdbb9ef89478308` | merged as988b; Production held                                        | four Workers                                |
| #513 | `f25395ccc81e9e617fd96eaf1ce47f12a20b8e6a` | draft; full admin typecheck and201 tests pass                         | admin                                       |
| #514 | `5b60c9173b1e53f92d3f465f1d61cca2b6fe8e97` | draft; fresh light/drift/S/Q pass; full typecheck/169tests pass       | admin                                       |
| #515 | `a58a5d68c9a984f268f14914e70e1637f0c4d898` | fresh B/S/Q pass; draft held                                          | www/admin                                   |
| #516 | `1b67cce0914fa68866163d22438af9ad12ac0a80` | fresh B/S/Q pass, current main, peer review                           | www/admin                                   |
| #518 | `6eeec4c89af9a3aef1b2e79b82c9a59343258147` | draft; fresh light/S/Q pass; refreshed main/515                       | www/admin                                   |
| #522 | `93b437ab3bfd978333c5a5477c6bcd904ce84503` | feature draft;27 CLI/offline tests pass; fresh remote checks required | broader feature; recalculate before release |
| #523 | `f61add4d71b4d4bd77b9ac6c9f342e320f0ae1e5` | fresh B/S/Q pass, current main                                        | all six                                     |

None of these existing plans selects D1 changes or remote migration; schema
stays `0044`. Targets describe source deltas. Final deployment may include
unreleased main changes: recompute the exact integrated planner with current
live health before seeking approval. #512's pending four Worker release must
not be silently incorporated into an admin-only approval.

#505 is closed, superseded by #523 retaining fourteen updates. Guarded Jiti
compatibility and documented direct theme commands pass. #519 is merged; its
privacy-safe cardinality correction (seven individually listed plus five
grouped projects =12) is prepared in #524, not claimed live.

## Repair and independent evidence

#509 preserves browser-number/Node timer handles and cancellation of handle
zero:81 focused tests and scoped typechecks pass. #514's eight pinned-System
drift mutations pass. Preserve these fixes in every reader downstream tree.
#513 now imports the generated events route for builder and credential gate;
its changed-pin regression rejects old-route/raw and new-route/json calls.
Unrelated state Node26 edits were removed from its admin-only delta, restoring
current-main Node22 plus the main512 runtime dependency.201 focused tests and
eight drift/mutation cases passed. Full combined lint caught a test-only overload union error. Repaired literal
raw/json calls pass full Astro check (417files, zero errors/warnings), editorial
typecheck and201 reader tests.514 strict refresh and state-scope cleanup pass
frozen install, full Astro check (416files),169reader tests, state typecheck and
eight drift checks. Merging514 into513 produces exactly513's tree.

#512's throwing-predicate catch and build-source edge pass21 tests. #516's
runtime folder is byte-identical to512. Peer independently passed111 focused
tests (74admin plus37shared/www), reviewed once-only reads, redacted bounded
reports, preserved health semantics and unchanged Worker protocol/bindings.
Its12-file remaining delta selects www/admin only against main988b.

#515 compiles actual contract pins (TS2344 negative mutation). Turbo now hashes
public content, generator and compiler configuration; actual changes produce
independent misses and restoring each input restores the hit.13 contracts pass;
review findings are resolved. #518's active-CMS social-card gate and public-only
layout guards reject wrong-loader/CMS-source mutations. Refresh preserves these
trees rather than assuming a simple branch ancestry chain.

#507's independently reviewed importer/lock diff changes admin React/DOM/types
19.3 only, with unrelated metadata preserved. It has no prerequisite on524.
The broader candidate retains React19.2.8; adding507 requires fresh validation.

## Bounded next decisions

#507 remains a separately owned admin dependency packet: refresh strict main
and exact checks before an explicit source and later Production decision.
#516 is the smallest current green app runtime packet, with www/admin own delta
and111 independent tests. #515 is a separate green content/cache packet held
as draft;518 follows only after source approval, strict refresh and fresh checks.
Reader order is509 →514 →513; scope and lock must be normalized to then-current
main after each approved merge. #523 is a separate all-six dependency/theme
packet. Do not advance main while another exact-head packet awaits execution.
No green PR or batch recommendation authorizes execution.

Exact required Build evidence: [#509](https://github.com/anipotts/anipotts.com/actions/runs/38031743084/job/114153980489),
[#516](https://github.com/anipotts/anipotts.com/actions/runs/38031614077/job/114153581997),
[#523](https://github.com/anipotts/anipotts.com/actions/runs/38031721727/job/114153925628).
Security Review, aggregate CodeQL and all language analyzers also passed on each
listed exact head. No workflow rerun, cancellation or source merge was performed
to obtain these results.

## Combined draft and completion gaps

Draft524 assembles source; it is not a bulk merge/release request. Fresh full
validation passed on exact `61008624dc2013759c065f2665f18e04f244dc2b`, tree
`965ad7afe45d5323af1ff788618d2a7e833e618e`, including current main988b.
Policy/migration checks, formatting, six builds, four lint tasks, fourteen
typechecks and fourteen test tasks pass using normal Turbo caching:
2296admin/79Astro/98editorial/202content/192www; CSP2pass/1skip. Unchanged
application tasks were cached; new27 CLI/offline tests ran afresh.
The new reader overload regression is repaired, not cast away. Standalone
reader branches match main Node22; the broader assembly retains509's separate
Node26 update and523's newer tools, with the previous combined lock byte-identical.
The current tree includes the nine-file browser recovery repair and four-file
offline recovery adapter/test/doc increment.
Later packet updates preserve production executable blobs. A test-only follow-up
derives the synthetic content path from its record identity after the static
scanner flagged its literal `key` assignment. The scanner is unchanged; both
complete PR diffs pass local Security Review, and the updated CLI/offline suite
passes27 tests. The only non-doc difference from61008624 is that fixture change.
Proofs: `/tmp/anipotts-offline-recovery-combined-validation.log` and
`/tmp/offline-recovery-ci-integrated-proof.log`. Remote draft Build gates remain
intentional failures; fresh Security Review must finish on the final heads.

522 is retained as a separate feature draft, not superseded by524. Native CLI,
shared settings and bounded media admission are implemented in source. Real
pixel decoding, sanitized derivatives and durable crop provenance are agent
software work, currently under isolated resource qualification: stock WASM
codecs at16MP exceed Workers128MiB in the measured PNG probe. No smaller
default upload cap is activated. The actual built-Worker/DO functional probe
passed. An allocation calibration established disjoint WASM/backing-store
counters for this runtime; held-buffer warmed-codec estimates still reached
about148–167MiB at1MP. Unqualified garbage collection, transient peaks and cloud
limits prevent a safe processing-limit claim.
Browser recovery now captures current buffered input and retry identity;
110 focused tests, compiler checks, mutation proof and independent review pass.
Supplied-snapshot export/reference validation, caller-key AES-GCM envelopes and
suspended synthetic restore pass27 tests, including105 revisions in canonical
SQLite schemas. Independent review and omitted-table/missing-public-media
mutations pass. A standalone522 dependency defect was fixed and27 tests pass
without518's helper or installed packages. Live consistent capture, provider
export/import adapters and operational recovery remain unfinished software and
integration work; this is not operational backup proof. These are not tasks
for Ani to manually verify in lieu of fixing software.

User-only boundaries are named-record private draft-save permission; separate
publish/unpublish content intent; exact Knowledge/Health source/credential
access; unavailable physical-device interaction; protected backup destination
and key custody; and later exact merge/Production decisions. Existing signed-in
reads need not be repeated. Finance/persistent personal agent remain future
scope. Staging currently aliases production; retirement needs fresh provider
inventory and separate DNS/resource authority.

Cloud enforced revision12 still lacks website/Cloudflare hosts and identities.
This chat has no configuration-write or cross-chat send tool; no direct delivery
is claimed. Paste the [setup handoff](cloud-environment-setup-handoff.md) into
Edit build, publish settings and verify a fresh enforced configuration.
