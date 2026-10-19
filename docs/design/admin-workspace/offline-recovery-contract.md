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
