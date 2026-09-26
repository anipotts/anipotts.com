# local development

Local development runs plain Astro dev servers bound to `127.0.0.1`. Each
worktree gets its own stable pair of ports from `4400` to `4999`, www on the
even port and Admin on the next one, so several worktrees run side by side and
a restart keeps the same URLs. Nothing is installed globally and no proxy runs.

- public site: `http://127.0.0.1:<www port>/`
- Admin: `http://127.0.0.1:<admin port>/`
- Admin fallback when Admin review is active: `http://localhost:4311/`

`pnpm dev:status` prints this worktree's URLs. To pin them, set
`ANIPOTTS_WWW_PORT` and `ANIPOTTS_ADMIN_PORT` before `pnpm dev:*`; ports
`1355`, `4311`, `8787` and `8871` are refused because other local tools own
them.

All local actions, CI, and deploy jobs use Node `24.19.0`, pinned in `.nvmrc`.
The launcher selects that runtime through NVM when available and exits early
with one install command when the current runtime is unsupported.

Start only the surface being reviewed:

```bash
pnpm dev:www
pnpm dev:admin
pnpm dev:all
```

`dev:www` starts only the public Astro process. `dev:admin` starts the Admin
process and the managed `localhost:4311` fallback. `dev:all` starts both.
Admin links to this worktree's www dev server through `PUBLIC_DEV_SITE_URL`,
which the manager sets.

Inspect ownership and health without changing anything:

```bash
pnpm dev:status
pnpm admin:preview:status
```

Stop only the dev servers this worktree started:

```bash
pnpm dev:stop
```

The stop command leaves the managed Admin fallback alone and keeps the
recorded ports. Use `pnpm admin:preview:stop` only when Ani explicitly ends the
Admin feedback loop.

## astro 7 dev runtime

Since Astro 7 and `@astrojs/cloudflare` 14, `astro dev` runs each app inside
workerd through the Cloudflare Vite plugin, using the Worker entry and bindings
from the app's `wrangler.toml`. Bindings are local only (`remoteBindings:
false`) and persist under `apps/<app>/.wrangler/state`. Routes read them
through `src/lib/runtime-env.ts`, never `locals.runtime`.

- **Local content database.** `pnpm dev:www` and `pnpm dev:admin` bootstrap
  the app's local `CONTENT_DB` before starting Astro: they apply the
  migrations in `apps/admin/migrations/content-publication` and seed the Git
  records with `scripts/content/seed-content-d1.mjs --local`, only when the
  database is missing, unmigrated or unseeded. The log says either
  `local content database ready` or `local content database: bootstrapping`.
  Every command passes `--local`; `scripts/dev/local-content-db.mjs` refuses
  `--remote`.
- **Local drafts use the production path.** Admin in `astro dev` edits
  through the same `productionEditor(env)` as the deployed Worker: the
  `EditorialDraftStore` Durable Object exported by `src/worker.ts`, the local
  `CONTENT_DB` for published bases, and the local `CONTENT_MEDIA` bucket.
  Drafts, autosave, history, restore, discard, previews and image uploads all
  persist in `apps/admin/.wrangler/state`, which `pnpm preview:admin:owner`
  shares. Publishing stays off locally because `PUBLIC_RELEASE_SHA` is not a
  release commit; the editor says "Publishing is available in the production
  editor. This draft stays local."
- **Old local drafts.** Before Astro 7, local drafts lived in a separate
  Miniflare store under `.local/editorial-drafts`. Nothing reads that
  directory any more. It is inert and kept; copy anything you need from it by
  hand.
- `run_worker_first = true` sends every dev request to the Worker, including
  Vite's module and client URLs. Both Worker entries hand those to the dev
  `ASSETS` binding (Vite's middleware) through
  `apps/www/src/lib/vite-dev-request.ts`; builds compile that branch out.
- Known dev-only gap: the draft preview is a sandboxed frame with an opaque
  origin, and Astro 7's dev server refuses its cross-site subresource
  requests (`Cross-origin request blocked`). Uploaded draft images therefore
  show as broken inside `/preview/record` and `/preview/home` under
  `astro dev`; the editor itself shows them, and the deployed Worker has no
  such guard. The guard is left on rather than weakened for local media.
- Astro 7 runs `astro dev` in the background when it detects a coding agent.
  The dev server manager and the managed preview pass `--ignore-lock`, which
  keeps the server in the foreground under their control.

## safety model

The manager only ever runs `astro dev --host 127.0.0.1 --port <port>` for a
port it assigned, records the process under ignored `.local/dev-servers/`, and
stops only a process whose command matches that record. It does not install a
service, request `sudo`, trust a CA, edit `/etc/hosts`, or bind a LAN
interface. When an assigned port is taken by another process, it stops and
names the port instead of choosing a different one silently.

Admin's development preview allowance accepts only `GET` and `HEAD` for the
private workspace paths listed in `apps/admin/src/lib/admin-access-policy.ts`
(`DEV_LOOPBACK_PREVIEW_PATHS` plus the Content record and newsletter patterns),
including Content, Life and Operations views. It requires Astro development
mode and a plain HTTP loopback origin (`localhost`, `127.0.0.1` or `[::1]` on
any port), so a clean linked worktree can review private pages without the
managed fallback. Production middleware, protected APIs, write routes and
Cloudflare Access are unchanged.

## local owner

The read-only preview allowance cannot reach authenticated APIs, record
editing, or writes to the local editorial Durable Object. Start a local owner
session from a linked worktree when a task has to exercise every authenticated
Admin route:

```bash
pnpm dev:admin:owner      # Admin dev server for this worktree
pnpm preview:admin:owner  # production build served by local wrangler dev
pnpm build:admin:owner    # production build only
```

`dev:admin:owner` starts only this worktree's Admin server with
`ADMIN_LOCAL_OWNER=1`. It never starts or changes the managed
`localhost:4311` fallback, and it refuses to reuse a route started in the other
mode; run `pnpm dev:stop` first. `pnpm dev:admin` strips an inherited
`ADMIN_LOCAL_OWNER` value, so the default server stays unchanged, and
`pnpm admin:preview:ensure` strips it the same way, so the shared
`localhost:4311` preview is never a local owner build.

`preview:admin:owner` builds into the ignored
`apps/admin/.local/local-owner-dist`, never `apps/admin/dist`, and serves it
at `http://127.0.0.1:8871/` through local wrangler dev with the local D1 and
Durable Object state `astro dev` uses. The served config copies
`apps/admin/wrangler.toml` without its production route: with a route,
wrangler dev rewrites `Host` to `admin.anipotts.com`, which fails the loopback
check and would also hide a DNS rebinding hostname. Set
`ADMIN_LOCAL_OWNER_PORT` to use another port; `4311` and the dev server range
`4400` to `4999` are refused.
The editorial API answers `editor_not_configured` there because the Worker
secrets are not present locally.

How the session is bounded:

- `ADMIN_LOCAL_OWNER=1` is read once by `apps/admin/astro.config.mjs` and
  compiled into the `__LOCAL_OWNER_BUILD__` constant. Worker bindings, wrangler
  vars, cookies, headers and query strings cannot enable it. Any other value
  fails the build, and so does setting it in GitHub Actions.
- Middleware grants the synthetic `local-owner@localhost` identity only when
  the request URL is `localhost`, `127.0.0.1` or `[::1]`, `Host` matches
  that URL,
  forwarded host and client headers are all local, and a browser write is
  same-origin. Public auth paths keep their native flow.
- Middleware never sees the peer address, so the server must listen on
  loopback. With the flag on, `astro dev` exits before it listens when
  `server.host` or Vite's resolved host is anything but `localhost`,
  `127.0.0.0/8` or `::1`: `--host`, `--host 0.0.0.0`, `--host ::` and a LAN
  address all fail. The dev server manager passes `--host 127.0.0.1`.
  `preview:admin:owner` pins wrangler
  dev to `127.0.0.1` in both its flags and its config. A TCP relay you run on
  this machine that forwards other clients to loopback cannot be detected, so
  never point one at a local owner port.
- Every local owner response sends `frame-ancestors 'none'`, merged into any
  policy the route already set. The draft preview keeps its own
  `frame-ancestors 'self'` so the editor can still embed it.
- Every method is allowed, so local D1 and the local editorial Durable Object
  accept writes. Route handlers keep their own checks: editorial writes still
  need their CSRF token.
- A `Local owner` laptop tile beside the sidebar wordmark marks every
  Content, Data and Observability screen from 641px, in both themes. The
  one-row phone top bar holds no device tile.
- Release builds compile the path out. Deploy jobs fail when the flag is set,
  and the Admin deploy scans its exact bundle with
  `node scripts/ci/admin-local-owner-leak.mjs --expect absent apps/admin/dist`
  before it runs wrangler.

## sample data in the local preview

Data and Observability cannot read real records or ops state from a local
preview, by design:

- no credential can be issued locally: there is no reader signing key, and the
  Cloudflare Access identity the issuance routes require is absent on loopback;
- the reader on ap-mini accepts only the `https://admin.anipotts.com` origin.

So in development the overview, `/data/*` and `/observability/*` render
synthetic sample data by default: `src/fixtures/data_v1.synthetic.json`,
System's `ops_v1.sample.json` and `ops_events_v1.synthetic.json`. Each such
page carries one `Sample data` badge. Add `?fixture=none` to see the real local
states instead (the reader is not connected, and ops reads are off). The
fixtures load only when `import.meta.env.DEV` is true, so no build ships them.

To preview real System state, copy payloads captured from System into
`apps/admin/.local/replay/`:

- `ops_v1.json`, a snapshot, and `ops_events_v1.json`, an events page, stand
  in for the ops samples;
- `data_sources_v1.json`, a whole `/v1/data/sources` reply, replaces the
  synthetic source catalog on Sources (and the names Records gives each
  source), while records stay synthetic.

When a file exists the dev server serves it in place of its sample, read again
on every load, and `?fixture=synthetic` switches back. `.local/` is ignored: a
replay is live machine metadata and the source catalog names real sources, so
none of it is ever committed.

Content is not affected: it reads the local editorial inventory as before.

## private Data session

The private session opens on its own when a Data view mounts, using the live
Access session for each credential issuance. It is held in module memory for
the document, so moving between the overview and Data (and opening a record
from the overview) never opens it twice. It closes on End session, logout,
expiry, denial, page hide or a document reload, and after 15 minutes without
interaction or 15 minutes with the tab hidden; the next interaction opens it
again. Nothing is written to storage.

## performance baseline

Admin responses carry a `Server-Timing` header with durations and counts only,
under fixed generic names: `app`, `inventory`, `record`, `newsletter`,
`operations`, `life`, `d1` and `d1q`. Worker clocks advance across I/O, so a
loader's pure CPU time can read as 0; compare `app` with the browser's
`responseStart`.

With `pnpm preview:admin:owner` running, measure initial loads and
in-workspace switches at 390, 768 and 1280 widths in light and dark:

```bash
node scripts/admin/perf-measure.mjs .local/perf/baseline.json
node scripts/admin/perf-measure.mjs .local/perf/smoke.json --runs 2 --cells load:content,switch:content-nav
```

The harness starts nothing, accepts only a loopback `--base`, and writes JSON
plus a markdown summary of medians and p90s. It reports route shapes such as
`/content/:collection/:id` and never collects page text or record identities.
`--list` prints the cells. Local wrangler dev answers asset revalidation with
full responses and has no editorial secrets, so every document switch refetches
its scripts and record editors show `editor_not_configured`.

## worktrees and HMR

Each linked worktree records its own ports, process metadata and logs under
ignored `.local/dev-servers/`. Astro HMR connects straight to the dev server,
so it works without any extra configuration.

### Codex task startup

`bash ./scripts/codex-action setup` validates the repository manifests and Node/pnpm availability without installing packages or enabling global Corepack shims. Missing dependencies are explicitly reported as deferred; this is a startup preflight, not a passing application check. It avoids duplicate automatic installs when creating worktrees on a space-constrained host.

When dependencies are needed and disk space is available, run `bash ./scripts/codex-action bootstrap` to install the frozen lockfile. Develop and check actions require local dependencies and otherwise stop with that actionable command. Existing dependencies still pass through the normal build/type/test checks; their presence is not a claim of validity.
