# Direct publication repository and dedicated migration receipt

2026-09-12. Local implementation and tests only. No production database,
configuration, credentials, or user-authored source was mutated by this worker.

## Repository contract

`@anipotts/content/editorial/direct-publication` exports immutable snapshot reads,
active inventory reads, operation receipts, history and conditional publication.
Publication validates existing record/source schemas and hashes exact source
bytes. The approval service owns authorization, complete-inventory validation,
media promotion and invocation. Private drafts must never enter this database.

`getPublishedInventory` reads the version and active snapshots in one D1 batch.
`publishDirect` compares both the record pointer and inventory version. Conditional
snapshot insertion, pointer update, and version bump execute in one serialized
D1 batch. SQLite `changes()` gates subsequent writes. A CAS conflict inserts
nothing. Reusing an operation ID with changed payload returns an idempotency
conflict. Replaying a successful operation returns its original timestamp and
snapshot without reactivating history or bumping the global version. A new server
timestamp alone does not change retry identity. Rollback republishes historical
source through a fresh approved operation and current CAS.

SQL triggers prevent update/delete of immutable revisions. Reads return active
snapshots or explicit null, and propagate storage failure rather than inventing
an empty successful inventory. No D1-specific package or worker runtime types are
imported; structural prepare/bind/read/batch interfaces are used.

## Separate CONTENT_DB release lane

The migration directory is `apps/admin/migrations/content-publication`, bound
through the root-owned CONTENT_DB config. It must never target anipotts-db.
Existing private database migration commands and manifest remain unchanged.

Release classification emits `content_db_changed` and
`content_db_migration_allowed`. Only an added, exact SHA-256-reviewed bootstrap
is eligible; edits, deletes, unknown migrations and hash drift are held. The
bootstrap includes reviewed immutability triggers, not a blanket exception to
the generic trigger policy. Required native checks and rollout gates remain.

The release job runs local proof, rejects a held lane, reads the dedicated remote
schema, accepts only empty or exactly the public publication schema, captures a
Time Travel bookmark, applies through CONTENT_DB, and verifies exact schema
before consumers deploy. Only D1 bookkeeping names d1_migrations and _cf_KV are
excluded from comparison. Unrelated/private tables cause a hard failure.
Schema verification is read-only and rejects unsuccessful or writing query
results. Initial provisioning and remote execution remain root responsibilities.

Shared repository changes and the publication migration classify to www/admin;
no unrelated worker target is selected. This work does not verify a live deploy.

## Local verification

- Eight repository tests pass against real node:sqlite, with a structural D1
  adapter executing atomic BEGIN/COMMIT/ROLLBACK batches. Cases include exact
  source, active-only reads, replay, CAS, operation reuse, pointer failure rollback,
  invalid input, historical rollback, and SQL immutability.
- Content package `tsc --noEmit` passes.
- Standalone migration proof passes schema parity and repeated empty/populated
  application, preserving snapshots, operation uniqueness, pointers and version.
- Remote-result schema verifier tests pass exact/empty cases, bookkeeping,
  unrelated tables, failed queries and unexpectedly writing queries.
- Release-policy, deployment-plan and compute-deploy-targets tests pass.
- Changed JS/TS/YAML formatted. Cloudflare D1 runtime behavior, Time Travel and
  provider permissions require root's remote proof; SQLite proof is not D1 proof.

## File hashes

- `packages/content/src/editorial/direct-publication.ts`: `c788ba7459f31ddce58d8a881963478d2ca1aece08895e43196abbb211450fd5`
- `packages/content/src/editorial/direct-publication.test.ts`: `9983ecc48172e51def3a0a351dfd3e08f4ed08ab94d22a0d74ea88abf853c9b7`
- `apps/admin/migrations/content-publication/0001_published_snapshots.sql`: `564cf948009acd41e8256b6c3dc6194057a20d040d64de2ec161a09dc8d44817`
- `scripts/ci/content-publication-migration-proof.mjs`: `22f0df127c8748b26e434edbf8bc974d18d20b1005c6de7aba06e176742343f4`
- `scripts/ci/content-publication-schema-proof.mjs`: `93ad2484d999d9f296623db74b1162595398ededc7923f8c0e9e482f0b987e2a`
- `scripts/ci/content-publication-schema-proof.test.mjs`: `da6f62e5e8bb11325ca78416b47e4f96d50840da0b43d86d888d2b820ca6ad41`
- `scripts/ci/migration-policy.mjs`: `7f61e4844066bc6d0f7dc86b16fc46f94116fca8f956d8a9300080380d9af689`
- `scripts/ci/release-policy.mjs`: `d039d55d0e7088e1a682e02eff4d46c1d615f7588b5763dbec5c8f5e6b7f57e2`
- `scripts/ci/release-policy.test.mjs`: `6e176bcfb7fbe98a81ae2d111ed1b644c6ade13b2339e3c22be65405df60ea12`
- `.github/workflows/deploy.yml`: `36da4b3eeec6a25603b9d91d4a30538d4f3edc34eb30d7e9b65bbf76f4e6f506`
