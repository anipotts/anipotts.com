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

## Quick start

```bash
pnpm install
pnpm --filter @anipotts/state dev
# in another terminal
pnpm --filter @anipotts/state test:cli http://localhost:8787
```

## Endpoints

| Method | Path              | What                                                                                            |
| ------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/`               | Service info: the Durable Objects plus the links and commits endpoints                          |
| GET    | `/health`         | Liveness                                                                                        |
| GET    | `/api/links`      | List saved links                                                                                |
| POST   | `/api/links`      | Save a link (publish key). Body: `{ url, title?, tag?, note?, source? }`                        |
| DELETE | `/api/links/:id`  | Remove a link (publish key)                                                                     |
| GET    | `/api/links/ws`   | WebSocket. Receives `snapshot` on connect, then `link.added` / `link.removed` on every mutation |
| GET    | `/api/commits`    | List held commits, newest first. `?limit=` caps the list (default 100)                          |
| POST   | `/api/commits`    | Add one commit or `{ commits: [...] }` (publish key). The window keeps the newest 500           |
| GET    | `/api/commits/ws` | WebSocket. Receives `snapshot` on connect, then `commit.added`                                  |

Write routes require `Authorization: Bearer $STATE_PUBLISH_KEY` and answer 503
when that secret is not configured. A link's `source` is `shortcut`, `admin` or
`manual`, and defaults to `manual`.

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
