# Operations integration source audit

2026-09-12. Full-read audit of the ten files below, against feature integration through af84e79b. Read the current observability-handoff.md for ownership, action semantics and outstanding capability boundaries. No actual exporter, database, collector, endpoint or authentication change was invoked. Python tests create synthetic temporary SQLite only.

## Contract review

- The projection contains metadata only: fixed service IDs, enumerated instrumentation/connection/outcomes, bounded dates and numbers, opaque evidence/trace/span IDs, events, measured spans, metrics and narrowly scoped incidents. Unknown root and nested fields are rejected. Every known inventory service must occur exactly once; collections have explicit caps. Unconfigured snapshots cannot contain observations or health assertions.
- Service state separates instrumentation, explicit connection, last observation, freshness and last outcome. Missing connection or observation never establishes healthy. Future/invalid dates become not-observed. The fixed inventory is a starting list, not proof of enrollment, recognizable machine inventory completeness or running loops.
- The read capability is injected server-side and never constructed from browser query values. Absent capability returns unconfigured without fetching. Reads require successful JSON responses, cap streamed bodies at 262144 bytes, parse the strict projection and require live source. The 1500ms deadline returns even if the capability ignores abort; completion aborts/cancels acquired streams. A misbehaving capability still owns honoring its signal and disposing its underlying transport. Provider error bodies/exceptions never become UI copy or logs.
- The API calls the reader without a capability and sends private/no-store plus noindex/noarchive. Thus current API success means the unconfigured contract was returned, not connected telemetry. Middleware authentication is inherited and remains the separate security audit's responsibility. The page likewise injects an unconfigured initial snapshot and delegates view selection to the workspace.
- Read-result status retains the internal disconnected enum for a failed transport. The integrated UI now labels this Telemetry unavailable and prefixes service observations Last known rather than claiming machines disconnected. This closes the earlier SUP-1 presentation finding without changing actual measured connection state.

## Activity backfill review

- The pure projector accepts exactly items/next_cursor and reuses strict Life checkpoint validation and replay rules. It rejects future and pre-epoch observations, maps only succeeded/failed checkpoints to corresponding operational events, and leaves pending/blocked/excluded/skipped/observed checkpoints out of completion events.
- Opaque event IDs derive deterministically from trace ID and change ID. The output contains no personal body, query, source path, error payload or assertion. Backfilled checkpoint instrumentation and last observation do not imply current device contact, running/idle, health, incident detection or measured execution latency. Spans and incidents remain empty.
- The Python exporter opens the explicitly provided existing SQLite path in mode=ro, applies query_only, selects only the established six change metadata fields, bounds each page to 100, parameterizes after/limit, validates identifiers/stages/states/counts/dates, and closes the connection. CLI failures emit one generic message; success emits only validated metadata. It adds no listener, enrollment, credentials, acknowledgement, outbox writes or cursor persistence.
- Exporter tests prove synthetic database bytes unchanged, exact selected field names with a private fixture column excluded, empty cursor continuation, bound rejection and unknown-state rejection. This is not proof of production WAL behavior, actual schema compatibility, throughput or private source approval.

## Remaining compatibility limits

The exporter permits safe-integer change IDs, while the admin activity request builder currently caps cursors at ten million; sufficiently large valid exports will therefore require a coordinated cursor-bound decision before adapter activation. The exporter permits timezone-aware pre-epoch dates and broader ISO forms that the downstream projector may reject. These fail closed in the consumer, but producer/consumer acceptance should be aligned before promising uninterrupted replay. No real source size/date distribution was queried.

The API is not wired to this exporter or any runtime capability. This audit does not establish active collection, connected machines, durable cursor storage, disconnect/archive/delete support, retention enforcement, incident delivery or owner access. Action semantics and reserved controls remain in observability-handoff.md; no real action was tested.

## Verification

Node 24.19.0 focused Vitest: **33 tests passed in three files** (model, reader, activity). Python unittest: **three tests passed**, all against a temporary synthetic SQLite database. PYTHONDONTWRITEBYTECODE=1 avoided cache artifacts. No build/install or actual exporter invocation occurred. `git diff --check` passed before documentation.

Browser geometry, live read failure/reconnect and actual authorized integration acceptance remain separate. Passing source/fixture checks do not prove deployment or telemetry enrollment.

## Full-read hashes

| File                                                  | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/lib/observability-model.ts`           | `92e59c7dd378918a4337d633e0e60178ee888e380bd2c78d2edc0497a4b0699a` |
| `apps/admin/src/lib/observability-model.test.ts`      | `1e4271383227e23567d0e638c5e8a52f37daecd2ad2786b26ca6f97e09a3bb34` |
| `apps/admin/src/lib/observability-reader.ts`          | `47aa460816bda96112fa002a87540ac856e9a08ef056400773a26927fef95ace` |
| `apps/admin/src/lib/observability-reader.test.ts`     | `4a41cf6a9e60365751e79f8581ac491c164a0746431e8e49fce99ca8b76241ad` |
| `apps/admin/src/pages/api/admin/observability.ts`     | `252496cc7fda9044b192cb732cfffb3027ea1ca2c0e34e57d846604328df8ad9` |
| `apps/admin/src/pages/operations/observability.astro` | `157307387fb634d07608909fffb03eaec697612879b76b6b066081072639954c` |
| `apps/admin/src/lib/observability-activity.ts`        | `2255066115c32f250990cea2896c6b7c197d24307f8e0d1b8731499c93992a5d` |
| `apps/admin/src/lib/observability-activity.test.ts`   | `2f93b0037803272ce57274c2e57825c9fee0d5198735984cc5dd89b89c60666f` |
| `scripts/admin/export-observability-activity.py`      | `2f8ae2083b79593b6a655a7a1fcb768be1454039daddb4007a0777045052fec2` |
| `scripts/admin/test_export_observability_activity.py` | `53e99b6631e7c7ca6acccabe955240c5974aeb5a88931bcd7e2a0c75b1ebaf41` |
