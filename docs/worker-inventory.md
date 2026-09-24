# worker inventory

Last reviewed: 2026-09-23

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

| Worker                 | Cloudflare name              | Trigger or route                                                   | Data boundary                                                                                                                                                                                                                                                                                                            | Current classification             | Next cleanup action                                                                                                 |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `workers/ingest`       | `anipotts-ingest`            | workers.dev fetch only, `crons = []`                               | accepts only `brands_email` rows, from the scoped brands key or the mini key; GET judges the newest arrival against a 14 day budget: `quiet` after 7 days is still ok, `silent` past 14 reads `state: degraded` and `ok: false`, and `failing` is kept for D1 or the newest timestamp unreadable or the brands key unset | keep, brands_email receiver only   | Ani decides whether the Apps Script capture is retired; if it is, retire this worker and both keys                  |
| `workers/newsletter`   | `anipotts-newsletter-worker` | queue consumer for `newsletter-send`, workers.dev GET status       | sends confirmation and issue email through Resend when configured; records newsletter events in D1; GET reports subscriber counts, the last send and send error, `dormant` while nobody is confirmed and nothing was sent                                                                                                | keep, outbound-send gated          | keep while newsletter subscription and issue delivery remain worker-backed                                          |
| `workers/state`        | `anipotts-state`             | `api.anipotts.com` custom domain, REST, WebSocket, Durable Objects | read routes are public metadata; write routes require `STATE_PUBLISH_KEY`; a links vault, a commits plane with no producer, and a device relay that no key is bound for, so every connect is refused                                                                                                                     | keep; no admin page reads it       | Ani decides whether to retire the commits plane and the relay; do not expand write routes without route-level proof |
| `workers/weekly-email` | `anipotts-weekly-email`      | workers.dev GET status only, `crons = []`                          | sends nothing and reads no secret; GET reports `retired: true`, `ok: false` and the queue counts by status; every other method answers 405                                                                                                                                                                               | retired in place: no cron, no send | Ani decides when to remove its unread secrets, turn off its workers.dev URL and delete the worker                   |

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

This section records the read-only account inventory for ledger rows A-36
(the Cloudflare account and the `anipotts.com` hosts) and A-37 (the content
stores). The ids A-36.n and A-37.n are this inventory's sub-findings; the
ledger itself doesn't carry them as rows yet. Nothing here was changed.

How it was read, on 2026-09-22 and refreshed on 2026-09-23:

- account listings: 25 workers, 12 Pages projects, 11 D1 databases, 7 KV
  namespaces, 3 R2 buckets and 4 queues (`wrangler d1 list`, `queues list`,
  `pages project list`, `deployments list` and `versions view`, plus the
  Cloudflare API's worker, KV and R2 lists). Bindings are recorded by name and
  type only;
- unauthenticated `GET` of every public host named below and of each worker's
  workers.dev URL, where 1042 means workers.dev is off;
- count-only D1 reads and `r2 bucket info` on 2026-09-22, for the counts
  quoted here;
- the retired Solid admin's last source, from Git (`26a6b98cf^`).

Two reads still wait on Ani, because no read-only tool this pass may use
reaches them: the `anipotts.com` zone's DNS record export and the Cloudflare
Access application list (A-36.19). So the host list is assembled from
certificate logs, repo references and probes, and the Access findings are
inferred from redirects: only `admin.anipotts.com` redirects to
`anipotts.cloudflareaccess.com`. Vercel was read for the `anipottsbuilds`
team only.

Statuses, with "needs Ani" in Next action wherever retiring or fixing the item
is an endpoint, DNS, account, secret or deletion change:

| Status   | Meaning                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| live     | deployed and serving, or running, for a current owner                                           |
| ghost    | deployed and still answering or running, but retired, parked, duplicated or with no known owner |
| dangling | a DNS name or domain claim with nothing real behind it                                          |
| orphan   | storage that no deployed worker binds and no known job uses                                     |

### security findings

Both legacy admin hosts answer without Cloudflare Access in front.

`legacy-admin.anipotts.com` (A-36.6, live, needs Ani) is a custom domain on
the live `anipotts-admin` worker. `apps/admin/wrangler.toml` doesn't declare
it; its `[[routes]]` list only `admin.anipotts.com`. The host serves the
production admin release (b48d049 on 2026-09-23) without Access: where
`admin.anipotts.com/api/health` answers 302 to the Access login, this host
answers the app directly. The app middleware still enforces the signed Access
owner JWT, so `/content` answers 401 `owner_required` and the other private
pages redirect to `/auth`. `/api/health` (release SHA and schema version) and
`/auth` answer publicly. Next action for Ani: detach the domain, or add it to
the owner Access app, then add the host to the release boundary smoke.

`legacy-admin-solid.anipotts.com` (A-36.7, closed): the custom domain was removed
on 2026-09-23 and the worker was deleted on 2026-09-24. The rest of this
paragraph records why. It served the retired Solid admin publicly. Its worker, `anipotts-admin-solid`, was last
deployed on 2026-06-27 and still binds the production `anipotts-db`, where its
passkey tables live. `/` redirects to `/auth/passkey`, which answers 200. Its
last source (`apps/admin-solid/src/lib/passkey-auth.ts`, unchanged since that
deploy day) allows the first passkey registration when no active credential
exists and the request carries a `cf-access-authenticated-user-email` header.
It reads that header as sent and verifies no Access JWT, so off Access any
client can set it. Today that path is closed only because `anipotts-db` holds
2 passkey credentials (a count-only read on 2026-09-22), and the gate stays
shut while at least one of them is unrevoked. Recommendation: remove it. Ani
detaches the domain and disables the worker and its version previews; the
passkey rows in D1 stay untouched, and deleting the worker is a later call.

### workers

| Worker                       | Owner                                       | Last deploy | Reach on 2026-09-23                                                                                                                                     | Bindings (names only)                                                                                               | Status                   | Next action                                                                                                                |
| ---------------------------- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `anipotts-admin`             | this repo, `apps/admin`                     | 2026-09-22  | `admin.anipotts.com` behind Access; `legacy-admin.anipotts.com` without it; workers.dev off                                                             | D1 `DB` and `CONTENT_DB`, R2 `CONTENT_MEDIA`, Durable Object `EDITORIAL`, one signing secret                        | live                     | needs Ani: the legacy-admin domain (A-36.6); `/api/health` reports schema 0043 while prod has applied 0044 (A-36.17, #441) |
| `anipotts-www-astro`         | this repo, `apps/www`                       | 2026-09-22  | `anipotts.com`; `www` 308s to the apex; `staging.anipotts.com`; `news.anipotts.com` (newsletter links, 404 at `/`); workers.dev on; version previews on | D1 `DB` and `CONTENT_DB`, R2 `CONTENT_MEDIA`, queue producer `NEWSLETTER_QUEUE`, two unread secrets                 | live                     | needs Ani: `staging` is the production worker on production data (A-36.9); the unread secrets (A-36.16)                    |
| `anipotts-newsletter-worker` | this repo, `workers/newsletter`             | 2026-09-14  | workers.dev on, still the constant `newsletter worker ok` until this PR deploys                                                                         | D1 `DB`, consumer of `newsletter-send`, two send secrets                                                            | live                     | see retained workers                                                                                                       |
| `anipotts-state`             | this repo, `workers/state`                  | 2026-09-14  | `api.anipotts.com`; workers.dev on                                                                                                                      | Durable Objects `LINK_VAULT`, `CODE_STATS` and `COMMAND_RELAY`, one publish secret                                  | live                     | see retained workers                                                                                                       |
| `anipotts-ingest`            | this repo, `workers/ingest`                 | 2026-09-16  | workers.dev on; its every-minute cron runs until this PR deploys                                                                                        | D1 `DB`, four secrets, two of them unread                                                                           | live                     | see retained workers                                                                                                       |
| `anipotts-weekly-email`      | this repo, `workers/weekly-email`           | 2026-09-14  | workers.dev on; its Sunday 13:00 cron runs until this PR deploys                                                                                        | D1 `DB`, five secrets that no code reads once this PR lands, the Mercury token among them                           | live, retired by this PR | needs Ani: remove the unread secrets, the Mercury token first (A-36.16)                                                    |
| `anipotts-admin-solid`       | this repo's retired Solid app               | 2026-06-27  | `legacy-admin-solid.anipotts.com` without Access; workers.dev off; version previews on                                                                  | D1 `DB` (`anipotts-db`), `ASSETS`, `PUBLIC_STATE_API`                                                               | deleted 2026-09-24       | none: domain removed 2026-09-23, worker deleted 2026-09-24 (A-36.7)                                                        |
| `anipotts-www`               | this repo's old Next.js app                 | 2026-05-14  | workers.dev on, 200                                                                                                                                     | D1 `DB` (`anipotts-db`), `ASSETS`, four secrets                                                                     | ghost                    | needs Ani: turn off workers.dev, then delete it and rotate its secrets (A-20)                                              |
| `anipotts-labs`              | this repo's archived `apps/labs`            | 2026-06-19  | workers.dev on, 404 "Page not found"; no custom domain                                                                                                  | `ASSETS`                                                                                                            | ghost                    | needs Ani: turn off workers.dev, then decide on deletion (A-36.10)                                                         |
| `labs`                       | anipotts/labs                               | 2026-09-16  | `labs.anipotts.com`; workers.dev on                                                                                                                     | none                                                                                                                | live                     | its owner                                                                                                                  |
| `quantercise`                | quantercise                                 | 2026-09-22  | `quantercise.com`; workers.dev off; cron `0 2 * * *` in its config                                                                                      | D1 `quantercise-prod`, a rate-limit Durable Object, auth and payment secrets                                        | live                     | its owner                                                                                                                  |
| `quantercise-api-beta`       | quantercise                                 | 2026-09-22  | workers.dev off; cron `17 * * * *` in its config                                                                                                        | D1 `quantercise-beta`, auth and mail secrets                                                                        | live                     | its owner                                                                                                                  |
| `claude-transcripts`         | claude-transcripts-worker                   | 2026-05-16  | workers.dev on, 200                                                                                                                                     | D1 `claude-transcripts`, R2 `ani-claude-transcripts`, queue `transcripts-to-index`, Vectorize, AI, a Durable Object | live                     | its owner                                                                                                                  |
| `yapsync`                    | yapsync                                     | 2026-05-21  | `yapsync.com` in its config, answers 200; workers.dev off                                                                                               | D1 `yapsync`, `ASSETS`, one secret                                                                                  | live                     | its owner                                                                                                                  |
| `howoldamiactually-com`      | no Projects registry entry                  | 2026-06-19  | `howoldamiactually.com` answers 200 through Cloudflare; workers.dev on                                                                                  | `ASSETS`                                                                                                            | live, unregistered       | Ani: register or retire it (A-36.14)                                                                                       |
| `phone-agent`                | no Projects registry entry                  | 2026-06-24  | workers.dev on, 401                                                                                                                                     | D1 `phone-agent`, KV `PHONE_AGENT_KV`, voice-provider secrets                                                       | live, unregistered       | Ani: register or retire it (A-36.14)                                                                                       |
| `saeshify`                   | saeshify                                    | 2026-06-21  | workers.dev on, 200; `saeshify.com` itself is on Vercel                                                                                                 | `ASSETS`                                                                                                            | ghost                    | needs Ani: delete the duplicate (A-36.14)                                                                                  |
| `chained-chat`               | chained-chat                                | 2026-05-14  | workers.dev off and its routes commented out, so nothing reaches it                                                                                     | none                                                                                                                | ghost                    | needs Ani: delete it (A-36.14)                                                                                             |
| `claudemon-awareness-api`    | claudemon (parked)                          | 2026-05-18  | workers.dev on, 200; its `*/15` cron still fires; on 2026-09-22 two of its feeds had failed 12,444 and 12,445 times in a row                            | D1 `claudemon-awareness`, KV `AWARENESS_CACHE`, a Durable Object, two secrets                                       | ghost                    | needs Ani: claudemon cron changes are gated (A-36.12)                                                                      |
| `claudemon-awareness-mcp`    | claudemon (parked)                          | 2026-05-18  | workers.dev on, 200                                                                                                                                     | D1 `claudemon-awareness`, a Durable Object                                                                          | ghost                    | claudemon's owner                                                                                                          |
| `claudemon`                  | claudemon (parked)                          | 2026-04-05  | workers.dev on, 200                                                                                                                                     | none                                                                                                                | ghost                    | claudemon's owner                                                                                                          |
| `claudemon-api`              | claudemon (parked)                          | 2026-04-07  | workers.dev off                                                                                                                                         | KV `API_KEYS`, a Durable Object, OAuth and JWT secrets                                                              | ghost                    | claudemon's owner                                                                                                          |
| `claudemon-api-staging`      | claudemon (parked)                          | 2026-04-24  | workers.dev off                                                                                                                                         | KV `API_KEYS_STAGING`, a Durable Object                                                                             | ghost                    | claudemon's owner                                                                                                          |
| `openproof-api`              | no checkout under Projects, Code or Archive | 2026-04-05  | workers.dev on, 404 at `/`                                                                                                                              | D1 `openproof`, AI, `ANTHROPIC_API_KEY`                                                                             | ghost                    | needs Ani: confirm it's retired, then remove the Anthropic key and the worker (A-36.13)                                    |
| `openproof-monitor`          | no checkout under Projects, Code or Archive | 2026-04-05  | workers.dev on, 404 at `/`                                                                                                                              | a Durable Object                                                                                                    | ghost                    | needs Ani, with `openproof-api` (A-36.13)                                                                                  |

The schedules for workers outside this repo come from their own configs;
wrangler has no read command for a live schedule. Nothing in System's ops
catalog watches any worker.

### Pages projects

| Project                                | Domains                                                                   | Reach on 2026-09-23 | Status | Next action                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `anipotts-www`                         | `anipotts-www.pages.dev`                                                  | 522                 | ghost  | needs Ani: delete it with the `anipotts-www` worker (A-36.11)                                                            |
| `openproof`                            | `openproof.pages.dev`                                                     | 200                 | ghost  | needs Ani, with the openproof workers; it is Git-connected and was modified about a week ago, so confirm first (A-36.13) |
| `openproof-monitor`                    | `openproof-monitor.pages.dev`                                             | 200                 | ghost  | needs Ani, with the openproof workers (A-36.13)                                                                          |
| `kalshit`                              | `kalshit.pages.dev`                                                       | 200                 | ghost  | needs Ani: no Projects registry entry and no local checkout                                                              |
| `claudemon`                            | `claudemon.pages.dev`, `app.claudemon.com`, `staging.claudemon.com`       | 200                 | ghost  | claudemon's owner                                                                                                        |
| `claudemon-awareness`                  | `claudemon-awareness.pages.dev`                                           | 200                 | ghost  | claudemon's owner                                                                                                        |
| `nikkyla`                              | `nikkyla.com`, `www` and `preview`                                        | 200                 | live   | its owner                                                                                                                |
| `pottammal-home` and four family sites | `pottammal.com` and its `arnav`, `aryan`, `anna` and `antonio` subdomains | 200                 | live   | its owner                                                                                                                |

### D1, KV, R2 and queues

| Store                    | Kind  | Bound by                                                                                                                                           | Status             | Note                                                                                                                                                                        |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anipotts-db`            | D1    | `anipotts-admin`, `anipotts-www-astro`, `anipotts-ingest`, `anipotts-newsletter-worker` and `anipotts-weekly-email`; also the ghost `anipotts-www` | live               | four tables with no reader or writer once this PR lands (see below); only Cloudflare's own point-in-time recovery covers it, since System exports another database (A-37.4) |
| `anipotts-content`       | D1    | `anipotts-admin` and `anipotts-www-astro`, both as `CONTENT_DB`                                                                                    | live               | clean (A-37.1); exported nightly by System                                                                                                                                  |
| `claude-transcripts`     | D1    | `claude-transcripts`                                                                                                                               | live               |                                                                                                                                                                             |
| `claudemon-awareness`    | D1    | `claudemon-awareness-api` and `claudemon-awareness-mcp`                                                                                            | ghost              | 1,258 items, 0 users and 0 waitlist rows (A-36.12)                                                                                                                          |
| `openproof`              | D1    | `openproof-api`                                                                                                                                    | ghost              | (A-36.13)                                                                                                                                                                   |
| `phone-agent`            | D1    | `phone-agent`                                                                                                                                      | live, unregistered |                                                                                                                                                                             |
| `phone-agent-preview`    | D1    | nothing                                                                                                                                            | orphan             | 12 KB; likely a wrangler dev leftover; needs Ani to delete (A-36.15)                                                                                                        |
| `quantercise-beta`       | D1    | `quantercise-api-beta`                                                                                                                             | live               |                                                                                                                                                                             |
| `quantercise-preview`    | D1    | nothing                                                                                                                                            | orphan             | 5.9 MB; needs Ani to delete or keep (A-36.15)                                                                                                                               |
| `quantercise-prod`       | D1    | `quantercise`                                                                                                                                      | live               |                                                                                                                                                                             |
| `yapsync`                | D1    | `yapsync`                                                                                                                                          | live               |                                                                                                                                                                             |
| `API_KEYS`               | KV    | `claudemon-api`                                                                                                                                    | ghost              | parked claudemon                                                                                                                                                            |
| `API_KEYS_STAGING`       | KV    | `claudemon-api-staging`                                                                                                                            | ghost              | parked claudemon                                                                                                                                                            |
| `API_KEYS_preview`       | KV    | nothing                                                                                                                                            | orphan             | contents not read, since the name suggests key material; needs Ani (A-36.15)                                                                                                |
| `AWARENESS_CACHE`        | KV    | `claudemon-awareness-api`                                                                                                                          | ghost              | parked claudemon                                                                                                                                                            |
| `coolfollowers-cache`    | KV    | nothing                                                                                                                                            | orphan             | 0 keys; nothing in `cool-followers` references it; needs Ani to delete (A-36.15)                                                                                            |
| `PHONE_AGENT_KV`         | KV    | `phone-agent`                                                                                                                                      | live, unregistered |                                                                                                                                                                             |
| `PHONE_AGENT_KV_preview` | KV    | nothing                                                                                                                                            | orphan             | 0 keys; needs Ani to delete (A-36.15)                                                                                                                                       |
| `ani-claude-transcripts` | R2    | `claude-transcripts`                                                                                                                               | live               | 8,677 objects, 4.53 GB                                                                                                                                                      |
| `anipotts-content-media` | R2    | `anipotts-admin` and `anipotts-www-astro`, both as `CONTENT_MEDIA`                                                                                 | live               | empty: 0 objects (A-37.5)                                                                                                                                                   |
| `memory-offsite`         | R2    | no worker; System's offsite backup writes it                                                                                                       | live               | 35,940 objects, 183 GB                                                                                                                                                      |
| `newsletter-send`        | queue | producer `anipotts-www-astro`, consumer `anipotts-newsletter-worker`                                                                               | live               | dead-letter queue `newsletter-send-dlq`                                                                                                                                     |
| `newsletter-send-dlq`    | queue | none, by design                                                                                                                                    | live               | its depth wasn't read                                                                                                                                                       |
| `transcripts-to-index`   | queue | producer and consumer `claude-transcripts`                                                                                                         | live               | dead-letter queue `transcripts-index-dlq`                                                                                                                                   |
| `transcripts-index-dlq`  | queue | none, by design                                                                                                                                    | live               | its depth wasn't read                                                                                                                                                       |

Every R2 bucket has its `r2.dev` URL off and no custom domain. Every queue's
producers and consumers are live workers.

Tables in `anipotts-db` that nothing reads or writes once this PR lands:
`ops_snapshots`, `analytics_events` and `code_health` (only
`packages/lib/src/db/schema.ts` names them), and `page_content`, the target of
migration 0044, which no code reads. They stay in place, quarantined; each
drop waits for Ani (ledger A-21).

### anipotts.com hosts

| Host                                                                             | What answers on 2026-09-23                                                                               | Status                   | Next action                                                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `anipotts.com`                                                                   | `anipotts-www-astro`                                                                                     | live                     |                                                                                                                             |
| `www.anipotts.com`                                                               | 308 to the apex                                                                                          | live                     | needs Ani: the old Vercel project still claims the apex and `www` (A-36.5)                                                  |
| `admin.anipotts.com`                                                             | `anipotts-admin` behind Access                                                                           | live                     |                                                                                                                             |
| `legacy-admin.anipotts.com`                                                      | `anipotts-admin` without Access                                                                          | live, security finding   | needs Ani (A-36.6)                                                                                                          |
| `legacy-admin-solid.anipotts.com`                                                | `anipotts-admin-solid`, the retired Solid admin, without Access                                          | removed 2026-09-23       | none (A-36.7 closed)                                                                                                        |
| `staging.anipotts.com`                                                           | the production `anipotts-www-astro`, same release and data as the apex                                   | live, misnamed           | needs Ani: detach it or give it an isolated worker (A-36.9)                                                                 |
| `news.anipotts.com`                                                              | `anipotts-www-astro`, for newsletter confirm and webhook links; 404 at `/` by design                     | live                     |                                                                                                                             |
| `api.anipotts.com`                                                               | `anipotts-state`                                                                                         | live                     |                                                                                                                             |
| `labs.anipotts.com`                                                              | the `labs` worker                                                                                        | live                     |                                                                                                                             |
| `send.anipotts.com` and `resend._domainkey`                                      | Resend's return path and signing key                                                                     | live                     |                                                                                                                             |
| `api.mini.anipotts.com`                                                          | 530, error 1033: a tunnel record with no connector                                                       | dangling                 | needs Ani: delete the record and the tunnel once this PR deploys, since nothing else calls it (A-36.8)                      |
| `*.anipotts.com` wildcard, which answers `health`, `mini` and any unused name    | 525: a proxied catch-all to Vercel with no certificate behind it; `health` never had a record of its own | dangling                 | needs Ani: delete the wildcard (A-36.2)                                                                                     |
| `lab`, `thoughts`, `cli`, `dev`, `docs`, `links`, `metrics`, `status`, `updates` | Vercel 404 `DEPLOYMENT_NOT_FOUND` through the wildcard; no Vercel project claims them                    | dangling, takeover shape | needs Ani: the wildcard deletion closes all nine (A-36.3). The repo's `.claude/commands` still point at `thoughts` (A-36.4) |
| MX                                                                               | Google at priority 1 and iCloud at 10                                                                    | live, split              | needs Ani: keep one provider's MX and SPF include (A-36.18)                                                                 |

### content stores (A-37)

| Store                                      | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status          | Next action                                                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 `anipotts-content` (A-37.1)             | No test or fixture record: 19 active records (4 pages, 10 work, 5 writing), 21 immutable revisions, inventory version 3. Every active row points to its matching revision. 19 of the 21 revisions are `git-seed.*` publications stamped with the single instant 2026-09-21T17:09:31.683Z, with no parent.                                                                                                                                                                  | live, clean     | treat `git-seed.*` as the Git baseline, never as a CMS publish time (A-8)                                                                                                          |
| one unidentified revision (A-37.2)         | `writing/search-will-be-dead-by-2030` has two publications numbered revision 2. The first, on 2026-09-21 at 21:02:36Z, published a body whose frontmatter says `status: draft`; the active one followed at 21:03:36Z. The 21:02 publication is the one revision of the 21 with no known purpose; it looks like a publish-flow test.                                                                                                                                        | live            | needs Ani: he confirms whether it was a test. Revisions are immutable, so it stays; an admin-lane fix makes the publisher reject a revision that isn't greater than the active one |
| `EDITORIAL` Durable Object drafts (A-37.3) | Not auditable read-only: the admin is Access-gated and wrangler has no Durable Object read. The 2026-09-22 prod render counted 7 writing entries with 2 drafts, while Git holds 6 writing files with 1 draft, so at least one writing draft exists only in the Durable Object, from an unknown source.                                                                                                                                                                     | live, unaudited | needs Ani: he opens Content > Writing and names it; a test draft is quarantined through the admin, never deleted without him                                                       |
| backups (A-37.4)                           | System's nightly `content.d1-export` on ap-mini exports only `anipotts-content`. `anipotts-db`, the `EDITORIAL` drafts and R2 `anipotts-content-media` have no export; only Cloudflare's own point-in-time recovery covers `anipotts-db` and the Durable Object, and R2 has none. The export also ends `state=healthy` when its Lexar mirror copy fails (`lexar_mirror=no`); its comment says the internal-disk copy rides the offsite path, which this pass didn't trace. | live, uncovered | needs Ani: he decides which stores need exports; System makes a missing mirror degrade the job and adds any export he approves                                                     |
| R2 `anipotts-content-media` (A-37.5)       | Empty: 0 objects and 0 bytes, `r2.dev` off, no custom domain. The publish path is its only writer and has never stored media in prod.                                                                                                                                                                                                                                                                                                                                      | live, clean     | none; any admin count should read "No media published" for this state                                                                                                              |

Secrets on live workers that no code reads are listed under retained workers
above (A-36.16).

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
`workers/ingest` keeps only the `brands_email` receiver. The worker sees only
the rows that reach it and can't tell a quiet inbox from a stopped capture, so
its GET judges the newest arrival against a 14 day budget, twice the longest
gap in the capture's own history (7 days, 2026-06-16 to 06-23, while rows
landed every 1 to 3 days). A week without brand mail is `quiet` and still ok.
Past the budget it is `silent`: `state: degraded` and `ok: false`, with a note
naming the newest arrival's day. `failing` is kept for a fault the worker can
see: D1 unreadable, an unparseable newest timestamp, or an unset
`BRANDS_INGEST_KEY`. On today's data (newest row 2026-06-24) it reads
degraded. `workers/newsletter` keeps its queue consumer unchanged, and its GET
status replaces the constant `newsletter worker ok` with counts, the last send
and send error, the send secrets' presence and `dormant`. It can't see the
`newsletter-send` queue or its dead-letter depth, and says so. Deleting the
weekly-email or ingest worker, removing their unread secrets or turning off a
workers.dev URL waits for Ani. `workers/state` is unchanged here.
