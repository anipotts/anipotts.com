# anipotts.com

Ani's public website and private admin, both built with Astro and deployed to Cloudflare Workers.

## Development

Use Node 24.19.0 and pnpm 10.5.2.

```bash
pnpm install --frozen-lockfile
pnpm dev:www
pnpm dev:admin
pnpm dev:status
```

Public preview: http://anipotts.localhost:1355/. Admin preview: http://admin.anipotts.localhost:1355/.
The managed admin review preview on http://localhost:4311/ is separate; preserve it while review is active.
See [local development](docs/local-development.md).

## Content

- Published pages and records: the `anipotts-content` D1 store, maintained through production Admin.
- Git seed content and source baselines: `content/public`.
- Shared identity/navigation defaults: `packages/content/src/public/site.ts`; reviewed CMS overrides use the home record.
- Approved workflow artwork registry: `packages/content/src/public/providers.ts`.
- `pnpm content:generate` derives typed defaults from the Git seed.
- `pnpm content:check` rejects drift without changing files. Generated files are never independently edited.
- Private drafts and read-only operational data remain separate from published content.

## Current work

- [ ] Review #539 at `f8e90810` for browser recovery protected by a saved local key file. Full local and hosted checks pass; the proposed deployment affects Admin only.
- [ ] Finish provider and operational qualification for draft media #540 and recovery #541. Their source checks pass, including bounded encrypted v3 capture/restore; custody, external-copy, migration and activation gates remain open.
- [ ] Refresh draft #542 after the next approved merge, then review removal of the unused Drizzle CLI. Full source checks pass; no runtime targets are selected.
- [ ] Resolve named live acceptance/provider gates in the [current completeness audit](docs/website-completeness-audit.md).

#529/#530/#531 and consolidated dependency/usability #538 are merged and deployed.
#538 released all six approved targets at `79592009`, without a migration.
#532's successful release selected no runtime targets because it changes browser tooling and documentation.

The [source preparation checkpoint](docs/website-source-preparation.md) records
PR containment, verification and remaining work. Earlier receipts stay in that
record and the [integration queue](docs/integration-queue.json).

Public routes are `/`, `/work`, `/work/[slug]`, `/writing`, `/writing/[slug]`, `/systems`, `/links`, and the newsletter routes.
Permanent compatibility redirects live in `apps/www/src/middleware.ts`.
Hidden work and unpublished writing have no successful public detail route.

## Checks and release

```bash
pnpm check:changed                # includes committed, staged, unstaged and untracked changes
pnpm check:changed --commits-only # committed branch diff only
pnpm validate                     # full workspace checks and builds
```

Ignored files stay excluded. `--working-tree` remains a compatible alias for the
default local scope. Use `--commits-only` when intentionally checking a committed
tree; it omits uncommitted work. The shared CI file collector retains its
committed-tree default.

Deployable changes use a same-repository PR and exact-head protected checks.
Deploy only affected targets and verify the released SHA.
See [release architecture](docs/release-architecture.md) and [platform architecture](docs/platform-architecture.md).

The active apps are `apps/www` and `apps/admin`. Legacy Solid source is retired; rollback uses a previous verified Astro deployment. Production workers and databases are not deleted by source cleanup.
Historical design notes remain in [docs/archive](docs/archive).
