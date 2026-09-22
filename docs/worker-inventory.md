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

| Worker                 | Cloudflare name              | Trigger or route                                                   | Data boundary                                                                                                                              | Current classification             | Next cleanup action                                                                                |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `workers/ingest`       | `anipotts-ingest`            | workers.dev fetch only, `crons = []`                               | accepts only `brands_email` rows, from the scoped brands key or the mini key; GET judges the newest capture against a 7 day budget         | keep, brands_email receiver only   | Ani decides whether the Apps Script capture is retired; if it is, retire this worker and both keys |
| `workers/newsletter`   | `anipotts-newsletter-worker` | queue consumer for `newsletter-send`, workers.dev fetch health     | sends confirmation and issue email through Resend when configured; records newsletter events in D1                                         | keep, outbound-send gated          | keep while newsletter subscription and issue delivery remain worker-backed                         |
| `workers/state`        | `anipotts-state`             | `api.anipotts.com` custom domain, REST, WebSocket, Durable Objects | read routes are public metadata; write routes require `STATE_PUBLISH_KEY`; Durable Objects hold link and code state                        | keep                               | keep as state plane for admin/fleet work; do not expand write routes without route-level proof     |
| `workers/weekly-email` | `anipotts-weekly-email`      | workers.dev GET status only, `crons = []`                          | sends nothing and reads no secret; GET reports `retired: true`, `ok: false` and the queue counts by status; every other method answers 405 | retired in place: no cron, no send | Ani decides when to remove its unread secrets, turn off its workers.dev URL and delete the worker  |

Secrets that no code reads any more may still be set in Cloudflare:
`GITHUB_TOKEN` and `CF_API_TOKEN` on `anipotts-ingest`, and the Resend,
Mercury and mini secrets on `anipotts-weekly-email`. Removing them is an
account change for Ani.

## outside this repo

The old Next.js `anipotts-www` worker is still deployed; its last deploy was
2026-05-14. `apps/www` now deploys as `anipotts-www-astro`. Deleting the old
worker waits for Ani.

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
`workers/ingest` keeps only the `brands_email` receiver, and its GET status
reports `ok: false` whenever the capture is older than its budget. Deleting
either worker, removing their unread secrets or turning off a workers.dev URL
waits for Ani. `workers/newsletter` and `workers/state` are unchanged.
