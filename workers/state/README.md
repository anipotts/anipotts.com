# @anipotts/state

State worker at `api.anipotts.com`. It hosts three Durable Objects behind a Hono
REST and WebSocket API.

| Durable Object | Holds                          | Producer                                                         |
| -------------- | ------------------------------ | ---------------------------------------------------------------- |
| `LinkVault`    | saved links                    | `POST /api/links` with the publish key                           |
| `CodeStats`    | git commits                    | none live: the Mini commit publisher is not installed on ap-mini |
| `CommandRelay` | control commands for `ap-mini` | none: no device can connect                                      |

The current repo architecture lives in `docs/platform-architecture.md`. The
older May 2026 personal-cloud sketch is archived at
`docs/archive/personal-cloud-architecture-2026-05-13.md`.

## State on 2026-09-22

- Links: the vault holds one link (source `manual`, saved 2026-05-14).
- Commits: `GET /api/commits` returns 0 commits. The publisher in
  `scripts/mini` has no loaded launchd job on ap-mini, so nothing posts to
  `POST /api/commits`.
- Control: no device connects. The connect route accepts only a WebSocket
  handshake signed by the ap-mini device key and checked against the
  `CONTROL_PLANE_DEVICE_PUBLIC_JWK` secret. No device key is configured and no
  control-plane runner is loaded on ap-mini, so every connect returns 401.
  `GET /` does not advertise it.
- No admin view reads this worker.

`GET /health` reports each of these planes (see [Health](#health)). Against
the state above it reads `ok: false`, with links `readable`, commits
`never_received` and control `disabled`.

## Quick start

```bash
pnpm install
pnpm --filter @anipotts/state dev
# in another terminal
pnpm --filter @anipotts/state test:cli http://localhost:8787
```

## Endpoints

| Method | Path              | What                                                                                                                                  |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`               | Service info: the links and commits endpoints, and the Durable Objects that can serve (`CommandRelay` only while a device key is set) |
| GET    | `/health`         | Per-plane state; see [Health](#health)                                                                                                |
| GET    | `/api/links`      | List saved links                                                                                                                      |
| POST   | `/api/links`      | Save a link (publish key). Body: `{ url, title?, tag?, note?, source? }`                                                              |
| DELETE | `/api/links/:id`  | Remove a link (publish key)                                                                                                           |
| GET    | `/api/links/ws`   | WebSocket. Receives `snapshot` on connect, then `link.added` / `link.removed` on every mutation                                       |
| GET    | `/api/commits`    | List held commits, newest first. `?limit=` caps the list (default 100)                                                                |
| POST   | `/api/commits`    | Add one commit or `{ commits: [...] }` (publish key). The window keeps the newest 500                                                 |
| GET    | `/api/commits/ws` | WebSocket. Receives `snapshot` on connect, then `commit.added`                                                                        |

Write routes require `Authorization: Bearer $STATE_PUBLISH_KEY` and answer 503
when that secret is not configured. `POST /api/links` answers 400 unless the
body is a JSON object whose `source`, when present, is `shortcut`, `admin` or
`manual`. A link without one is stored as `manual`.

## Health

`GET /health` answers 200 with `Cache-Control: no-store` and one bounded fact
per plane: state names, counts and times, never a link url, a commit sha or a
binding or secret value. The route is public, so each call reads two stored
keys per plane (a held count and a last time, kept on every write) and never
lists a Durable Object's storage.

| Plane     | States                                                                                    | Measured from                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `links`   | `readable`, `unreadable`                                                                  | LinkVault's held count and newest `savedAt`                                                       |
| `commits` | `receiving`, `none_in_budget`, `never_received`, `unrecorded`, `unreadable`               | CodeStats' held count and the last POST that carried a well-formed commit, against a 7 day budget |
| `control` | `disabled` (no device key, every connect returns 401), `configured` (a device key is set) | whether `CONTROL_PLANE_DEVICE_PUBLIC_JWK` is set; the value is never read into the response       |

`ok` is true only while `links` is `readable` and `commits` is `receiving`.
`control` never sets it, and `configured` does not mean a device connects.
`none_in_budget` means no commit arrived in 7 days; the publisher posts only
when a repo has a new commit, so it cannot tell a quiet week from a stopped
publisher. `unrecorded` means commits are held that arrived before receipts
were recorded. Each Durable Object read gets 2.5 seconds before its plane reads
`unreadable`.

## Deploy

```bash
pnpm --filter @anipotts/state exec wrangler deploy
```

Production is bound to `api.anipotts.com` by the `[[routes]]` block in
`wrangler.toml`. Agent PRs that touch `workers/state/**` deploy through the
explicit `state=true` deploy target.

## Adding a new DO

1. New file at `src/do/<name>.ts` exporting a class extending `DurableObject`.
2. Export it from `src/index.ts`.
3. Add `[[durable_objects.bindings]]` and `[[migrations]]` (with `new_sqlite_classes`) to `wrangler.toml`.
4. Add Hono routes that proxy to the DO.

## Architecture

The current source truth is `docs/platform-architecture.md`. Inputs and write
paths need explicit route-level authority before they become live controls.
