# Platform architecture

Updated: 2026-09-08. Release completion evidence lives in [the site release review](site-release-review-2026-09-07.md).

## Active surfaces

| Surface            | Source                 | Role                                                                     |
| ------------------ | ---------------------- | ------------------------------------------------------------------------ |
| anipotts.com       | `apps/www`             | Public Astro pages, Git-backed work and writing, newsletter endpoints    |
| admin.anipotts.com | `apps/admin`           | Astro admin behind Cloudflare Access, editor, previews, operations state |
| api.anipotts.com   | `workers/state`        | Durable state and authenticated command relay                            |
| Ingest             | `workers/ingest`       | Scheduled ingest and authenticated event receivers                       |
| Newsletter         | `workers/newsletter`   | Subscription and issue queue consumer                                    |
| Weekly email       | `workers/weekly-email` | Scheduled operational summary                                            |

The legacy Solid app and deploy target are removed. Historical source is recoverable through Git; the cleanup does not delete any production worker or database. Active Astro route and authentication tests remain independent of retirement.

The four retained workers still have explicit routes, cron schedules, queues, or Durable Object bindings. They are operational functionality, not public-page rendering dependencies. Their outbound and data-mutation boundaries remain intact.

## Public content ownership

- `content/public/pages`: approved page copy
- `content/public/projects`: stable work records, visibility, media and detail content
- `content/public/writing`: essays, original dates, publication states and metadata
- `packages/content/src/public/site.ts`: site identity, origin, contact, navigation and social links
- `packages/content/src/public/schema.ts`: canonical project/writing frontmatter validation shared by Astro and generation
- `packages/content/src/public/providers.ts`: approved workflow artwork
- `packages/content/src/public/visibility.ts`: public inclusion rules

Two generated projections have active consumers: typed defaults for app rendering/adapters, and an admin review JSON projection. Generation is one-way from canonical sources and drift-checked. The unused validation JSON, future database seed, and reverse-bootstrap mode are removed.

Public pages do not read D1 CMS content. Admin can review source-controlled copy and keep proposals and operational records separately. Stored identifiers such as `making` and `project:<slug>` survive only at compatibility boundaries. They do not create another published dataset. Historical migrations and production data are unchanged.

`/work` owns the public work index and details. Permanent old-URL redirects remain in the public middleware. Hidden projects and unpublished writing return 404 at detail URLs. Feeds, sitemap and release smoke consume the same public content inclusion decisions.

## Shared code

| Package                         | Responsibility                                           |
| ------------------------------- | -------------------------------------------------------- |
| `packages/content`              | Public contracts/settings and admin content review logic |
| `packages/types`                | Shared app and operational contracts                     |
| `packages/lib`                  | Admin-control runtime and the Drizzle migration schema   |
| `packages/brand`                | Marks, fonts, shared tokens and typography               |
| `packages/control-plane-runner` | Local relay client, journal and proof outbox             |

The old database-first public readers, fallback datasets, Solid-only services and unused package exports are removed. Astro admin consumes the admin-control entrypoint; root Drizzle tooling still consumes the database schema. Worker and runner implementations remain in their own active packages.

## Authentication and production boundaries

Cloudflare Access is the only Admin sign-in. Middleware verifies the signed Access assertion for the exact owner; editorial reads and writes require it, other pages accept it for reads only, and sign out ends the Access session. The passkey, password, invite, recovery, device and native D1 session code was removed on 2026-09-22 and is recoverable from the `archive/admin-retired-auth-2026-09-22` tag. Its D1 tables and migrations stay in place.

The protected route inventory in `scripts/ci/admin-route-inventory.mjs` drives the route parity and smoke checks. Newsletter controls retain their existing authorization checks. Admin no longer binds the command relay or serves the MCP, projection, knowledge, control-plane or compatibility write APIs; the relay itself stays in `workers/state`. Public code must not import admin-only contracts or operational write tables; `pnpm test:public-boundary` enforces this separation.

## Verification and releases

The four workflows are `ci.yml`, `security-review.yml`, `deploy.yml` and `smoke.yml`. No external paid model review workflow is allowed.

- `check:changed` defaults to the committed PR diff.
- `check:changed --working-tree` also includes staged, unstaged and untracked files.
- `validate` checks the whole workspace.
- `content:check` checks generated content drift.
- `test:admin-solid-retirement` prevents the retired app or deploy target returning.

Deployable changes use same-repository PRs and exact-current-head provider checks. The release classifier selects affected targets; deleting the old deployment job must not select unrelated workers. Existing production migration and authenticated-smoke gates remain enforced.

See [release architecture](release-architecture.md), [local development](local-development.md), and [worker inventory](worker-inventory.md). Older dated architecture proposals are historical context, not alternate executable contracts.
