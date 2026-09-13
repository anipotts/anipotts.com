# Operations observability feature handoff

## Integration scope

Foundation: `a3f4e9927ae25892b91fef81981ca6855a9905d8`. Feature route: `/operations/observability`, using existing `AdminLayout` and Astryx components. Website owns navigation, shared shell/theme/layout, preview allowlists and authentication. Existing diagnostics are preserved.

Authenticated GET `/api/admin/observability` currently returns an explicitly unconfigured snapshot with no upstream reads. It inherits existing Operations middleware and sends private/no-store headers. No runtime URL, credential, binding or access grant is added. The server-only `ObservabilityReadCapability` is dependency-injected for review and tests; System and Website must approve and wire a real capability before activation. Never take its target from a request parameter.

## Projection semantics

`observability-model.ts` is a proposed feature-side projection, not a replacement runtime schema. It rejects unknown fields and free text, limits collection sizes, and requires every starting inventory row. System must supply the complete enrolled inventory before whole-system coverage can be claimed. The project-services row explicitly records the missing inventory rather than pretending to enumerate it.

Instrumentation, connection, observation age and last outcome remain separate. Missing observations never establish health. A disconnected feed retains previous evidence but marks coverage disconnected. Freshness ages in the browser. Read reconnect uses complete bounded snapshots and exponential backoff, preserving filters and selected view. It does not yet provide a durable replay cursor or a history search backend; search covers only the current bounded snapshot.

Committed checkpoints have opaque evidence IDs and no duration. Only explicit measured-execution spans have duration. No record bodies, queries, paths, credentials or raw exception text cross the contract. Incident state stays in Operations, with concrete action enums and the PersonalContext-only pilot; this feature neither detects nor sends incidents.

## Local verification

- Frozen dependency bootstrap was explicit after measuring 6.0 GiB free; afterward 3.6 GiB remained. No lockfile change. Husky prepare could not write shared Git config; the existing `.husky/_` hook path was preserved.
- Admin and dependency build passed.
- Astro check: zero errors/warnings; five existing hints outside this feature.
- Focused tests cover unknown/stale/failed coverage, strict redaction, measured spans, bounded and failed reads, no background reads while unconfigured, view switching and failed reconnect.
- Browser validation at canonical `http://localhost:4311/` awaits Website integration of the new route and local preview handling. Component tests are not browser proof.

## Remaining acceptance

This is local feature code, not live telemetry or a release. Runtime ownership stays with System; Personal Wiki owns consolidation. Current runtime coordination is awaiting System response. Still required:

- Reviewed runtime projection mapping, authenticated access and full service/source inventory.
- Actual execution instrumentation, committed live activity, deterministic failure/recovery and durable reconnect replay proof.
- Measured disk enforcement, 30-day detail, and completed 13-month aggregates. Collector rotation configuration alone is not measured retention proof.
- Deterministic incident worker/outbox and separately verified Gmail/distinct-iMessage routes with native sending controls.
- Demonstration that producer work proceeds while the telemetry sink/dashboard fails.
- Canonical browser checks across responsive sizes/themes/keyboard, protected integration checks, merge and admin-only deployment proof.

No shared service, launchd, account, external sending, source-data mutation or deployment was performed. Delegate collector and Quantercise remain independent.

## Astryx review follow-up

The feature UI now follows the installed Astryx v0.4.6 table template and component documentation: Layout/Stack frame, compact service/evidence Table rows, TabList navigation with its native aria-current and arrow-key focus behavior, Timestamp, MetadataList and StatusDot. Custom CSS is retired and no longer imported. Shared theme and shell remain integration-owned. Normal UI copy omits implementation and sending-control procedures.

Reconnect is synchronously guarded and uses Astryx loading/disabled state throughout the request. Added tests prove rapid clicks issue one request, recovery re-enables the control, keyboard navigation changes the active view, and filtered-empty coverage supports clearing search separately from unavailable evidence. All 30 focused tests pass. Browser visual/responsive acceptance remains pending; no alternate browser was substituted.

## Minimal Operations and connection actions

Operations opens with Machines, Loops and Latest activity. Machines shows the two inventory hosts with unknown observation state until measured. Loops shows known candidate capture/ingestion/wiki/backup/collector components without asserting they run. Activity sorts newest first. Coverage, traces, metrics and incidents remain available under More. Shared Admin identity and workspace switcher are Website-owned. Product/onboarding helper paragraphs were removed.

Connection evidence: the feature adapter has no upstream capability and no write capability. Its API remains authenticated. The pre-existing runtime overlay reads a local development feed only and is explicitly disabled outside development (`src/data/runtime.ts`). A Codex host connection is not evidence of telemetry enrollment or a running loop. No disconnect, archive or delete API exists in this feature.

Proposed action semantics for integration review:

| Action     | Meaning                                                                                                                   | Required capability                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Reconnect  | Retry an existing authorized connection without changing credentials or enrollment.                                       | Current button retries the read feed only; per-machine reconnect needs a reviewed runtime adapter.                             |
| Disconnect | Stop future reads/collection for the selected connection while preserving evidence and records.                           | Explicit runtime-owned disconnect capability and applicable native controls; not browser-only hiding or service retirement.    |
| Archive    | Move a connection's listing out of the default view with an undo/restore path; retain its records and connection state.   | Reviewed persisted presentation preference, separate from runtime enrollment.                                                  |
| Delete     | Remove the specifically selected connection configuration after identifying retained/deleted data and downstream effects. | Exact scope, native approval and verified deletion capability; never imply deletion of personal source records or credentials. |

Only read-feed Reconnect is currently executable. Other actions are design contracts, not enabled UI controls, grants or fabricated mutations. Runtime owner must supply connection identity, current state, per-action capability and proof before controls are introduced.
