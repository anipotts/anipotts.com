# Offline editorial recovery fixture contract

`scripts/admin/editorial-recovery.mjs` is a pure supplied-snapshot formatter,
reference validator and isolated memory restore adapter. It has no filesystem,
provider, network, route, job, alarm, publication or production restore capability.
The original supplied-snapshot v1 proof is described first. The local binding
v2 prototype and its later evidence are recorded below. Current verification is
`pnpm --filter @anipotts/admin test:recovery`. Neither proof activates an
operational backup or changes production stores.

## Supplied-snapshot v1 coverage

The version-one adapter requires the eight editorial application SQL tables
and three content publication D1 tables in its declared schema, with their exact
named columns. Its version-one record path format is pinned to
`content/public/pages`, `content/public/projects` and `content/public/writing`;
like the declared SQL columns, this pin is self-contained and tested against the
canonical mapping on supported source bases. It requires no newer production
layout helper or package build. It preserves every supplied row and exact source, snapshot,
conflict and receipt string, including Unicode, BOM and CRLF bytes. It retains
immutable retry identities independently of the bounded hot receipt cache,
publication history and active pointers, hidden publication snapshots, private
publication baselines, diagnostics, pending intents, leases and original alarm
metadata. The application revision and content schema identity are required.

It preserves supplied DO media metadata and every 64 KiB chunk, and supplied
published media byte objects, validating their declared sizes, types and SHA-256
identities. Source references use the same conservative editorial image path
rule as the application. Public publication sources require their referenced
published objects; private sources may reference either supplied media plane.
All supplied unreferenced objects remain in the export and are reported.

The conditional media relation checker supports the proposed version-one
`media-relation:<derivativeId>:<relationSHA>` schema, including its fixed-order
hash, dimensions, crop and codec identity. It preserves every supplied edge and
requires original, parent and derivative objects. Self edges and shared
derivatives are valid; lexical relation hashes do not represent chronology.
Legacy media without relation entries remains valid. This is format checking,
not runtime qualification of the separate media implementation or image decoding.
The compatibility pin was checked against media source commit
`a15335f551d9398e169db248227dc3bd302c7357`; this fixture does not import or activate it.
Unknown KV keys, relation versions/codecs, SQL tables/columns and content schemas
fail closed rather than being omitted.

## Supplied-snapshot v1 integrity and restore

A canonical plaintext intermediate binds the entire supplied snapshot with a
SHA-256 checksum. Export and validation impose byte, entry, source and media
limits. Missing references, duplicate identities, corrupt bytes, invalid receipt
relationships and incompatible schemas fail before any restore state is written.
Checksums demonstrate internal integrity, not authenticity or complete/atomic
capture of a live store.

Optional AES-256-GCM envelope helpers require a caller-supplied 32-byte key and
use a fresh random nonce. They authenticate the format/schema, application
revision and content schema as associated data and verify those identities again
after decryption. Wrong keys and header/ciphertext/tag tampering reject without
returning plaintext. The helpers generate no keys, store no keys or files and
establish no key custody, destination or operational capture pipeline. Plaintext
intermediates and decrypted output belong only in a controlled caller context;
the fixture does not make the existing browser recovery plaintext encrypted.

The original v1 formatter restores only into empty isolated memory. Validation
completes before installation; a nonempty target or custom/provider target rejects. Returned
copies cannot mutate its retained state. Pending intent, lease and alarm bytes
remain evidence and are never scheduled, retried, executed or published.
Canonical SQLite fixture restoration separately reopens the real current SQL
schemas, reinstates their constraints/triggers and proves all covered rows and
references with more than 100 versions. It performs no real provider import.

## Supplied-snapshot v1 historical limits

A supported legacy successful receipt may retain the exact result of an already
pruned historical revision. Restore preserves that result and reports the
missing history; it cannot recover the original missing authored row. A compact
ancient conflict identity without its original receipt is retained and reported
as requiring reconciliation, matching the application's retry semantics. No
outcome or historical source is invented. A missing successful identity outcome
without its exact legacy result fails closed. Git base acknowledgments may alter
only the current draft's base hash while immutable source/history is preserved.
Unpublish intent source may come from the public snapshot rather than its
private expected revision; the validator checks the correct record/revision and
publication receipt relationships.

At the original supplied-v1 checkpoint, no binding capture/import adapter or
migration-ledger export existed. The supplied table projection alone cannot
attest that a provider omitted no rows or objects. The local v2 prototype below
adds bounded synthetic binding coverage; it does not establish operational
capture or restore. The current publisher has no redirect store; unknown
route/configuration state remains unsupported. Missing external databases or
buckets are not covered. No live private export was used for either proof.

## Local binding v2 checkpoint

Integration-owner qualification of source
`2793c4604aab4040890e981df9753bc2921dd3ca`, using Node 24.19.0 and
`pnpm --filter @anipotts/admin test:recovery`, passed all 18 Node tests and all
21 workerd tests with no unhandled failures. The local receipt is
`/private/tmp/anipotts-recovery-metadata-qualification.log`. This is exact-source
synthetic evidence, not CI, deployment or authenticated live-store evidence.
The prototype remains separate from the current release.

`recovery-storage.ts`, `recovery-target.ts` and
`scripts/admin/editorial-recovery-capture.mjs` exercise real local DO SQLite,
D1 and R2 bindings. The separate v2 envelope includes the eight application
SQL tables, private KV media/chunks, three publication tables, migration ledger,
R2 bytes and HTTP/custom metadata, schema evidence, original alarm timestamp,
source fence identities and prior completion receipts. The current qualification
receipt is recorded after the sealed frontier. Offline-v1 remains compatible
and rejects the new control/journal tables rather than silently dropping them.

DO writer admission records survive reconstruction. D1 triggers reject late
publication writes atomically; cooperating R2 writers retain D1 admission until
confirmed completion. Preflight rejects unsupported/unmigrated D1 before closing
DO admission. Unknown application state and schema drift fail closed. Restore
accepts current DDL and the exact known pre-`clientHash` table followed by the
existing `ADD COLUMN` upgrade from `14d124914^`; named-column restoration handles
that layout without accepting arbitrary schema equivalence.

Restore requires dedicated empty local stores and remains suspended. Complete
validation precedes staged installation; partial failures stay inaccessible.
Imported intents, leases and alarms never run or reconcile. Explicit completion
of a validated, durably qualified capture checks its hash, capture ID,
generations and pending writers, then reopens D1 followed by the DO. This is not
a cross-store atomic transaction: an ambiguous D1 response or interrupted release
keeps the DO fenced, with no TTL or automatic retry unlock. Tests preserve the
artifact and isolated target while source editing/publication resumes. A future
source alarm remains scheduled and can run after verified completion; the target
alarm remains unarmed.

## Integrated current-main qualification

The isolated capture branch normally merged approved main
`795920090a594dbf347e2c7de35967e6d1ee76bb`, retaining its existing capture and
media transport history. Source `33992467607c8b55074f735dbfcb7f808bef71fc` then
passed the complete `pnpm validate` command on 2026-10-19, started at 06:48:17 UTC
and completed by 06:52:04 UTC, using Node 24.19.0 and pnpm 10.5.2. Dependencies
were refreshed with `pnpm install --frozen-lockfile` in this worktree's physically
isolated `node_modules`; the lockfile stayed unchanged.

The full command used the repository's heavy-slot wrapper and covered CI
invariants, formatting, workspace builds, lint, type checks and workspace tests.
Public tests passed all 196 cases and content tests passed all 206. Admin
coverage passed 2,361 component/library tests, 79 Astro tests and 101 native
editorial tests, including all three new media transport cases. Its existing
`test:recovery` command passed 51 Node cases (18 offline/capture plus 33 media
transport) and all 21 native DO SQLite/D1/R2 recovery cases. No duplicate native
run was needed. Built CSP verification passed three cases; its opt-in browser
case remained skipped because `RUN_CSP_BROWSER` was not enabled. The Turbo test
stage completed all 14 tasks successfully, using valid cache hits where reported.

The first full attempt at merge source
`647c55e55d62c9c1cdbef8abc0d3062afe528427` failed before app builds: the admin
build-input scope invariant lacked the two referenced offline/capture helper
scripts. The correction adds only those exact inputs and coverage assertions.
The existing release corpus replayed 5,124 entries in 409 classes with zero
differences. The first failure is retained in
`/private/tmp/anipotts-capture-foundation-validate.log`; the passing rerun is
`/private/tmp/anipotts-capture-foundation-validate-r2.log`. Dependency refresh is
recorded in `/private/tmp/anipotts-capture-foundation-install.log`.

The passing run is not warning-free: workerd logged a `revision_conflict`
exception during the deliberate stale-revision restore test, whose HTTP 409
assertion passed. Vitest reported every suite passing. Local fixture runtime
contract warnings and existing DOM environment warnings also remain in the log.
This checkpoint does not claim browser/device acceptance or a measured aggregate
worker-memory ceiling.

No provider, production capture, operational cohort activation, remote migration,
key custody, auth, DNS or deployment change was made. The additive source
migration `apps/admin/migrations/content-publication/0003_recovery_fence.sql`
remains unapplied remotely and requires its separate exact release/rollout gate.
The disabled operational eligibility and supported-size v2 limitations below
remain explicit. This is a checked agent-branch checkpoint awaiting integration
owner review, not a production backup or release.

## Remaining operational gaps

The normal cohort eligibility adapter always rejects operational capture. Only
the isolated Vitest configuration substitutes an adapter for its exact local
bindings and known current writers. Migration presence does not prove old R2
writes enrolled or drained. Operational writer enrollment, rollout evidence,
provider setup and activation remain unfinished. There is no production capture
route, opt-in flag, credential or configuration activation; the additive D1
migration has not been applied remotely by this work.

The collector has a 4 MiB aggregate collection budget, including encoded
rows/KV/media, an 8 MiB envelope limit, 256 KiB evidence limit and 5,000-entry
bound. Encoding consumes that budget too. Accepted application uploads can be
10 MiB, so this prototype does not cover the full supported media size range.
Due/near alarms are refused; provider alarm retry exhaustion and recovery from it
are not qualified by the future-wake test.

The v2 checksum supplies integrity, not authenticity, encryption or custody.
The v1 caller-key encryption helpers do not establish an encrypted v2 capture
pipeline. Backup key creation/custody, protected external copies, scheduling,
operational restore provisioning and a live isolated drill remain undone.
Quiet Precision's encrypted backup, one-hour loss target and one-working-day
recovery target remain unproven until those separately authorized integrations
and operational evidence exist.

## Disabled supplied media transport

`scripts/admin/recovery-media-container.mjs` is a separate version-one plaintext
transport primitive. It accepts a supplied inventory, per-object readers and a
staging sink. It has no filesystem or provider adapter, production route/RPC,
writer eligibility override, capture-fence integration, encryption or key custody.
The existing offline-v1 and binding-capture-v2 formats and limits stay unchanged.

Private and public objects retain separate identities even when their byte hashes
match. Private chunk indexes preserve the existing 64 KiB order. Public entries
retain the R2 etag, version, upload time, HTTP metadata and custom metadata. The
canonical manifest rejects unknown fields/versions and duplicate identities;
metadata is snapshotted before the first reader await.

Readers supply ordered 64 KiB binary frames, with only the last frame shorter.
The transport copies one frame, updates native `node:crypto` incremental SHA-256,
and awaits the sink before requesting another frame. Object hashes and exact
lengths, frame indexes, object order and final EOF must all match. There is no
whole-object concatenation or base64 media string. The explicit limits are
10 MiB per object, 64 MiB aggregate media, 5,000 inventory entries, 4 MiB serialized
object metadata and 256 KiB serialized opaque evidence. The manifest has a
separate limit of those metadata/evidence budgets plus 4 KiB of framing. Its
checksum detects accidental changes; it provides no authentication.

Only the final manifest marks a successful transfer, after all object bytes and
EOF have been verified. A sink must stage frames, consume/copy each frame before
acknowledging it, and keep partial output inaccessible after failure. Its abort
callback is attempted on transfer failure; an unsuccessful cleanup never produces
a complete manifest. Sink acknowledgment does not establish durable external
storage. Supplied readers/sinks remain responsible for their own allocation and
storage behavior; the transport bounds its own outstanding binary frame and
metadata, not arbitrary caller retention.

Focused Node tests cover a 10 MiB object in each plane, backpressure, exact
metadata and copied bytes, size/count limits, malformed manifests, missing,
corrupted, duplicate, reordered and trailing frames, and sink failure. The native
hash API is already used by the worker-side recovery modules and the isolated
runtime enables `nodejs_compat`. The focused native checkpoint below qualifies
that API path; full integration resource qualification remains separate. There
is no claim of provider or operational qualification. Authenticated encryption/finalization and a complete staged
capture/restore integration remain future work. Inventory alone is never counted
as preserved media, and this primitive does not close the existing v2 size gap or
the encrypted-backup requirement.

### Local workerd checkpoint

Source `a8b4efdadef3bb90e134ba7c414f5957c4539c0b` passed all 33 focused Node
tests and the strict editorial TypeScript check. A single focused native workerd
run on 2026-10-19, started at 06:43:33 UTC and completed by 06:43:43 UTC, passed
all three cases in `apps/admin/test/editorial/recovery-media-container.test.ts`
with no unhandled failures. Vitest reported 55 ms test time and 837 ms total.
The local receipt is `/private/tmp/anipotts-recovery-media-container-workerd.log`.

The command, from `apps/admin`, was:

```bash
pnpm exec vitest run --config vitest.editorial.config.ts test/editorial/recovery-media-container.test.ts --maxWorkers=1
```

The native fixture generates each 10 MiB object from one reused 64 KiB input
block. It verifies both planes against a fixed Node-generated SHA-256 reference,
checks exact metadata/order, and holds the sink to demonstrate one outstanding
awaited frame. Verification regenerates the deterministic frames rather than
retaining a 20 MiB test payload; the Node tests separately exercise a retained
binary round trip. Corruption and truncation abort staging without a final
manifest. These are opaque transport fixtures, not image decoding fixtures.

Source/reference bounds and this local binding runtime evidence do not establish
a measured 128 MiB application memory ceiling, provider behavior, live capture,
encrypted custody or operational restore. No production adapter, route, binding,
RPC or eligibility change was made. The existing v2 size gap and operational
eligibility refusal remain in place.

## Supplied encrypted media codec, source qualification

`scripts/admin/recovery-media-encryption.mjs` adds a separate supplied-data codec
around the plaintext media transport. It has no production imports, capture or
restore adapter, eligibility route, provider access, custody integration or key
store. Existing offline v1 and capture v2 envelopes are unchanged. This does not
close the operational v2 size gap or enable a usable backup.

The distinct `anipotts.editorial-recovery-media.aes256gcm` version-one format is
an iterable of bounded header/record events. Binary ciphertext is never a whole
object or a base64 envelope. The canonical header is at most 8 KiB and binds the
capture UUID, application revision, content schema and both generation fences.
Each operation copies the caller's 32-byte key and context before its first
await, creates a fresh random 32-byte data key, and wraps it once with AES-256-GCM
and a fresh random 96-bit IV under the supplied key. The wrapped key is bound to
the header identity. Every media, manifest and final commit record uses the same
ephemeral data key with a distinct 96-bit counter IV starting at one. There is no
automatic encryption retry, resumed counter or data-key reuse between operations.
Record AAD binds the exact header hash, role, sequence, object/index and length;
tags are 128 bits. Native `node:crypto` provides AES-GCM and incremental SHA-256,
with no new dependency.

Media retains the existing 64 KiB canonical frames, 10 MiB object limit, 64 MiB
aggregate and 5,000-entry limit, preserving separate private/public identities,
private order and exact R2 metadata. Manifest metadata and evidence retain their
separate plaintext transport bounds. The manifest itself is encrypted in 64 KiB
chunks. A final encrypted commit binds exact media/frame/manifest/record counts,
the manifest hash and a length-delimited transcript hash of the header and every
prior encrypted record. Exact EOF is required after the commit. The supplied
sink keeps ciphertext staged until `complete` acknowledges the commit.

Opening requires a factory that reopens the same source twice. Pass one fully
authenticates the bounded manifest and transcript, without retaining media.
Pass two rechecks the exact header and authenticated transcript, validates media
hashes and canonical frame/order against that manifest, and only then hands a
final manifest to the plaintext staging sink after the second commit and exact
EOF. Missing, duplicated, reordered, changed, trailing or damaged records leave
staging incomplete. No untrusted manifest starts a plaintext restore. This is a
codec contract, not publication or an operational restore adapter.

Both directions await each supplied read/write, allow at most one outstanding
frame and use an AbortSignal plus an absolute deadline capped at 20 seconds.
Cooperative event-loop yields prevent ready promises from starving revocation.
Owned key buffers are wiped on completion, failure, abort and deadline; pending
caller work cannot resume codec finalization afterward. This is not a claim of
native crypto-handle or JavaScript string zeroization. Supplied sinks must
consume/copy each frame before acknowledgment, keep it inaccessible in staging,
and check the operation signal immediately before final visibility. The codec
cannot undo an arbitrary caller's late side effects or guarantee durability.
Abort attempts cleanup without waiting indefinitely for it.

Synthetic Node coverage includes a file-backed encrypted round trip of 10 MiB
in each plane, reading one ciphertext frame at a time instead of retaining a
20 MiB binary fixture. It also covers wrong keys/context, header/tag/AAD damage,
order/duplication/missing/trailing records, changed second pass, held sink
backpressure, revocation, deadlines and late completion. Both encryption's
`complete` and opening's `writeManifest` are tested with their final
acknowledgment held across cancellation: the operation rejects, its signal is
revoked, and a later acknowledgment cannot return success. The cooperative sink
fixture checks the signal before visibility; this does not promise rollback of
arbitrary caller side effects.

At codec/declaration/native-test revision
`4fe82d9477cbfd5e9ba58f1b4c3ad2515931d2d8`, actual local workerd qualification
passed all four new cases through the existing editorial config and
`nodejs_compat`, without new bindings. It covers native AES-GCM, awaited staged
plaintext, two-pass verification, damaged tags, second-pass truncation,
revocation and hostile typed-array public length/accessor overrides. The command
was `node scripts/dev/heavy-slot.mjs 'pnpm --filter @anipotts/admin exec vitest run --config vitest.editorial.config.ts test/editorial/recovery-media-encryption.test.ts --maxWorkers=1'`
under Node 24.19.0 on 2026-10-19, beginning 07:18:38 UTC; Vitest took 760 ms and
completion was observed at 07:18:58 UTC. The local log is
`/private/tmp/anipotts-recovery-media-encryption-native.log`. The native binary
fixture is 128 KiB; the separate file-backed Node case covers 20 MiB without
whole-media retention. Strict editorial typing, focused formatting, static
security and whitespace checks pass. Two later Node-only final-acknowledgment
regressions bring focused Node coverage to 33 cases without changing codec or
native-test source.

Full `pnpm validate` passed at
`6f2b91182fd652ae1f5286fb66a2b1f4f09e7abd` under Node 24.19.0, beginning
2026-10-19 07:20:37 UTC and observed complete at 07:24:19 UTC. Source and worktree
drift checks were clean. The log is
`/private/tmp/anipotts-capture-codec-full-validation.log`. Repository invariants,
formatting, both app builds, lint and type checks passed. Admin build, lint,
typecheck and test tasks executed on cache misses for the changed tree. The
suite passed 2,361 admin core, 79 Astro, 105 editorial workerd (including these
four codec cases), 84 recovery Node (18 existing, 33 plaintext transport and 33
encrypted codec), 21 recovery workerd and three CSP checks. One existing
browser-gated CSP check was skipped; public 196 and content 206 test results
used matching cache entries. The actual browser/device matrix is not part of
this source-only codec qualification. This evidence checkpoint changes only
this contract after the validated source revision.

These checks qualify the supplied codec only; they do not prove a measured
128 MiB integrated application memory ceiling, provider behavior, custody,
collector coverage or live recovery.

## Proposed browser key and unlock design

Ani accepted local key-file custody and manual re-import after reload/expiry in
owner chat `01a14ffb-519c-73b1-a63a-380f9d7274d0` on October 18. This accepts the
product tradeoff below; encryption is not implemented or approved for release.
Source review on 2026-10-18 used integration revision
`7fcce8d975ce4a1f6045b6f4905539dcd818a7ca`. The approved
[Quiet Precision contract](quiet-precision-delivery.md) requires encrypted pending
input after expiry and owner unlock. Current browser storage does not meet that
requirement. The supplied-snapshot helpers above do not provide browser keys.

Current ownership points:

- `apps/admin/src/lib/browser-recovery.ts`: plaintext v1 reader, v2 envelopes,
  exact opaque exports, acknowledgment tombstones, bounded conflict archives and
  compare-and-swap under record and lifecycle Web Locks.
- `apps/admin/src/lib/draft-recovery.ts`: server-owner-scoped identities,
  logout intent/generation and exclusive cleanup of current recovery namespaces.
- `apps/admin/src/lib/protected-admin-json.ts` and
  `apps/admin/src/layouts/AdminDocument.astro`: protected document admission,
  cross-tab invalidation, response fencing and pagehide/BFCache locking.
- `apps/admin/src/components/astryx/HomeEditor.tsx` and `NewWriting.tsx`: expiry
  attempts a final local recovery write, clears editor memory and requires a real
  authenticated navigation. Explicit logout does not retain those edits.
- `apps/admin/src/components/astryx/BrowserRecoveryNotice.tsx`: current downloads
  contain plaintext current edits as well as exact stored strings.

Recommend one random 256-bit browser-recovery key, separate from operational
snapshot keys, supplied through a small versioned local key file. Setup generates
the key in the authenticated document, offers a deliberate key download, then
requires re-import and a successful encryption/decryption challenge before
enabling encrypted recovery. Download initiation alone does not prove custody.
The application does not select a permanent destination or write a secret store.
The owner keeps this file separately from encrypted recovery exports. Its loss
can make unsaved recovery irretrievable; possessing it and a copy of ciphertext
allows decryption outside Admin. Access remains the only application sign-in.

After authenticated owner entry, unlock imports the supplied key as a
non-extractable Web Crypto key held only in this document's module memory.
In-app navigation can retain it; reload, expiry, pagehide and explicit logout
require another import. No key in localStorage, sessionStorage, IndexedDB,
cookies, URLs, logs, broadcasts or provider bindings. Another tab unlocks
independently. A nonsecret key ID locates the correct key without revealing its
bytes. Do not derive encryption material from Access assertions, CSRF tokens,
owner email or a browser identifier.

Add a separate version-three namespace. Encrypt each complete recovery payload,
including pending retry identity, saved baseline and retained legacy raw strings,
with AES-256-GCM, a fresh random 96-bit nonce and a 128-bit tag. Authenticate a
canonical header containing format/version, key ID, origin, server-issued owner
scope, record kind/ID and logout generation. Validate the decrypted payload with
the existing validators before offering it for comparison. Random-key import,
non-extractable handles and AES-GCM are covered by the
[Web Crypto recommendation](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/).
This limits persisted plaintext; it cannot protect an unlocked document from
same-origin script compromise or guarantee JavaScript memory zeroization.

Keep lifecycle admission, record locking and exact-byte compare-and-swap across
asynchronous encryption. Recheck document/key epochs, logout generation and old
stored bytes before committing and after any await. Expiry stops network work
and new edits immediately, drains already captured local encryption within a
bounded interval, then drops key references and plaintext. Persist continuously
while unlocked; pagehide cannot guarantee completion of a last asynchronous
write. Failure must report the missing recovery guarantee rather than fall back
to a plaintext write. Never hold a key open indefinitely for a failed flush.
Explicit logout retains its current deletion meaning: extend cleanup to v3 and
preserve its exclusive barrier, intent latch and failure reporting. Retaining
encrypted copies after explicit logout would be a separate product decision.

Migration is additive and explicit. Reading v1/v2, corrupt or unknown entries
never rewrites them. First encrypt exact legacy strings into a separate v3 copy,
read it back, decrypt and compare exact bytes. Keep existing tombstone semantics
so acknowledged older edits do not resurrect. Existing plaintext remains until
the owner deliberately chooses migration cleanup after this proof; old tabs can
still create plaintext, so disclose remaining legacy entries and require those
tabs to reload. Do not call the origin fully encrypted while such copies remain.
Changed predecessor bytes are a comparison conflict, not permission to erase or
adopt another tab's version. Storage/quota failure preserves every predecessor.

Missing/wrong keys and unsupported or damaged ciphertext leave exact bytes
untouched and downloadable. Do not replace the key or vault automatically.
Offer server-saved work separately; it does not reconstruct unsaved local input.
Starting a new key creates a separate vault identity and preserves stranded
copies. Normal recovery downloads contain ciphertext and no key; protect any
current in-memory edits before adding them to that download. Until unlock is
available, any explicit plaintext emergency export must be clearly identified
as plaintext and cannot be described as an encrypted recovery download.

Ani accepted manual key custody and re-import after each real document
load/expiry for normal authoring. Keep this bounded first version: a key persisted
alongside ciphertext does not provide the intended locked-storage separation. If the friction is
unacceptable, stop activation and design an approved custody mechanism; do not
silently restore a persistent browser key or add another authentication method.
Envelope versioning, exact migration checks and race fencing are routine
implementation choices once that custody tradeoff is accepted.

Acceptance still requires real desktop and phone browser checks for key custody,
reload/expiry unlock, wrong/lost keys, quota denial, legacy and mixed-version tab
conflicts, interrupted encryption, logout during an absent-key write, BFCache and
encrypted export/import with exact source and retry identity. Synthetic fixtures
must cover header/nonce/tag tampering and no plaintext in new stored/exported
bytes. No browser, runtime or provider change was made for this recommendation.

## External recovery inputs and verification caching

Admin test and editorial type-check tasks now include the external
`scripts/admin/**` helpers in their Turbo inputs. The explicit Admin type-check
inputs also include its editorial tests, test configurations and TypeScript
configurations. Runtime source is unchanged from the full-qualified `6f2b9118`.

Actual Turbo dry runs reproduced the earlier gap: changing only the encrypted
helper left the test hash unchanged, and changing only its declaration left the
type-check hash unchanged. After this correction each helper is present in the
resolved input map and its isolated edit changes the corresponding task hash.
Every disposable probe restored exact original bytes in a finally block. Receipts:
`/private/tmp/anipotts-recovery-cache-before.json`,
`/private/tmp/anipotts-recovery-cache-after.json`,
`/private/tmp/anipotts-recovery-type-cache-before.json` and
`/private/tmp/anipotts-recovery-type-cache-after.json`.

The post-correction full `pnpm validate` passed at
`2deb4fb05a7cf0bf0c9a16bcba23ca39985563ce` under Node 24.19.0, beginning
2026-10-19 07:27:38 UTC and observed complete at 07:30:48 UTC. The log is
`/private/tmp/anipotts-capture-codec-cache-validation.log`. Admin type-check and
test tasks both executed on cache misses (`06a21c1755016fab` and
`5fb3b25441e6767a`). The suite passed 2,361 admin core, 79 Astro, 105 editorial
workerd, 84 recovery Node and 21 recovery workerd cases. CSP passed three checks
with one existing browser-gated skip; public 196 and content 206 used matching
cache entries. All repository invariants, formatting, builds, lint and type
checks passed. HEAD and worktree drift checks were clean; this final evidence
checkpoint changes only this contract. No further heavy run, source/config edit,
production adapter, provider call, remote migration or operational activation
is part of this handoff.

## Additive inactive capture v3 integration

The source-only v3 lane joins bounded control records to the qualified media
frame codec. `recovery-capture-v3.mjs` uses a distinct authenticated format,
`anipotts.editorial-capture.aes256gcm.v3`. Existing offline v1, capture v2 and
standalone encrypted-media v1 formats, methods and limits remain supported.
The v2 collector's 4 MiB collected / 8 MiB envelope restriction remains unchanged;
only the additive v3 path avoids media base64 and whole-object materialization.

A canonical control document contains actual DO SQL, JSON KV metadata/relations,
D1 application rows, the ordered private/public media inventory and capture
proof. The complete document is at most 4 MiB; capture evidence retains its own
256 KiB ceiling. Binary KV chunks do not appear in this document. The exact
legacy source/reference/receipt/relation validator is shared with a separate
metadata-and-inventory path, without fabricated images or placeholder bytes.
Unknown tables, columns, KV keys, binary chunk names, metadata or extra inventory
entries fail closed. The adapter retains the 5,000-entry collector limit.
Media limits remain 10 MiB per object, 64 MiB aggregate and 64 KiB canonical
frames. The same hash identity can appear once in each distinct media plane.

The shared framing engine has explicit media-v1 and capture-v3 profiles. V3 adds
ordered control records before media and the final media manifest. It generates
a fresh ephemeral DEK per seal, wraps it once with the supplied 32-byte key and
a fresh random 96-bit IV, and uses a single non-reused counter-IV sequence for
all records under that DEK. AAD binds the strict format, application/capture
context, role, sequence, object index, chunk index and length. The authenticated
final commit binds exact control byte count/hash, media byte/frame totals,
manifest hash/count and the full length-delimited encrypted transcript. Exact EOF
is required. Owned key buffers are copied before awaits and wiped on completion,
error, deadline or cancellation; native crypto handles and JavaScript strings
have no claimed zeroization guarantee.

`captureRecoveryV3` retains the existing source admission/drain, alarm quiet-window
and DO/D1 fence protocol. It enumerates bounded controls and real metadata;
private chunks are read individually and R2 bytes through conditional 64 KiB
range requests with etag/version/size checks. The caller supplies isolated
artifact staging, acknowledgments and a replayable source. A durable source
receipt is qualified only after artifact acknowledgment, full reauthentication,
media verification and both fence checks. No source writer is automatically
released. `completeRecoveryV3` reauthenticates the supplied artifact before the
existing D1-first / DO-second durable completion transition.

`SuspendedRecoveryTarget.installRecoveryV3` first authenticates exact EOF,
control graph, metadata, complete media order and incremental hashes. Only then
can it claim an empty dedicated target with matching code-owned schemas. A
second source pass must reproduce the same authenticated transcript. Private
chunks go to their original ordered keys; public objects use a known-length
stream and awaited backpressure. The target then recollects bounded controls,
compares application metadata and independently hashes every restored object
through bounded reads. Source provider-generated R2 identity is retained as
capture evidence; target-generated etag/version/upload time may differ. The
visibility marker is committed only after successful codec return and its final
revocation/deadline checks. Failures leave partial targets inaccessible and
suspended; imported alarms and pending work are never executed.

This remains inactive source qualification. `assertRecoveryWriterCohort` still
always rejects production enrollment. Migration `0003` remains unapplied outside
the isolated local fixture. No production import, route, RPC export, collector,
provider binding, custody mechanism or key store is introduced. A supplied sink
must consume/copy a frame before acknowledging it and preserve staging until
successful finalization; the codec cannot undo arbitrary uncooperative sink
side effects. The caller remains responsible for durable encrypted artifact
custody. This does not establish a live backup or a production restore path.

Focused Node qualification currently passes 101 cases, including the existing
84 and 17 new v3 cases. The new large fixture transports 10 MiB in each media
plane alongside more than 4,000,000 bytes of control, spools encrypted events to
task-owned temporary files, verifies exact two-pass replay and observes one
outstanding awaited frame. It also covers wrong keys/context, header/tag damage,
order/duplicate/truncated/trailing records, changed second pass, control limits,
metadata mismatch and held-final-ack cancellation. These are synthetic hash/type
transport fixtures, not image decoding qualification. Strict editorial TypeScript
passes. Three additional actual local DO/D1/R2 cases are wired into the existing
recovery test configuration but have not yet run at this checkpoint. No numeric
128 MiB peak-memory or provider integration claim follows from bounded frame
references or Node file-spool evidence. Full/native qualification remains an
integration-owner gate on the exact frozen source.

The v3 timeout includes synchronous wrapper control/context validation and the
shared engine's capture-plan snapshot. CPU work cannot be preempted, but an
exhausted preflight rejects before an artifact write. Deterministic native
Node regressions hold valid metadata access beyond a tiny budget and prove this
rejection. The legacy media-v1 profile retains its existing behavior.

Final result/receipt hashing also runs inside the active codec operation, before
its final deadline check and owned-key cleanup. A held final-result regression
proves rejection and staged-sink signal revocation at this boundary.
