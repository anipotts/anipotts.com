# Quiet Precision execution goals

Established September 13, 2026 at Ani's request. One active native goal owns the
remaining implementation in this task. These milestone prompts apply the approved
plan; they do not replace or broaden it. The full approved plan in the conversation
and [delivery contract](quiet-precision-delivery.md) remain authoritative.

## Integration and review prompt

Continue the remaining Quiet Precision plan as one integration owner. First read
the current checkpoint, relevant repository guidance, exact PR heads and newly
available Ani comments. Preserve all eight studies, annotations, the approved
shell and Astryx components. Preserve the dirty canonical checkout, private drafts
and managed localhost:4311 preview. Never mass-stage or reset concurrent work.

PRs #343 (URLs), #344 (history/retries), #345 (release safeguards) and #346 (review
header/catalog) are implemented, locally checked and CI-passing at the initial
checkpoint. At this initial checkpoint they were open and unapproved. Ani subsequently asked
the reviewer task to merge them; that task is clarifying the automatic production
deployment consequence. No merge or deployment has occurred. Refresh the
checkpoint and reviewer task before relying on this state. Address comments delivered through Codex immediately
at a safe work boundary. Read submitted GitHub review threads at checkpoints;
unsubmitted UI comments are not assumed available through GitHub.

Use small commits with a concrete behavior and meaningful tests. Keep unfinished
work draft. Mark ready only after full relevant gates and review artifacts are
current. Ani's comments, questions and passing checks do not imply approval.
Record explicit approval against the reviewed head; changed heads refresh checks
and affected acceptance. Every PR waits for Ani before merge, including docs and
dependencies. Follow native merge/release controls after approval.

Continue independent work while another PR or provider action awaits approval.
An unmerged dependency may be a clearly documented stacked branch base; never
silently copy it into main or a live target. Keep public activation disabled until
all prerequisites are demonstrated. Separate implementation from activation.

At each checkpoint report implementation, tests, Ani's review, merge, deployment,
live verification and remaining work separately. Update the checkpoint and this
milestone ledger without marking future work done because a file exists.

## Current visual priority

Ani asked to prioritize the actual Content and workspace overview tables after
seeing the generated studies. PR #348 implements the first Content library and
recent-work navigation increment; the managed local preview includes it. Its
full local checks pass, but visual acceptance, GitHub checks, owner review,
merge and deployment remain separate. Recently edited stays horizontal on
desktop, with readable titles and contextual continuation actions, and stacks
on narrow screens. Operations overview consistency is the next visible slice,
followed by Life's supported unavailable/library surfaces. Preserve read-only
source boundaries and do not invent connected data for visual fidelity.

PR #347 is a separate draft recovery-envelope increment. R0b isolation and R3b
published-schema contracts are prepared in isolated branches; they do not prove
provider isolation, restore readiness or publication activation. Revalidate the
checkpoint and current PR heads before continuing these milestones.

## Bounded agent prompt template

Assign a worker only a concrete independent slice alongside useful integration
work. Supply: exact question or behavior; owned paths; immutable base; relevant
approved contracts; expected artifact; required tests; activation restrictions;
and stopping condition. Tell every editing worker that others share the codebase,
to preserve their edits, and to avoid files outside its ownership. Root integrates
shared schemas, routing, styles and releases. Use the available concurrency limit;
reuse agents for related follow-ups. No second integration owner or competing
automatic publisher. Prefer focused explorers for code questions, workers for
owned implementation, and a separate bounded review of consequential changes.

## Milestone prompts

### R0b: isolated release tests and migration proof

Implement the smallest test harness around concrete R3 schemas. Own dedicated
test configuration and `scripts/ci/content-publication-*`, coordinated centrally
with existing CI/migration classification. Assert separate D1/DO/R2 identifiers,
synthetic fixtures, owner/PR/expiry identity, absent production mutation targets,
newsletter bindings, unrelated sends and Life data. Reuse the four workflows.
Test empty and representative existing schemas before merge. Local preparation
may proceed now; cloud resource creation/cost/access follow applicable gates.
Stop at a reviewed harness and actual isolated-runtime receipt; mark provider
proof missing until run. No permanent replacement staging hostname.

### R1 remainder: real-component coverage and frontend acceptance

Extend the actual-component catalog from PR #346 into the retained eight-study
matrix. Own fixture routes/tests and narrowly assigned Astryx components; root
owns shared styles and shell integration. Cover Content library/editor/history/
publication, Operations lists/details, Life evidence, palette, auth and recovery
states with synthetic adapters. Do not implement a parallel prototype or restyle
obsolete routes. Keep fixtures incapable of private reads, saves or publication.
Check all specified widths/themes/sidebar states, 200% zoom/text enlargement,
keyboard/accessibility, IME/paste/undo, mobile suspension, navigation and failed/
stale requests. Record automated versus manual proof separately. Stop each small
PR at a working interaction plus representative visuals for Ani's comments.

### R3: stable identity and compatibility contracts

Inspect existing code before adding abstractions. Own `packages/content/src/editorial`
contracts and centrally coordinated draft/publication/transfer consumers. Preserve
existing kind/id identities; separate new immutable IDs from mutable slugs. Add
versioned draft/recovery, published revision, review/batch, transfer and receipt
envelopes where boundaries require them. Preserve original bytes and unknown
round-trippable fields; reject unsupported required semantics before mutation.
Support current and previous clients for at least 30 days, reader-first additive
migrations, explicit Git import/baseline changes, and the CMS-aware rollback floor.
Test old/new client and reader combinations, renames, stale baselines, retained
authored fields and failed mutations. Build on #344 explicitly. Deliver contracts
in small additive PRs; do not activate new writers or migrate production here.

### R4: media, export and demonstrated recovery

Own media metadata/export/recovery modules and narrowly coordinated DO scheduling.
Retain immutable originals, derivatives/crop recipes, references, dimensions and
hashes. Validate upload bytes/type/decoded pixels within approved limits; use the
approved provider binding only after readiness/cost proof. Preserve interrupted
uploads and safe deduplication. Implement encrypted portable manifests spanning
draft high-water marks, history/conflicts/identities, captured publication state,
required media and compatible software/schema identities. Multiplex durable
deadlines, completing changed-state manifests at least every 30 minutes.
Inspect existing provider recovery and external-copy facilities first. Key custody,
destination and access setup require concrete decisions; never request secrets.
Prove exact-source/media/history restore into isolated resources within one working
day and the one-hour RPO target. Restored private data remains private, pending jobs
start suspended, and retired publishers cannot restart. No authored-data cleanup.

### R5: authoritative coherent public reads

Own `apps/www/src/lib/published-*`, readiness and assigned public consumers. Extend
current implementations rather than replacing them blindly. Overlay complete CMS
records on Git defaults; preserve suppression on unpublish and stable route identity
through redirects. Missing activated storage must fail closed instead of revealing
older Git content. Read one version/active manifest per request and retain immutable
revision references throughout rendering. Memoize parsing within that request.
Cover detail, home/listings, canonical/redirect, search/feed/sitemap/social metadata
and media policy. Test old/new schemas, storage failures, hidden defaults, route
collisions, coherent version evidence and superseded results. Deploy a compatible
reader only through reviewed release gates, with direct writes still disabled.

### R6: complete structured Content authoring

Own the field-to-public-surface manifest and assigned editor/preview/history controls.
Cover article/project creation, existing pages, navigation/footer, home summaries,
project metadata, shared links, SEO and media. Keep layouts/behavior in code.
Implement field Edit/Expand using one editor/save/undo session, preserved selection
and focus, explicit baseline conflicts, and invalidated review on editing. Production
is primary; localhost remains development plus explicit recovery/transfer. Every
field needs a control, validator, exact preview and public-consumer acceptance test.
Exercise multiple tabs, IME, undo, auth expiry, recovery, refresh/navigation and
slow/aborted saves. Stop each page/field family at a reviewable end-to-end slice;
source-mode acceptance alone does not count as complete field coverage.

### R7: disabled durable atomic publication engine

Own the direct publisher, publication store and alarm/receipt integration after
R3/R4/R5 prerequisites. One engine handles one or up to 20 selected records, with
512 KiB source per record/4 MiB total, 10 image references and 10 MiB image bytes
per record, 40 unique assets/40 MiB total, separate 10 MiB binary uploads, at most
two asset operations and one activation concurrently. Never silently split a batch.
Persist immutable approved membership and retry identity before I/O; stage assets
before a D1 transaction. Prove a CHECK-constrained whole-batch precondition and
postcondition in actual isolated D1, including first/middle/last stale pointers,
route conflicts and failure after earlier statements. Assert no partial effects.
Reconcile receipts before retry, recover lost activation responses/acknowledgments,
and use durable bounded retries independent of browser/Worker lifetime. Distinguish
activated, converging, verified, superseded and incomplete verification. Preserve
legacy receipts and keep the new engine disabled until R10.

### R8: Changes, batch review, transfer and convergence

Own review-set/selection UI, explicit transfer and publication-status consumers.
After R6/R7, flush acknowledged revisions into exact immutable review membership;
display selected records/actions/routes and field diffs with Edit/Expand. Keep
approval distinct from selection and save. Implement versioned popup transfer with
origin/window/nonce/replay checks, bounded binaries and recoverable lost responses.
Show truthful durable preparation/activation/convergence outcomes, including newer
superseding versions; browser polling is presentation only. Test multi-record edits,
stale approvals, closed tabs, late acknowledgment after newer saves, expired sessions,
partial availability and interrupted transfers. Deliver synthetic browser proof;
actual public-content acceptance remains explicitly gated.

### R9: route registry and consistent workspace patterns

Own the shared registry and integrate centrally with shell/palette/library/detail
consumers. Resolve duplicate definitions, lost return paths and Life-to-Operations
misrouting. Migrate useful surfaces to approved full-width frames, consistent tables,
filters, selection/detail, spacing and capability/error states. Preserve body reading
width separately from toolbar/table width. Keep state through Back/Forward/deep links
and narrow detail transitions. Replace only proven redundant surfaces; retain unique
function and records. Test real route navigation, keyboard/search cancellation,
empty/stale/error states and long data. Reuse R1 fixture evidence.

### R10: publisher transition and verified activation

Root alone coordinates this release. Recheck owner approvals, isolated real-D1 proof,
restore drill, auth/provider bindings, compatible artifacts and reader/writer readiness.
Inventory outstanding legacy jobs/alarms and inspect actual effects; never cancel or
replay blindly. Preserve receipts. Enforce legacy/maintenance/direct mode at every
entrypoint and alarm. Follow additive schema → compatible public reader → compatible
disabled admin writer → owner acceptance → legacy reconciliation → explicit activation.
Handle partial deployment and record the rollback floor. Any actual public-content
change needs the applicable explicit owner approval. Verify required public versions,
hashes, discovery and media. Do not label activation success as verified live.

### R11: useful read-only Operations

Own bounded observation schemas/adapters and assigned machine/loop/service views.
Reuse the existing device relay seam; do not create arbitrary command execution or
public telemetry endpoints. Coordinate any System runner/protocol activation through
its exact approval gate. The proposed fixed 8 KiB Connect frame excludes secrets and
command output. Keep process health, source freshness, contact and running/idle
evidence distinct. Unknown or unavailable is not healthy. Test actual authorized
read observations, stale/late data, visibility-aware 60-second refresh with backoff,
manual refresh coalescing and meaningful entity details. No write controls.

### R12: authorized canonical-source Life

Own the bounded Life adapter and evidence/context views after R9. Recheck canonical
source availability and exact owner/source/network authorization before connecting.
Implement only granted status/sources/search/get/category capabilities, with short
expiry, renewal, revocation and stale-response suppression. No host/source expansion
from requests, no persistent cloud replica, and no private records in public artifacts.
Keep source freshness distinct from fetch time; downtime displays unavailable. Retain
loaded records only in the current authorized session and clear them on expiry or
revocation. Prove source provenance/corrections and denied/expired behavior through
approved acceptance; synthetic views are not connected capability proof.

### R13: verified retirement, measurements and handoff

Root coordinates dependency/record preservation before retiring legacy surfaces.
Inspect staging route/DNS/consumers and unique resources, then prepare precise removal
through applicable controls; do not remove the shared production Worker/database.
Measure query/parse/write counts, DO contention, binary memory, search cancellation,
route JavaScript and recurring/temporary cost before caching or adding dependencies.
Keep additional recurring cost under the $10 target and flag projections above $7.50;
no purchase is authorized by the ceiling. Retain authored data; identify orphans only.
Finish release/rollback/resource ownership, compatibility window, backup freshness,
last restore drill, publication reconciliation and source-reader custody runbooks.
Use one exceptions-only maintenance task and existing durable schedulers. No new
attention dashboard or dependence on an active Codex session for core work.

## Execution and completion rules

1. Prioritize concrete P0 safety failures, then required P1 functionality/consistency,
   then measured P2 simplifications. Recheck historical findings before adopting them.
2. Work in bounded increments with one active owner per shared module. Preserve useful
   earlier implementation; inventory local, merged, enabled and verified separately.
3. At each ready checkpoint consume Ani's available comments before starting another
   overlapping edit. Explain when a comment has been implemented and which commit
   carries it. Do not post external replies or resolve review threads automatically.
4. Keep moving on independent work when review/access/provider gates block a dependent
   effect. Ask only for genuinely unavailable product/access/cost/destructive decisions,
   using the supported question flow. Never request secrets or expand access silently.
5. Do not create duplicate goals or feature automations. The existing heartbeat is a
   continuation/exception channel for this same task, not a second executor. Remain
   quiet when all reachable work is unchanged and waiting for Ani.
6. Keep the native goal active until the approved finish line is demonstrated, not
   merely all PRs opened. Do not mark it complete at individual checkpoints. Follow
   native repeated-blocker rules only when no meaningful independent progress remains.
7. The final handoff requires reviewed code, actual required capabilities, demonstrated
   recovery, appropriate merge/deploy/live receipts and explicit remaining limitations.
   Never report deployment, owner approval or live correctness from passing local tests.

Immediate next slice, R3a: version browser draft recovery without losing legacy
input. The bounded discovery found existing kind/id identity in the shared source
contract, but an unversioned recovery payload under a v1 storage key. Own only the
small recovery codec, `apps/admin/src/lib/draft-recovery.ts`, necessary storage call
sites and compatibility tests. Accept frozen legacy payloads, preserve exact CRLF/
Unicode and pending request identity, enforce UTF-8 limits, distinguish unsupported
versions from missing input, and retain opaque unsupported/corrupt recovery data.
Prove old/new tab interaction cannot silently destroy a newer envelope. Do not call
this plaintext codec encrypted recovery. Do not import canonical-only publication/
handoff code or change save/reconciliation semantics; those depend explicitly on
#344's durable retry and retained-history behavior.

R3a can branch from main while Ani reviews #343–#346. R0b and R1 fixture work can
proceed independently with non-overlapping ownership. This prompt setup authorizes
no additional production activation, provider permission, billing or destructive
action.
