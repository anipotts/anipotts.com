# Offline editorial recovery fixture contract

`scripts/admin/editorial-recovery.mjs` is a pure supplied-snapshot formatter,
reference validator and isolated memory restore adapter. It has no filesystem,
provider, network, route, job, alarm, publication or production restore capability.
The fixture tests run through the normal `test:editorial-cli` check. This does not
activate an operational backup or change the current production stores.

## Covered supplied state

The version-one adapter requires all eight current editorial Durable Object SQL
tables and all three current content publication D1 tables, with their exact
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

## Integrity and isolated restore

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

The sole restore target is empty isolated memory. Validation completes before
installation; a nonempty target or custom/provider target rejects. Returned
copies cannot mutate its retained state. Pending intent, lease and alarm bytes
remain evidence and are never scheduled, retried, executed or published.
Canonical SQLite fixture restoration separately reopens the real current SQL
schemas, reinstates their constraints/triggers and proves all covered rows and
references with more than 100 versions. It performs no real provider import.

## Historical and operational limits

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

There is no live consistent capture adapter, D1/R2 exporter/importer, migration
ledger/configuration export, operational authentication/custody design, external
copy, restore deployment or scheduling implementation here. The supplied table
projection cannot attest that a provider omitted no rows or objects. The current
publisher has no redirect store; unknown route/configuration state is unsupported
rather than manufactured or silently dropped. Missing external D1 databases or
buckets are not covered by this adapter. The encrypted operational backup,
one-hour loss target and one-working-day recovery drill from Quiet Precision
remain unproven until separately authorized, protected integrations and an actual
isolated operational drill exist. No live private export was used for this proof.

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
