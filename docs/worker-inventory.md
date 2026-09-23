# worker inventory

Last reviewed: 2026-09-22

This inventory supports the platform cleanup goal: retain only production
workers that have an explicit role, route or trigger, deploy target, and risk
gate. It records evidence without secrets.

Read-only checks used for this pass:

- `pnpm exec wrangler --version`: 4.125.0
- `pnpm exec wrangler deployments list --name <worker>`: `anipotts-ingest`
  last deployed 2026-09-16 and `anipotts-weekly-email` on 2026-09-14
- metadata-only D1 counts on `anipotts-db`:
  - weekly email queue: 17 failed and 4 pending, none sent. Every queued
    report failed with a Resend 401, from 2026-05-03 through 2026-09-20.
  - brands email capture: the newest row arrived on 2026-06-24.
  - ingest cron output: the four health probe rows still advanced every
    minute (www 200, admin 200 from the Access login page it followed, ingest
    404 from its own workers.dev URL, mini 530), and all four worker
    deployment rows read `error`. The GitHub and npm jobs never stored a row.
- wrangler 4.125.0 sends the schedules PUT only when `triggers.crons` is set.
  A retired schedule therefore stays as an explicit `crons = []`, which
  removes the trigger on the next deploy.

## retained workers

| Worker                 | Cloudflare name              | Trigger or route                                                   | Data boundary                                                                                                                                                                                                                                                          | Current classification             | Next cleanup action                                                                                                 |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `workers/ingest`       | `anipotts-ingest`            | workers.dev fetch only, `crons = []`                               | accepts only `brands_email` rows, from the scoped brands key or the mini key; GET reports the newest arrival, `quiet` after 7 days without one and `silent` after 30, and is `ok: false` only when D1 or the newest timestamp is unreadable or the brands key is unset | keep, brands_email receiver only   | Ani decides whether the Apps Script capture is retired; if it is, retire this worker and both keys                  |
| `workers/newsletter`   | `anipotts-newsletter-worker` | queue consumer for `newsletter-send`, workers.dev GET status       | sends confirmation and issue email through Resend when configured; records newsletter events in D1; GET reports subscriber counts, the last send and send error, `dormant` while nobody is confirmed and nothing was sent                                              | keep, outbound-send gated          | keep while newsletter subscription and issue delivery remain worker-backed                                          |
| `workers/state`        | `anipotts-state`             | `api.anipotts.com` custom domain, REST, WebSocket, Durable Objects | read routes are public metadata; write routes require `STATE_PUBLISH_KEY`; a links vault, a commits plane with no producer, and a device relay that no key is bound for, so every connect is refused                                                                   | keep; no admin page reads it       | Ani decides whether to retire the commits plane and the relay; do not expand write routes without route-level proof |
| `workers/weekly-email` | `anipotts-weekly-email`      | workers.dev GET status only, `crons = []`                          | sends nothing and reads no secret; GET reports `retired: true`, `ok: false` and the queue counts by status; every other method answers 405                                                                                                                             | retired in place: no cron, no send | Ani decides when to remove its unread secrets, turn off its workers.dev URL and delete the worker                   |

Secrets that no code reads any more may still be set in Cloudflare:
`GITHUB_TOKEN` and `CF_API_TOKEN` on `anipotts-ingest`; the Resend, Mercury
(the API token and both account ids) and mini secrets on
`anipotts-weekly-email`; and `BUTTONDOWN_API_KEY` and `RESEND_API_KEY` on
`anipotts-www-astro`, which no `apps/www` code reads (`RESEND_API_KEY` appears
only in `env.d.ts`). `anipotts-www-astro` binds no `RESEND_WEBHOOK_SECRET`, so
`/api/newsletter/webhooks/resend` answers 501. Removing and rotating the
unread secrets (the Mercury token first), and deciding whether the Resend
webhook route stays, are account changes for Ani.

## outside this repo

A read-only listing of the Cloudflare account's workers on 2026-09-22
(`wrangler deployments list` and `versions view`, binding names only, plus
unauthenticated `curl` of each public host) found these. Nothing here was
changed. Each next action waits for Ani, or for the owning repo.

| Worker or host                                                                                      | Last deploy        | What it serves today                                                                                                                                                                                                          | Bindings (names only)                                              | Owner                    | Next action                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anipotts-admin-solid` on `legacy-admin-solid.anipotts.com`                                         | 2026-06-27         | the retired Solid admin: `/` redirects to a public passkey sign-in and registration page, with no Access in front; handlers fetch, scheduled, email, queue and tail                                                           | `DB` (`anipotts-db`), `ASSETS`, `PUBLIC_STATE_API`                 | this repo's retired app  | Ani: remove the custom domain and disable or delete the worker, keeping `anipotts-db` data; until then, put the host behind Access (ledger A-36.7) |
| `anipotts-admin` on `legacy-admin.anipotts.com`                                                     | 2026-09-22         | the production admin worker on a dashboard custom domain that `apps/admin/wrangler.toml` does not declare and Access does not cover: `/` answers 401 `owner_required` from the middleware, and `/api/health` answers publicly | the production bindings                                            | this repo                | Ani: drop the domain or add it to the owner Access app, then add the host to the release boundary smoke (ledger A-36.6, A-36.17)                   |
| `anipotts-labs` on `labs.anipotts.com`                                                              | 2026-06-19         | a live Next.js site, though `apps/labs` is archived and not a deploy target; System's `registries/entities.yml` still lists the domain                                                                                        | `ASSETS`                                                           | this repo's archived app | Ani: retire the route and the worker; System drops the domain from its registry (ledger A-36)                                                      |
| `anipotts-www` on workers.dev                                                                       | 2026-05-14         | the old Next.js site                                                                                                                                                                                                          | `DB` (`anipotts-db`), `ASSETS`, four secrets                       | this repo's old app      | Ani: turn off workers.dev, then delete it and rotate its secrets (ledger A-20)                                                                     |
| Pages project `anipotts-www`                                                                        | not listed         | `anipotts-www.pages.dev` answers 522                                                                                                                                                                                          | not listed                                                         | this repo's old app      | Ani: delete the Pages project                                                                                                                      |
| `anipotts-www-astro` on `staging.anipotts.com`, `news.anipotts.com` and workers.dev                 | 2026-09-22         | production www against the production D1: a "staging" check there proves production                                                                                                                                           | the production bindings                                            | `apps/www`               | Ani: keep `staging` as a named production alias or remove it; set `workers_dev = false` once nothing calls it (ledger A-36)                        |
| `claudemon-awareness-api`                                                                           | 2026-05-18         | a scheduled handler (a 15 minute cron) for the parked claudemon project                                                                                                                                                       | `AWARENESS_DB`, `AWARENESS_CACHE`, `FEED_BROADCASTER`, two secrets | claudemon repo           | Ani: remove the cron while claudemon is parked                                                                                                     |
| `claudemon-api`, `claudemon-api-staging`, `claudemon-awareness-mcp`, `claudemon`                    | 2026-04 to 2026-05 | the parked claudemon project                                                                                                                                                                                                  | KV, D1 and Durable Object bindings                                 | claudemon repo           | its owner                                                                                                                                          |
| `openproof-api`, `openproof-monitor`                                                                | 2026-04-05         | an older project's API and monitor                                                                                                                                                                                            | `DB`, `AI`, `SESSION_ROOM`, an Anthropic key                       | openproof                | its owner                                                                                                                                          |
| `saeshify`, `chained-chat`, `phone-agent`, `howoldamiactually-com`, `yapsync`, `claude-transcripts` | 2026-05 to 2026-06 | other projects' workers                                                                                                                                                                                                       | their own                                                          | their repos              | their owners                                                                                                                                       |

Queues, KV namespaces, R2 buckets, DNS records and Access applications were
not listed, and the Vercel project that still holds anipotts.com subdomains
could not be read (403). Listing them is a metadata read that waits on Ani's
approval.

Public hosts under `anipotts.com` that answer with nothing behind them, from
the same pass (DNS changes wait for Ani; ledger A-36.2, A-36.3, A-36.8 and
A-36.18):

- `health.anipotts.com` and the `*.anipotts.com` wildcard answer 525; any
  unused name resolves and does the same.
- `lab`, `thoughts`, `cli`, `dev`, `docs`, `links`, `metrics`, `status` and
  `updates` answer Vercel `DEPLOYMENT_NOT_FOUND`: dangling records, the shape
  of a subdomain takeover.
- `api.mini.anipotts.com` answers 530 (error 1033), a dead tunnel that nothing
  in this repo reads.
- MX lists Google at priority 1 and iCloud at 10, so mail can split between
  two providers.

Tables in `anipotts-db` that nothing reads or writes once this PR lands:
`ops_snapshots`, `analytics_events` and `code_health` (only
`packages/lib/src/db/schema.ts` names them), and `page_content`, the target of
migration 0044, which no code reads. They stay in place, quarantined; each
drop waits for Ani (ledger A-21).

## deploy target mapping

| Worker                 | Deploy input        | Auto path                 | Local check                                           |
| ---------------------- | ------------------- | ------------------------- | ----------------------------------------------------- |
| `workers/ingest`       | `ingest=true`       | `workers/ingest/**`       | `pnpm --filter @anipotts/ingest typecheck`            |
| `workers/newsletter`   | `newsletter=true`   | `workers/newsletter/**`   | `pnpm --filter @anipotts/newsletter-worker typecheck` |
| `workers/state`        | `state=true`        | `workers/state/**`        | `pnpm --filter @anipotts/state typecheck`             |
| `workers/weekly-email` | `weekly_email=true` | `workers/weekly-email/**` | `pnpm --filter anipotts-weekly-email typecheck`       |

`scripts/ci/compute-deploy-targets.mjs` keeps worker deploys exact. Worker README
changes and docs-only changes do not deploy.

## deletion criteria

Do not delete a worker only because its code feels old. Delete or archive a
worker only after current evidence proves all of these are true:

- no production route, cron, queue consumer, or durable object binding still
  depends on it
- no public, admin, D1, newsletter, or external account workflow still calls it
- replacement app or worker has been deployed and smoke tested
- rollback is documented if the worker held production state or outbound send
  responsibility
- deploy workflow inputs, path filters, workspace inventory tests, docs, and
  Cloudflare routes are updated in the same cleanup lane

## current conclusion

No worker is deleted in this pass. `workers/weekly-email` is retired in place:
it has no schedule and no send path, and its GET status reports `ok: false`.
`workers/ingest` keeps only the `brands_email` receiver. Its GET status reports
a week without brand mail as `quiet` and a month as `silent`, each naming the
newest arrival's day, because the worker sees only the rows that reach it and
can't tell a quiet inbox from a stopped capture. It reports
`ok: false` only for a fault it can see: D1 unreadable, an unparseable newest
timestamp, or an unset `BRANDS_INGEST_KEY`. `workers/newsletter` keeps its
queue consumer unchanged, and its GET status replaces the constant
`newsletter worker ok` with counts, the last send and send error, the send
secrets' presence and `dormant`. It can't see the `newsletter-send` queue or
its dead-letter depth, and says so. Deleting the weekly-email or ingest worker,
removing their unread secrets or turning off a workers.dev URL waits for Ani.
`workers/state` is unchanged here.
