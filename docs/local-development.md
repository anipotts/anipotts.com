# local development

The repo uses the pinned Portless `0.15.5` package for named local URLs. The
default setup is deliberately rootless and loopback-only:

- public site: `http://anipotts.localhost:1355/`
- Admin: `http://admin.anipotts.localhost:1355/`
- Admin fallback when Admin review is active: `http://localhost:4311/`

All local actions, CI, and deploy jobs use Node `24.19.0`, pinned in `.nvmrc`.
The launcher selects that runtime through NVM when available and exits early
with one install command when the current runtime is unsupported.

Start only the surface being reviewed:

```bash
pnpm dev:www
pnpm dev:admin
pnpm dev:all
```

`dev:www` starts only the public Astro process. `dev:admin` starts the named
Admin process and the managed `localhost:4311` fallback. `dev:all` starts both.

The canonical names are reserved for the clean physical checkout on `main`
when its commit equals `origin/main`. The manager refuses to claim them from a
feature branch in that checkout. Start feature work from a linked worktree so
Portless can expose its branch-prefixed URLs without replacing the main review
surface.

Inspect ownership and health without changing anything:

```bash
pnpm dev:status
pnpm admin:preview:status
```

Stop only the two Portless app processes owned by the current worktree:

```bash
pnpm dev:stop
```

The stop command leaves the shared rootless proxy and the managed Admin
fallback alone. Use `pnpm admin:preview:stop` only when Ani explicitly ends the
Admin feedback loop.

## safety model

The repo manager always sets the following values itself:

- HTTP on port `1355`
- TLS off
- LAN mode off
- host-file synchronization off
- one shared ignored state directory resolved through Git's common directory

It does not install a service, request `sudo`, trust a CA, edit `/etc/hosts`, or
bind ports `80` and `443`. Clean no-port HTTPS URLs are a separate machine-level
promotion that needs exact approval.

Admin's named preview allowance accepts only `GET` and `HEAD` for `/`, `/inbox`,
and `/work`. It requires Astro development mode and either the legacy loopback
origin or the exact `admin.anipotts.localhost` hostname shape on the approved
Portless port. Production middleware, protected APIs, write routes, password
auth, passkeys, and Cloudflare Access are unchanged.

## worktrees and HMR

Portless provides each linked worktree its own route and random application
port while sharing one proxy. A branch such as `codex/feature-auth` receives
URLs shaped like:

- `http://feature-auth.anipotts.localhost:1355/`
- `http://feature-auth.admin.anipotts.localhost:1355/`

Each worktree stores only its own process metadata and logs under ignored
`.local/portless-preview/`. Portless forwards WebSockets, so Astro HMR works
through the named URLs.

### Codex task startup

`bash ./scripts/codex-action setup` validates the repository manifests and Node/pnpm availability without installing packages or enabling global Corepack shims. Missing dependencies are explicitly reported as deferred; this is a startup preflight, not a passing application check. It avoids duplicate automatic installs when creating worktrees on a space-constrained host.

When dependencies are needed and disk space is available, run `bash ./scripts/codex-action bootstrap` to install the frozen lockfile. Develop and check actions require local dependencies and otherwise stop with that actionable command. Existing dependencies still pass through the normal build/type/test checks; their presence is not a claim of validity.
