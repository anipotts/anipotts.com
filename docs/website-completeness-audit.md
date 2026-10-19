# Website completeness audit

## Current reconciliation, October 18

Current source base: `0517843d68a1ed47e6e76c8bcff34e9923a945ef`. This current
section supersedes historical status claims below; dated findings/evidence stay
preserved. #529/#530/#531 are merged and deployed. #532 is merged; its exact
release selected zero runtime targets because it changes test tooling/docs.
There are no old Production approvals waiting. See the [release receipts](website-source-preparation.md).

The remaining software work is finite:

| Action                                          | Current disposition and acceptance                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin scroll indicators and cold record loading | In the next review batch: native indicators across main/editor/drawers; one stable loading announcement through lazy module + record fetch, with failure/retry preserved. Measure current navigation/layout behavior, not obsolete speed-plan routes.                                                                                                                                                            |
| Writing source/artifact controls                | In the next review batch: edit existing URL/label/type fields normally; preserve optional YAML, comments and body; review labels match public output.                                                                                                                                                                                                                                                            |
| Dependency consolidation                        | In the next review batch: #534/#535/#537 (which supersedes #536) containment, whole-family Tiptap peers, Node24 declarations, guarded theme generation and zero high/critical audit findings. Two upstream advisories remain.                                                                                                                                                                                    |
| Media qualification and lifecycle               | Current upload admission is10MiB/16MP and does not prove server pixel decoding. Real synthetic browser upload/crop/stored-preview/original-retention coverage is being added. The held1MP WASM prototype has no safe128MiB full-Worker memory bound; do not lower existing limits or introduce paid processing silently. Server decode/provenance remains open until a qualified implementation is demonstrated. |
| Portable recovery capture/restore               | Existing supplied-snapshot validation/encryption and memory restore are implemented. Real DO/D1/R2 capture requires a durable common fence, drained writers, complete schema/media inventory, suspended restore and interrupted-install proof. Implementation is isolated for local synthetic qualification; no production capture route, credentials or activation.                                             |
| Browser recovery encryption                     | Current owner-scoped recovery values/downloads are plaintext. Authenticated reentry, old-format preservation, lost-key behavior and two-tab expiry/logout require a reviewed key/unlock design before runtime wiring. Existing logout fencing is implemented.                                                                                                                                                    |

Reserved live gates stay separate from source completion: exact merge/release
review; named-record authenticated draft-write acceptance; physical IME/mobile
keyboard/resume/screen-reader acceptance; Knowledge/Health source/credential
grants; backup destination/key custody and operational restore drill; provider
Access/host/DNS cutover; state/Brands producers/collectors; newsletter-send
semantics. None is implied by green tests. Read-only investigation may proceed
without changing their providers, private content or credentials.

Explicit product deferrals remain deferred: multi-record publication, schedules,
published slug redirects, permanent staging, page builders, Finance/persistent
personal agent and a personal cloud replica. Existing single-record publication
continues to reject unsupported effects. Public story rewrites need evidence and
Ani's editorial intent; software work does not authorize new published claims.

Completed/superseded findings: shared site settings, homepage ordering/visibility,
project card metadata, public source links, missing/error/timeout preview states,
editor transaction serialization, upload cancellation, ancient conflict replay,
page edit-capability mapping, retired native auth/GitHub publisher/MCP routes,
and old logout/theme/navigation findings. Current source and #529/#530 receipts
cover these; the old hashes below are historical evidence. Per-article social
imagery is superseded by the approved canonical brand card, whose invariant is
tested. Its ignored legacy prop/seed lookup is removed in the next batch.

## Historical assessment, October 10

Assessment date: October 10, 2026. Baseline: GitHub main
`b1c2928c443f7f8677a82b092e01333ab95b5094`.

## Scope and authority

Ani requested a comprehensive assessment, fixes and live deployment. The current
scope is Content, Data and Observability with the existing Cloudflare Access
owner sign-in. Finance and a persistent personal agent remain future ideas.
Published wording stays unchanged. Coding-agent authoring support is software
scope; this assessment does not authorize publishing new prose.

Ani's October 10 approval at 04:59:49 UTC limits the current phase to source
preparation. Production approval and subsequent deployment remain separately
gated. See the [source preparation record](website-source-preparation.md) for
the validated integration tree and exact repair heads.

At 05:28:41 UTC Ani separately approved the existing #521 release at
`1ccc08da`, www/admin only. The designated React repair chat is its single
executor; this chat performs no duplicate approval or deployment. All subsequent
production releases remain separately gated.

The assessment covers this repository, accessible website chat history, GitHub
pull requests/checks/deployment records and the separate agents/labs repository
records. The cloud environment cannot inspect uncommitted Mac worktrees. Their
private drafts and canonical integration preview remain untouched.

## Latest completion checkpoint

The exact #521 release at `1ccc08da` is live on www/admin, with visible/absent
share-card and signed-in read acceptance passed. The #510/#520 source merge
`8a197427` selected no deployments. External #512 source merge `988b7edf` passed
exact release validation, but its four Worker release waits at Production; its
runtime code is not claimed live. Executor and approval provenance remain
unproven.

Fresh full validation passed at `61008624`, tree
`965ad7afe45d5323af1ff788618d2a7e833e618e`: six builds, four lint tasks,
fourteen typechecks and fourteen test tasks. Admin passed 2,296 tests, Astro 79,
editorial 98, content 202 and www 192; CSP passed two with one skipped. The new
reader regression's initial overload error is fixed with literal calls.
Recovery downloads now capture buffered editor text and retry identity while
preserving opaque stored entries.110 focused tests, compiler checks and a
stored-only export mutation passed; independent review found no blockers.
Supplied-snapshot export/reference validation, caller-key authenticated
encryption and suspended synthetic restore now pass27 CLI/fixture tests,
including105 revisions through the real canonical SQL schemas. Independent
review and omitted-table/missing-media mutation proofs pass. Application tasks
were cached in the final run; new CLI/recovery tests ran afresh. Live consistent
capture, provider exporters/importers and operational backup remain unfinished.
The final test-only follow-up derives its synthetic content path from record
identity, clearing the scanner's literal-key fixture finding without changing
the scanner. Both PR diffs pass local Security Review and27 CLI/offline tests
pass again; production executable blobs still match61008624.
Fresh #509, #516 and #523 required checks passed. See the
[bounded packet](website-next-source-batch.md) for exact heads and scope.

Draft #522 retains CLI/settings/bounded media admission; #524 is assembly
evidence. Isolated media research a15335f5 passed100 focused tests, compiler/build
and local Worker proofs, but has no qualified production memory/CPU bound and
is excluded from the assembly. Neither draft closes deployed media processing,
complete operational recovery,
real data-source access or live draft-write acceptance. Knowledge and Health
views exist; connecting their canonical sources is separate from implementing
the UI. Agent-owned software work remains active. Published wording and CMS
data remain unchanged.

## Demonstrated baseline

- Full `pnpm validate` passes in the configured cloud toolchain.
- The direct CMS reader and single-record durable publisher are implemented.
  Private save/history, source review, immutable publication intent, unpublish,
  retry/reconciliation and public version checks have substantial test coverage.
- GitHub deployment run
  [37575280101](https://github.com/anipotts/anipotts.com/actions/runs/37575280101)
  succeeded for main: public Worker, public release smoke, admin Worker,
  editorial release/owner boundary and state Worker. Newsletter, ingest and
  weekly-email targets were skipped. Generic admin boundary and read-only
  identity smoke were skipped; their absence must not be represented as proof.
- Active default-branch ruleset `21578155` requires PRs, strict required build
  and Security Review checks, resolved review threads, blocked deletion and
  blocked force pushes, with no bypass actors. Re-read it before each merge.
- Separate agents-repository freshness/archive checks passed in its recent
  history. This is not current HTTP or deployment proof for agents.anipotts.com.

Deployment receipts establish the recorded release, not the current behavior of
every live route. Direct live requests are blocked by this environment's current
network policy.

## Findings and completion conditions

| Area                  | Finding                                                                                                                                                                                                                                                                                             | Completion evidence needed                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writing share images  | Bundled social cards could remain public when their writing record was absent from an empty/partial active CMS inventory. Fixed by gating solely on active published CMS writing.                                                                                                                   | PR521 exact-head checks, release receipt and live absent/visible card behavior. Ordinary unpublish already wrote a hidden active revision; it was not the absent-record bug.                                                                   |
| Agent authoring       | Existing owner editorial APIs are present, but a clean native CLI and complete agent workflow documentation are missing at baseline.                                                                                                                                                                | Owner-session client, bounded reads, CSRF/CAS writes, separate immutable review/publication, focused tests and authenticated live acceptance without changing existing prose.                                                                  |
| Shared site settings  | Navigation/footer and shared identity/SEO defaults are code-owned at baseline, despite the approved editing contract. Per-record metadata editing does not provide shared shell editing.                                                                                                            | Backwards-compatible CMS settings, actual admin editing, common public rendering and default-preservation tests.                                                                                                                               |
| Media                 | Signature checks do not establish valid decoded images or bound pixels; original/derived crop provenance is incomplete.                                                                                                                                                                             | Container/pixel bounds are a useful improvement, but full server decode/re-encoding and durable crop provenance require a reviewed runtime-compatible implementation.                                                                          |
| Data                  | Records/Sources and ops are enabled in source. Knowledge and Health UI/read clients are implemented with synthetic coverage, but their production source flags remain unset. Health displays only approved collected metrics; additional metrics depend on System/device collection and provenance. | Verify canonical reader/entity/health contracts, provenance and exact owner/source/network grant, then live read acceptance. Health credential issuance remains a separate auth approval. System/device collectors are not missing website UI. |
| Recovery              | Dated inventory records a nightly content-D1 export, without demonstrated draft-history and R2-media coverage; external copy and restore-drill proof are incomplete. Browser recovery retains plaintext JSON.                                                                                       | Current backup inventory, protected destination/key setup, complete reference-checked export and isolated restore proof; pending-browser-input protection. Do not change System jobs or key custody under a software-only release.             |
| Publication lifecycle | Multi-record atomic batches, scheduled activation and published slug changes are unsupported.                                                                                                                                                                                                       | These were explicitly deferred by the later single-record milestone in direct-cms-publication.md. Broader delivery-contract targets remain open; source must continue to refuse partial or unreviewed effects.                                 |
| Device acceptance     | Source/tests and deployment evidence do not close outstanding physical mobile keyboard, touch/safe-area and resume acceptance cases.                                                                                                                                                                | Focused real-device acceptance at the released revision, preserving private drafts.                                                                                                                                                            |
| Host cleanup          | Source and dated inventory map staging to the same production Worker/data. Wildcard/legacy hosts and old Vercel claims need a fresh provider inventory.                                                                                                                                             | Read-only DNS/Worker/Access/Vercel verification followed by scoped retirement approval. A current Vercel project still lists apex/www domain claims; that alone does not establish DNS traffic routing.                                        |

## Staging

`staging.anipotts.com` currently denotes another hostname for production, not an
isolated environment. Ani does not use it. An actual staging service would need
its own Worker and separate stores, and would be useful for pre-release software
testing. The current alias provides no such isolation. Prefer retirement after
fresh provider/link checks rather than introducing another unused workflow.

## Existing GitHub work

Fourteen PRs were open before this pass: ten draft infrastructure/documentation
branches and four dependency branches. Drafts intentionally fail the required
ready-release job; that is not a source failure. Three dependency branches have
actual failures (Node type compatibility, React tests and Astryx theme compilation).
Do not merge them solely to empty the queue or treat draft source as deployed.
The current queue must be reassessed against each exact head before integration.

GitHub reported six default-branch dependency alerts during branch push. A fresh
`pnpm audit --json` returned ten distinct advisories in twelve finding groups;
these counts come from different inventories and must not be equated. Six
compatible patch candidates were identified for root YAML, smol-toml, source-map-js,
AJV 6, Sharp and AI SDK provider utilities. Their inspected paths are build/test
tooling. Deployed editorial parsing already pins patched YAML 2.8.3.

All six compatible patches are now applied in the source candidate. Frozen
installation and full validation pass. Its fresh audit reports four remaining
advisories: one low, one moderate and two high, with no critical advisory.
This does not change the default-branch alert inventory until integration.

KaTeX needs a parent-compatible upgrade rather than forcing its next major.
The http-cache-semantics and braces advisories provide no patched version;
their inspected uses are remote-image build caching and fixed lint-staged
patterns. Old esbuild belongs to Drizzle's legacy loader, with no development
server use found there. These are documented unresolved advisories, not claims
of complete dependency remediation or demonstrated deployed exploitation.

## Software checkpoints in this pass

- [PR521](https://github.com/anipotts/anipotts.com/pull/521) passed required
  exact-head checks and merged as `1ccc08da95b7cddd0f766bf86f436c56341eb5fc`.
  [Deploy38025022414](https://github.com/anipotts/anipotts.com/actions/runs/38025022414)
  completed successfully for both www and admin at that exact source, schema
  `0044`, with all separate workers skipped and no D1 or CMS writes. Live
  visible/absent share-card GET/HEAD checks and the signed-in owner read journey
  passed. Draft-save/publication acceptance has not been exercised.
- The owner [agent editorial workflow](agent-editorial-workflow.md) and native
  CLI now support private drafts/history, explicit reviewed publication and
  exact-operation reconciliation using existing human Access credentials.
  Nineteen synthetic transport/file tests pass and run in ready-PR CI and release
  validation. No production draft or prose
  was read or written during these tests.
- [Shared settings](editorial-shared-settings.md) use the existing home-record
  save/review/publication path. Compiled-Worker tests demonstrate propagation
  across home, work, writing detail and RSS, and restoration to existing defaults.
  Old readers accept the optional metadata but ignore these settings; deploy
  and verify the paired reader before publishing overrides.
- Media admission now checks containers and declared image/canvas/frame
  dimensions before storage. The existing byte bound remains. It still does
  not establish raster decode, complete compressed-payload validation,
  sanitized derivatives or original/crop provenance.

The updated combined software and infrastructure checkpoint passed fresh full
`pnpm validate` at `1322cf58`, including the final schema-doc/CI guard, runtime
contract, actual type-assertion compiler and theme instruction repairs. Incorporating
main `8a197427` preserved its exact tree. Build, formatting, lint, typechecking,
policy and package tests passed.
Content passed 202 tests; admin unit tests passed 2,279 tests in 174 files, its
Astro suite passed 79 tests and its editorial Worker suite passed 98 tests.
The CSP suite passed two tests with one skipped. Public tests also passed.
A task-owned browser exercised
long shared labels and persisted navigation state at 320, 390 and 1,440 pixels
against synthetic published data, with no page errors or horizontal overflow.
This used system Chromium 151; the repository's matching Playwright browser
download remains blocked. This is software and synthetic browser evidence, not
owner-session, physical-device or production acceptance. The checkpoint has
not been deployed. Software deployment never publishes settings or draft prose.

## Editorial work intentionally preserved

Prior interviews/case-study/article requests remain editorial work. Structured
AI/PGI case-study depth, factual attribution and supporting media need Ani's
review. Current published wording is preserved in this software pass. Git seed
content is not authoritative evidence of current CMS wording. Newsletter public
pages remain deliberately unpublished; retained delivery endpoints do not imply
a request to activate signup or send messages.

## Environment prerequisite

See [cloud website access](cloud-website-access.md). No production credentials,
DNS settings, Access policies or CMS sources were changed by this audit. Record
each released PR/head, main merge SHA, affected/skipped targets and live route
proof separately; checked, merged, deployed and verified are distinct states.
