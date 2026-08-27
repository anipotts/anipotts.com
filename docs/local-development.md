# local development

Local development uses Astro directly on fixed loopback ports:

- public site: `http://localhost:4321/`
- Admin: `http://localhost:4322/`
- managed Admin review fallback: `http://localhost:4311/`

All local actions, CI, and deploy jobs use Node `24.19.0`, pinned in `.nvmrc`.

Start only the surface being reviewed:

```bash
pnpm dev:www
pnpm dev:admin
pnpm dev:all
```

`dev:www` starts only the public Astro process. `dev:admin` starts only Admin.
`dev:all` starts both in the foreground. Astro HMR works directly on both
loopback URLs. Stop a foreground server with `Ctrl+C`.

Use one active review checkout for each fixed port. If another worktree needs a
simultaneous public preview, choose an explicit temporary port in that terminal:

```bash
pnpm --filter @anipotts/www exec astro dev --host 127.0.0.1 --port 4323
```

The managed Admin fallback remains separate. Start or inspect it only when an
Admin feedback loop needs a durable `localhost:4311` process:

```bash
pnpm admin:preview:ensure
pnpm admin:preview:status
```

Use `pnpm admin:preview:stop` only when Ani explicitly ends that feedback loop.

## safety model

The direct dev servers bind only to `127.0.0.1`. They do not install a proxy or
service, request `sudo`, trust a certificate authority, edit `/etc/hosts`, bind
ports `80` or `443`, or expose the site to the local network.

Admin's development preview allowance accepts only `GET` and `HEAD` from the
exact loopback origins on ports `4311` and `4322`. Production middleware,
protected APIs, write routes, password auth, passkeys, and Cloudflare Access are
unchanged.
