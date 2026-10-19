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

Use `pnpm dev:status` for this checkout’s URLs. The canonical review checkout and
public URL are recorded in [the integration lane](docs/local-integration-preview.md).
Preserve its managed admin review preview on http://localhost:4311/ while review is active.
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

- [ ] Qualify and review refreshed [#541](https://github.com/anipotts/anipotts.com/pull/541) portable recovery against merged #539. The earlier source/native checks pass, including bounded encrypted v3 capture/restore; the refreshed combined tree needs owner qualification. Operational admission, custody, external-copy, migration and restore gates remain open.
- [ ] Complete the held provider and resource acceptance gates for draft [#540](https://github.com/anipotts/anipotts.com/pull/540) media processing. The qualified foundation remains inactive.
- [ ] Finish refreshed qualification and review for draft [#542](https://github.com/anipotts/anipotts.com/pull/542), which removes the unused Drizzle CLI and its moderate advisory. One low upstream KaTeX advisory remains; no runtime targets are selected.
- [ ] Resolve named live acceptance/provider gates in the [current completeness audit](docs/website-completeness-audit.md).

#539 was approved and merged as `cf7b757b`. [Release 39272399483](https://github.com/anipotts/anipotts.com/actions/runs/39272399483) deployed Admin only; all other targets were skipped, no migration ran, and private routes retain the Access boundary.

#538 is merged and deployed as `79592009` to all six targets. Exact-release public smoke, provider identity and admin Access boundary checks pass; no migration.

#529/#530/#531 are merged and deployed. #532 is merged; its successful release
selected no runtime targets because it changes browser tooling and documentation.

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
