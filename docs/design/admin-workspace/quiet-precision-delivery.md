# Quiet Precision delivery contract

Approved September 13, 2026. This is the implementation ledger for Ani's amended
product, architecture, recovery and operating plan. It supersedes the older
automatic merge, Git-only CMS, article-only creation and staging assumptions.
It records targets separately from demonstrated behavior.

## Product and review contract

- Content is the only workspace with writing and publication. Production admin
  is the normal authoring environment. Localhost supports software and visual
  review, with explicit occasional draft transfer and recovery.
- Git supplies initial/default content. Complete published CMS records override
  Git changes; suppression records prevent unpublished material returning. No
  CMS-to-Git mirroring or background bidirectional draft synchronization.
- Support article/project creation, existing page copy, shared navigation/footer,
  SEO and media. Layouts and executable behavior remain in code. Unpublishing and
  slug changes are explicitly reviewed and reversible; no permanent-delete UI.
- Operations shows real read-only machine, loop and service observations. Life
  reads authorized canonical knowledge with provenance; it has no persistent
  cloud replica. Unavailable sources are not empty sources.
- Every PR waits for review before merge. From September 14 Ani delegated review and
  serial merge to the single integration owner; see `CLAUDE.md`. Drafts are incomplete
  work; ready checkpoints run relevant full checks. New heads refresh affected
  checks and acceptance. No auto-merge or docs bypass.
- Preserve the canonical dirty checkout, private drafts, old worktree refs and
  managed port 4311 preview. Never use Ani's private writing as test fixtures.

## Design continuity

Quiet Precision retains the approved sidebar geometry, bracketed wordmark,
Instrument Sans, Phosphor regular icons, Astryx components, neutral surfaces,
restrained workspace accents, compact controls and useful focus visibility.
Actual components take precedence over fidelity errors in generated studies.
The original local visual packet and annotation ledger remain preserved in
`vision-2026-09-13/`; they are not deployed capability evidence.

| Retained study      | Implementation responsibility                                 |
| ------------------- | ------------------------------------------------------------- |
| Content review      | Wide conventional diffs, exact revisions, field Edit/Expand   |
| Publication outcome | Saved versus activated versus verified, expandable evidence   |
| Command palette     | Fixed input geometry, compact results, real keyboard behavior |
| Sidebar controls    | Menu containment, stable icon column, consistent theme/logout |
| Machines            | Actual device observations and adjacent details               |
| Loops               | Purpose, host, outcome, stale/unknown evidence                |
| Life library        | Consistent record rows and capability-aware views             |
| Life record/context | Provenance, corrections, distinct source and fetch dates      |

The latest review annotation places a content-width SaveStatus to the right of
the Review changes heading and legend. Actions belong below. At narrow widths,
wrapping is deliberate; the token does not stretch to a fixed width. Field-level
editing uses one editor/save/undo session and invalidates approval on first edit.
Saved changes never imply review approval.

Catalog fixtures must render real components with synthetic data. Required
acceptance includes 320/390/768/792/1280/1440 widths, sidebar modes, light/dark/
system, reduced motion, 200% zoom, text enlargement, accessible names/order/live
regions, IME/paste/undo, two tabs, mobile keyboard/suspension, navigation/reload,
long/Unicode/invalid metadata, startup boundaries and stale/aborted requests.

## Evidence baseline, September 13

| Layer               | Observed baseline                                             | Boundary                                                       |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Main                | `ae2d9570011914fdac4edacbcde4659e047b3199`, PR342             | Implementation work starts here                                |
| Admin               | Deploy34772294792, Worker30512fa3-69e0-4330-9f0c-ef19fab66858 | Admin-only deployment receipt; legacy publisher enabled        |
| Public              | Live health release706285e132492c8b081cc237af4cebbd58f245e4   | Health is not end-to-end CMS proof                             |
| Canonical worktree  | `codex/document-editor`, e58fa668, 75 tracked modifications   | Preserved, not mass-staged into these PRs                      |
| Publication D1      | `anipotts-content`, inventory0, no publications               | Bootstrap verified; no writer activation                       |
| Auth                | Signed Access owner assertion                                 | Retained passkey/password libraries are not active route proof |
| Media/live bindings | Prior R2 receipt; latest provider reads denied                | Must reverify; permission failure is not resource absence      |
| Life/Operations     | Existing adapters, no demonstrated attached reader            | Real-source acceptance remains required                        |

The eight pre-existing checkouts and eight missing temporary registrations remain
untouched. Four new task-owned branches isolate release guards, draft recovery,
URL safety and review fixtures. The shared `anipotts-db`, newsletter queues,
ingest/send Workers, state relay and their resources are not test targets.
`staging.anipotts.com` currently shares the public Worker; it is not isolated.

The existing `admin-integration-progress` heartbeat was updated at kickoff to
require Ani's PR review and preserve the preview. Operations/Life automations
remain paused. No competing maintenance task was created.

## Safety contracts before activation

### Identity, compatibility and publication

Stable record IDs survive slug changes. Define versioned draft/recovery,
published revision, transfer, review/batch, publication/verification receipt and
reader contracts. Support current and previous browser/transfer protocols for
at least 30 days. Unsupported mutations fail before writing and retain
read/export/recovery. Deploy additive schema and readers before writers.

Keep immutable reviewed membership: up to 20 records, 512 KiB source per record,
4 MiB source total, 10 image references and 10 MiB media per record, 40 unique
assets/40 MiB per batch. Upload binary objects separately (10 MiB each), process
at most two assets concurrently, serialize activation, and never split an
approved atomic batch silently.

Persist intent and arm durable work before I/O. One D1 transaction must check
inventory, every expected pointer, routes and retry identity, then commit all
revisions/routes/lifecycle effects and one inventory increment. A failed
CHECK-constrained guard must roll back the whole batch. Prove first/middle/last
stale members and post-statement failure in actual cloud D1, not only mocks.

Use the same durable engine for one record and many. Receipt-first reconciliation
handles lost responses and activation before acknowledgment. Multiplex alarm
deadlines so backups and publication cannot overwrite each other's schedules.
Preparation retries have bounded backoff and a 30-minute automatic window;
verification persists through 24 hours and reports sustained incompleteness.
Distinguish preparing, activated, converging, verified, superseded, failed before
activation and verification incomplete. Public requests read one coherent
inventory version, with initially uncached CMS-dependent responses; do not
promise global instantaneous cache atomicity.

Explicit publisher modes are legacy, maintenance and direct. Inspect actual
legacy job effects and retain receipts before transition. Direct publication
sets a CMS-aware rollback floor. Restoring data cannot reactivate a retired
publisher or replay suspended work.

### Recovery, media and privacy

Retain authored revisions/conflicts and immutable retry identity; paginate history
instead of automatic deletion. Identical old retries recover their original
outcome; changed payload with the same identity rejects. Irrecoverable ancient
receipt metadata produces reconciliation-required without writing or destroying
the original conflict source.

Target at most one hour of acknowledged changes lost in a major incident and
restoration within one working day. Ordinary failures preserve acknowledged
changes. Use provider recovery plus consistent, encrypted, portable manifests
covering private history/conflicts, publications/routes/receipts, required media,
compatible schema/application identities and sanitized configuration. Complete
changed-state manifests at least every 30 minutes; validate reference hashes.
Private backup storage is unavailable to the public renderer. Key custody and
an existing protected external-copy destination require explicit setup approval.

Before activation, an isolated restore drill reopens exact source/media/revision
identity, 100+ versions, conflicts, unpublishing, redirects and suspended pending
operations. Private restore never publishes. Browser-only recovery cannot cover
lost devices or cleared storage before acknowledgment. Application rollback,
reviewed content rollback and operator database recovery are separate actions.

Retain original/derived image identity and crop provenance, decode and bound
pixels server-side, and preview exact stored derivatives. JPEG/PNG/WebP uploads
and approved bundled SVG/ICO reuse cover the initial scope. Private previews
require owner authorization; public media requires visible references. Media
unavailability blocks activation, not draft saving. Identify orphans without
deletion. Browser recovery locks on auth expiry, preserves encrypted pending
input and requires owner unlock; logout clears plaintext and late responses.

## Delivery sequence and current boundary

| Increment | Deliverable                                                                           | Required predecessor / gate                        |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| R0a       | Source-preserving CI, exact-head security coverage, review policy and evidence ledger | Current main; Ani review                           |
| R0b       | Isolated resource assertions and publication migration pre-merge harness              | Concrete R3 schema/config; no production mutations |
| R1        | Actual-component catalog, review header, representative workspace fixtures            | R0; visual review                                  |
| R2a       | Durable save retry identity, retained history and restoration                         | R0; real store tests                               |
| R2b       | Structured URL validation and renderer safety                                         | R0; public fixture compatibility                   |
| R3        | Versioned contracts, stable identity and additive schema                              | R2                                                 |
| R4        | Media validation, consistent export/backups and isolated restore drill                | R3; approved custody/provider setup                |
| R5        | Authoritative resolver, lifecycle/routes/version/readiness                            | R3/R4; reader compatibility                        |
| R6        | All structured fields, articles/projects, shared SEO/media, Edit/Expand               | R1/R3                                              |
| R7        | Durable atomic publication engine, disabled                                           | R3/R4/R5; real D1 rollback proof                   |
| R8        | Changes/batch review, explicit transfer and convergence recovery                      | R6/R7                                              |
| R9        | Route registry and shared shell/library/detail patterns                               | R1; coordinate R6/R8                               |
| R10       | Legacy reconciliation and owner-verified direct activation                            | R2–R8 reviewed; recovery and live readiness        |
| R11       | Real Operations observations and read acceptance                                      | R9; System protocol/runtime approval               |
| R12       | Canonical Life reader and provenance acceptance                                       | R9; exact owner/source/network grant               |
| R13       | Verified legacy/staging retirement and maintenance handoff                            | Replacement parity and recovery proof              |

R0a does not claim R0b, provider isolation, complete catalog coverage or CMS
activation. Each PR carries its own test/acceptance receipt; the table is a
dependency contract, not a completion checklist marked by source presence.

## Release and maintenance handoff

Use the existing four workflows only. Scoped iteration checks precede complete
review-ready gates. CI identities do not become editorial owners. Artifacts use
synthetic content; logs contain bounded codes, opaque IDs, timings and versions,
never draft bodies, Life records, searches, tokens or raw provider errors.
Keep technical logs short-lived (target seven days), synthetic artifacts fourteen
days and durable operation/release receipts separately.

Localhost is the ordinary test environment. Temporary cloud tests require unique
recorded owners/expiry and separate D1/DO/R2 mutation targets, synthetic content,
no Life imports, no newsletter queues/credentials or unrelated cron effects.
Do not create permanent staging. Retire only verified staging route/DNS and
obsolete configuration through applicable controls; shared resources stay intact.

Readiness separates process liveness, dependencies, feature availability, source
freshness and user-visible correctness. One exceptions-only Codex task reports
deduplicated actionable failures/decisions/recovery. Core backups, publication
and verification use durable schedulers independently of that task.

Plan for 500 records, 100k public requests, 20k saves, 100 batches, 200 new assets
per month and 20 GiB deduplicated media/recovery storage. These are measurement
assumptions. Additional recurring cost targets below $10/month, expected below
$3; flag projections above $7.50 before adding recurring work. No purchases or
billing changes are authorized by this ceiling. Measure query/CPU/memory/bundle
and autosave costs before caching or new dependencies. No hidden polling; start
Operations at 60-second visible refresh with backoff and coalesced manual reads.

Every completed increment reports **implementation, tests, Ani's review, merge,
deployment, live verification and remaining work separately**. The final handoff
includes resource ownership, rollback floor, schema/protocol window, backup age,
last restore drill, publication reconciliation, reader custody and cost evidence.

Deferred: page builder, CMS/Git synchronization, permanent deletion, cloud Life
replica, unrelated chatbot/feed, new attention dashboard, paid LLM CI reviews,
parallel deployment systems and unmeasured caching/infrastructure expansion.
