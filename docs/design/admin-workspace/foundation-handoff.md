# Admin foundation handoff

This foundation is a checked local integration base, not a production release or completed whole-admin overhaul. Browser visual QA, final coverage closure, protected PR/merge, admin-only deployment, live proof and safe worktree cleanup remain separate gates. The integration task will supply the immutable commit SHA after committing; never infer readiness from this file alone.

## Shared ownership

The Website integration task owns shared shell, navigation, palette, layouts, styles/theme, route/auth middleware, editor and cross-workspace contracts. Successors must not overwrite these files from an older main checkout. Request shared changes through the integration owner.

- `apps/admin/src/components/astryx/EditorialWorkspaceShell.tsx`: responsive Website shell, persisted user collapse, mobile drawer, direct theme selection, current workspace identity and inventory-injected navigation search.
- `apps/admin/src/components/astryx/AdminShell.tsx`: retained Operations shell and navigation grouping. It preserves existing consumers; it is not the future observability implementation.
- `apps/admin/src/components/astryx/AdminCommandPalette.tsx`: one shared command surface; editorial sources are injected metadata and never fetch Operations endpoints. Editor link shortcuts retain priority.
- `apps/admin/src/components/astryx/EditorialApp.tsx`: editorial theme/island and metadata-only saved-record projection. Acknowledged save events update catalog/search without moving source bodies into global navigation state.
- `apps/admin/src/components/astryx/ContentLibrary.tsx`: deterministic attention/update/title ordering, allowlisted URL filters, resume links, relative timestamps and explicit source availability.
- `apps/admin/src/components/astryx/RecordPanel.tsx`: one exclusive related panel; inspector only with enough writing width, otherwise accessible drawer.
- `apps/admin/src/components/astryx/HomeEditor.tsx`: existing stable draft controller, buffered editing, one in-flight save, URL modes, exact-revision review and source fallback. Feature successors do not edit this controller.
- `apps/admin/src/lib/content-library-state.ts`, `record-workspace-state.ts`, `editorial-inventory-events.ts`, `editorial-record-summary.ts`: browser-safe UI state/metadata contracts. Server projection helpers remain server-only.

## Future workspace boundaries

Ani adopted one admin app with Content, Operations and Life. Operations is optional systemwide OpenTelemetry observability, progressively instrumented; it must not impose registration, inbox-clearing, approvals or required project workflow. Life displays personal knowledge; Operations displays infrastructure behavior and coverage. Uninstrumented, unavailable and stale are distinct from healthy. No personal record bodies belong in telemetry.

Operations successor owns feature routes, observability components and reviewed telemetry read adapters. System retains runtime/service/instrumentation controls. Personal Wiki successor owns feature routes/components and the adapter to the existing PersonalContext single-writer SQLite/MCP authority after accepted handoff. Existing owner access does not implicitly authorize a new sensitive network surface. Do not replicate personal values into editorial drafts, public Git or Operations D1. No authentication unification or database migration is implied by a shared shell.

Legacy D1 content routes remain compatibility diagnostics, distinct from Git-backed editorial records. Their removed auth-session dependency is not restored. The legacy editor is now a read-only source/history viewer, and the proof receipt only displays observations. Existing backend helpers and stored records remain intact.

## Worktree startup

`scripts/codex-action setup` performs a repo/toolchain preflight without dependency installation or global Corepack changes. It explicitly reports deferred bootstrap. Use the explicit `bootstrap` action when needed and capacity permits; development/check actions remain strict. Reuse installed dependencies only through normal package-manager/worktree support; do not copy private files or invent success from directory presence.

Create successors sequentially from the exact foundation ref reported by the integration owner. It may be an unmerged branch commit: do not claim it is main/default. Keep each feature's edits separate and preserve all user drafts. No task creation or ownership transfer is performed by this document.

## Foundation validation receipt

Current complete working-tree validation passed on 2026-09-12 (`pnpm check:changed --working-tree`, `/private/tmp/admin-foundation-full-check.log`): repository invariants including actual-shell startup tests, formatting, builds, lint/type checks, 353 admin source/component tests, 89 editorial service tests, and shared package tests. Astro covered 213 admin files with zero errors/warnings. Browser setup remains unavailable; visual/live acceptance is explicitly incomplete. Private `docs/writing-drafts/` remains outside this foundation.
