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
managed fallback. Production middleware, protected APIs, write routes, password
auth, passkeys, and Cloudflare Access are unchanged.

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
  need their CSRF token, and `/api/admin/*` mutations still need a native
  session with fresh passkey step-up.
- A fixed `Local owner` token marks every Content, Operations and Life screen
  at every width and theme.
- Release builds compile the path out. Deploy jobs fail when the flag is set,
  and the Admin deploy scans its exact bundle with
  `node scripts/ci/admin-local-owner-leak.mjs --expect absent apps/admin/dist`
  before it runs wrangler.

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
