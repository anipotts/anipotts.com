# Published revision compatibility, R3b

This is a disabled prerequisite for the approved CMS-authoritative system. It
extracts the local publication repository, its existing bootstrap migration and
an additive content-schema contract. It adds no writer route, public reader
activation, provider binding, migration execution, or publishing permission.

## Identities and source

`PublishedSnapshot` is a strict boundary containing `contentSchemaVersion`,
`publicationId`, `record`, `source`, `revision`, `sourceSha256`, and `publishedAt`.
Only content schema 1 is supported. V1 uses the existing YAML frontmatter and
Markdown definitions; any future incompatible semantics must introduce another
version and retain the v1 decoder. Compatible safety checks may be strengthened.
The version must be supplied before a new write and read from storage, never
inferred from frontmatter, inventory version, or the reader's current release.

Existing `(kind, id)` record identities remain stable. A source `slug` changes
routing metadata, not that identity. The repository does not implement redirects
or route reservations. `revision` identifies the originating private draft
revision. In this existing single-record contract, `publicationId` is the stable
operation ID; a future coordinated batch requires a separate batch identity.

`publishedAt` is the immutable activation receipt timestamp, distinct from an
article's frontmatter publication date. Replaying an operation preserves its
original timestamp even when a retry supplies another time. Identity, exact
source, revision, source hash, content schema and original CAS preconditions must
match. A replay never moves the active pointer back to an older revision.

The decoder bounds source to 512 KiB UTF-8, operation IDs to 128 ASCII characters,
and timestamp text to 64 characters. It validates record identity, positive safe
integer revisions, supported schema, valid content and timestamps, and the
SHA-256 of exact source bytes. CRLF, Unicode and authored fields remain intact;
parsed/projection output never replaces source. Unknown envelope fields reject.
Read errors use bounded codes without source or parser details.

## Storage compatibility

`0001_published_snapshots.sql` is preserved byte for byte. It creates immutable
revisions, active pointers and a monotonic inventory version. `0002` adds
`content_schema_version INTEGER NOT NULL DEFAULT 1` without updating authored
rows or disabling immutable-history triggers. Existing records become readable
v1 records. The previous writer's named-column inserts continue receiving v1.

Apply 0002 once through the migration ledger, never during requests. Bootstrap
reruns remain safe; the additive ALTER itself is not an idempotent request-time
initializer. Local tests apply both migrations to an empty database and migrate
a populated bootstrap database, retaining exact source, receipt metadata,
pointers and inventory version. They also execute the previous writer's actual
insert/CAS SQL against the upgraded database and replay its original receipt.

The exported bootstrap and additive SQL each match their checked-in migration.
The migration proof runs in the content package test suite and pre-merge CI.
These SQL files are preflight inputs; their presence does not permit remote
migration or application activation.

## Read and write boundaries

The repository preserves its single-record conditional insert, pointer CAS,
inventory CAS and mutation-count checks. An unsupported writer schema rejects
before any database call. Immutable triggers continue preventing revision
updates and deletion. `getPublishedInventory` reads the version and active rows
in one transaction; callers must reuse that immutable result throughout a public
request. All revision read paths validate the version and exact source hash.
Active-pointer identity mismatches or dangling pointers reject rather than
silently dropping an override and exposing bundled content.

Tests use local Node SQLite with real SQL and explicit rollback. They do not
establish Cloudflare D1 transaction semantics, multi-record atomic publication,
durable completion, backup readiness, or recovery targets. Those remain required
before activation, including the actual-provider stale-member batch test.

## Next dependent changes and activation gates

R5 must require an explicit public-reader authority mode. In CMS-required mode,
missing bindings, failed queries, unsupported schemas or invalid records must
return unavailable, never an empty inventory or fallback to Git. Runtime loaders
must require a context; bundled/build-only callers must be explicit. The current
canonical reader still lacks these rules and is not extracted by this change.

Deploy compatible readers before writers, then activate only after the approved
recovery and release gates pass. Preserve the supported previous compatible
reader for the planned mixed-version window. After the first CMS publication,
Git-only releases are below the rollback floor. This increment alone does not
create a compatible deployed reader or authorize its activation.

R4/R7 still own media manifests, restore proof, explicit lifecycle/redirect
state, batch receipts and durable orchestration. The existing single-record
function must not be looped to simulate an approved atomic batch. Future version
transitions, publication and media activation remain reviewed work; every PR
waits for Ani's review before merge.
