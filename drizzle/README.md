# drizzle/

migrations for `anipotts-db`, the Cloudflare D1 (sqlite) database that admin owns.

## authority

`drizzle/migrations/manifest.json` is the deploy authority for `anipotts-db`.

- `owner` names admin's `DB` binding in `apps/admin/wrangler.toml` and this migrations directory.
- `bootstrap` is `verified`, with `baseline_through` set to `0043_admin_auth_v2.sql` and `automatic_remote_apply` set to true.
- `historical` lists 41 applied files, 0001 through 0043, each locked by sha256. numbers 0038 and 0039 are unused.
- `migrations` holds one record per file after the baseline: checksum, risk, consumers, preconditions, postconditions, rollback and schema fingerprints.

`manifest.json` is an approval path in `scripts/ci/release-policy.mjs:69`. `node scripts/ci/migration-policy.mjs` checks the migration files against it.

## how a migration ships

1. add `drizzle/migrations/NNNN_name.sql` and its `migrations` record. `scripts/ci/migration-policy.mjs:22-47` rates the sql: only `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` and `INSERT OR IGNORE` are automatic. anything else needs approval.
2. a ready pr runs "Validate migration inventory and replay" (`.github/workflows/ci.yml:176-178`): the ledger bootstrap and schema docs tests, local replay, and the site and publication migration proofs. the light schema docs test also runs on every ready pr (`.github/workflows/ci.yml:125-127`), so changes to deployed sql or quarantine docs are checked without requiring migration replay.
3. after merge, `.github/workflows/deploy.yml` stops unless the migration is eligible and `config/release-train.json` sets `automatic_migrations` to `enabled_safe_additive` (`deploy.yml:162-166`). the `production-gate` job (`deploy.yml:172-253`) waits for Production approval, rejects schema drift, captures a D1 time travel bookmark, checks preconditions, runs `wrangler d1 migrations apply anipotts-db --remote --config apps/admin/wrangler.toml`, checks postconditions and verifies the new schema fingerprint.

nobody runs remote D1 commands by hand. for local proof, use `pnpm test:migration-local` and `pnpm test:site-migrations`.

## applied state

- every `historical` file is applied. the 2026-08-24 bootstrap recorded 40 names in the D1 ledger without replaying them, then applied `0043_admin_auth_v2.sql` once through wrangler (`manifest.json:22`).
- `0003_reconcile.sql` and `0004_drop_dead_tables.sql` are recorded as applied. their destructive statements are comments (`0003_reconcile.sql:48-51`, `0004_drop_dead_tables.sql:10-16`), so recording them dropped nothing. their header comments about applying by hand are stale, and the checksum lock keeps both files as written. that the 0003 fts objects exist live rests on that file's own comment (`0003_reconcile.sql:11-12`).
- `migrations` holds 1 record. deploy run 35144354076 applied `0044_copy_agents_project_page_content.sql` on 2026-09-16.

editing a recorded file fails `verifyManifest` (`scripts/ci/migration-policy.mjs:53-78`).

## schema.ts

`packages/lib/src/db/schema.ts` is a historical drizzle model. it models 52 tables: 21 tables predate drizzle and 31 tables come from migrations in this directory.

- nothing imports it at runtime. only `drizzle.config.ts:4` and `knip.jsonc:55` name it, and `@anipotts/lib` has no exports.
- it does not model `admin_proof_events` (`0012_admin_proof_events.sql`), or the `thoughts_fts` virtual table and its 3 triggers (`0003_reconcile.sql:21-41`).
- `drizzle.config.ts` and `drizzle/meta/_journal.json` stay. the journal lists only 0001 and 0002, and no script runs drizzle-kit. migrations are hand-written sql.
- the manifest's 64 tables is the bootstrap's sqlite_master count, so it does not compare with the model.

admin binds the database (`apps/admin/wrangler.toml:45-49`, the only config with `migrations_dir`) but reads nothing from it. www (`apps/www/wrangler.toml:40-43`), ingest, newsletter and weekly-email bind it too.

`scripts/ci/d1-schema-docs.test.mjs` checks this file against the manifest, the migrations, schema.ts, deployed sql and the cited quarantine docs.

## table classification

each schema.ts table has one class, taken in this order: live, quarantined, baseline, unreferenced. deployed sql means a `FROM`, `INTO`, `UPDATE`, `JOIN`, `TABLE` or `EXISTS` keyword followed by the whole table name in a source string or template literal under `apps/*/src` or `workers/*/src`, other than tests and fixtures. matching requires a recognizable sql statement, ignores keyword case, and excludes code comments, sql comments and single-quoted sql values; astro checks use server frontmatter. a quarantine source is a commented `DROP TABLE` in a migration, or a paragraph of a cited doc that calls the table quarantined.

| class        | count | meaning                                                                              |
| ------------ | ----- | ------------------------------------------------------------------------------------ |
| live         | 9     | deployed sql reads or writes it                                                      |
| quarantined  | 11    | no deployed sql; a quarantine source marks it dead and holds drops                   |
| baseline     | 9     | predates drizzle, with no `CREATE TABLE` in `drizzle/migrations` and no deployed sql |
| unreferenced | 23    | a migration in this directory creates it; no deployed sql                            |

this classification proposes no drops. dropping any table is a destructive production change that waits for ani.

| table                          | class        | origin      | evidence                                                                                                          |
| ------------------------------ | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `thoughts`                     | baseline     | pre-drizzle | content table of the 0003 fts triggers                                                                            |
| `atoms`                        | baseline     | pre-drizzle | none                                                                                                              |
| `projects`                     | baseline     | pre-drizzle | none                                                                                                              |
| `social_links`                 | baseline     | pre-drizzle | none                                                                                                              |
| `page_content`                 | quarantined  | pre-drizzle | ledger A-21 (`docs/worker-inventory.md:204-208`); 0044 target; ci read at `scripts/ci/d1-ledger-bootstrap.mjs:54` |
| `site_settings`                | baseline     | pre-drizzle | none                                                                                                              |
| `github_events`                | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:10`                                                                  |
| `contact_submissions`          | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:11`                                                                  |
| `content_config`               | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:12`                                                                  |
| `content_schedule`             | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:13`                                                                  |
| `update_alerts`                | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:14`                                                                  |
| `metrics_cache`                | baseline     | pre-drizzle | none                                                                                                              |
| `status_checks`                | baseline     | pre-drizzle | `0001_service_registry.sql:37` adds `service_id`                                                                  |
| `favorite_numbers`             | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:15`                                                                  |
| `business_data`                | baseline     | pre-drizzle | none                                                                                                              |
| `analytics_events`             | quarantined  | pre-drizzle | commented drop at `0004_drop_dead_tables.sql:16`; ledger A-21                                                     |
| `ops_snapshots`                | quarantined  | pre-drizzle | ledger A-21 (`docs/worker-inventory.md:204-208`)                                                                  |
| `code_health`                  | quarantined  | pre-drizzle | ledger A-21 (`docs/worker-inventory.md:204-208`)                                                                  |
| `daily_rollups`                | baseline     | pre-drizzle | none                                                                                                              |
| `email_queue`                  | live         | pre-drizzle | `workers/weekly-email/src/index.ts:48`                                                                            |
| `service_registry`             | unreferenced | 0001        | none                                                                                                              |
| `brands_emails`                | live         | 0002        | `workers/ingest/src/index.ts:246`                                                                                 |
| `rate_limits`                  | live         | pre-drizzle | `apps/www/src/lib/api.ts:85`                                                                                      |
| `newsletter_subscribers`       | live         | 0005        | `apps/www/src/lib/newsletter.ts:174`, `workers/newsletter/src/index.ts:112`                                       |
| `newsletter_preferences`       | unreferenced | 0005        | none                                                                                                              |
| `newsletter_issues`            | live         | 0005        | `workers/newsletter/src/index.ts:286`                                                                             |
| `newsletter_deliveries`        | live         | 0005        | `workers/newsletter/src/index.ts:279`                                                                             |
| `newsletter_events`            | live         | 0005        | `apps/www/src/lib/newsletter.ts:229`, `workers/newsletter/src/index.ts:117`                                       |
| `newsletter_tokens`            | live         | 0005        | `apps/www/src/lib/newsletter.ts:146`, `workers/newsletter/src/index.ts:475`                                       |
| `newsletter_suppressions`      | live         | 0005        | `apps/www/src/lib/newsletter.ts:179`, `workers/newsletter/src/index.ts:303`                                       |
| `admin_passkey_credentials`    | unreferenced | 0006        | ci fixture ddl at `scripts/ci/site-migrations-local-proof.mjs:99`                                                 |
| `admin_passkey_challenges`     | unreferenced | 0006        | ci fixture ddl at `scripts/ci/site-migrations-local-proof.mjs:106`                                                |
| `admin_passkey_sessions`       | unreferenced | 0006        | none                                                                                                              |
| `admin_passkey_audit`          | unreferenced | 0006        | ci fixture ddl at `scripts/ci/site-migrations-local-proof.mjs:110`                                                |
| `admin_users`                  | unreferenced | 0043        | none                                                                                                              |
| `admin_sessions`               | unreferenced | 0043        | none                                                                                                              |
| `admin_invites`                | unreferenced | 0043        | none                                                                                                              |
| `admin_device_authorizations`  | unreferenced | 0043        | none                                                                                                              |
| `admin_external_identities`    | unreferenced | 0043        | none                                                                                                              |
| `admin_recovery_requests`      | unreferenced | 0043        | none                                                                                                              |
| `admin_machine_tokens`         | unreferenced | 0043        | none                                                                                                              |
| `admin_security_notifications` | unreferenced | 0043        | none                                                                                                              |
| `content_records`              | unreferenced | 0007        | none                                                                                                              |
| `content_draft_operations`     | unreferenced | 0007        | 0044 target; ci read at `scripts/ci/d1-ledger-bootstrap.mjs:56`                                                   |
| `content_publish_events`       | unreferenced | 0007        | none                                                                                                              |
| `admin_events`                 | unreferenced | 0037        | none                                                                                                              |
| `admin_inbox_items`            | unreferenced | 0037        | none                                                                                                              |
| `admin_piece_states`           | unreferenced | 0037        | none                                                                                                              |
| `admin_fleet_status`           | unreferenced | 0037        | none                                                                                                              |
| `admin_deploy_states`          | unreferenced | 0037        | none                                                                                                              |
| `admin_capability_states`      | unreferenced | 0037        | none                                                                                                              |
| `admin_knowledge_cards`        | quarantined  | 0041        | `docs/platform-architecture.md:50`                                                                                |
