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
