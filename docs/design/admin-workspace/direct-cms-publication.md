# Direct CMS publication

Status: implemented in `codex/cms-editor-publisher` for review, not activated in production.
This supersedes GitHub pull requests and site deployments as the normal content publication workflow. GitHub remains the software review and release system. The existing Quiet Precision contract remains applicable to appearance, private history and recovery.

## The authoring flow

Production admin privately autosaves a document. Publish prepares its exact acknowledged revision and current public baseline for review. Approval persists immutable intent before any external work. The editor shows preparation, publication, and live verification separately. Continuing to edit never changes the approved source. For a new article, Publish prepares visibility and its initial date privately; the review includes both before approval.

Formatting controls stay visible without selection or hover. Title, subtitle and body have visible labels and stable rounded editing surfaces. Properties and publication details remain available in Document actions rather than crowding the writing toolbar. The local review environment cannot publish to production.

## Stores and authority

| Data                                                         | Authority                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Draft text, revision history, conflicts, recovery identities | Existing Editorial SQLite Durable Object                                                    |
| Approved pending operation and progress                      | Immutable direct-publication intent in the same object                                      |
| Published source and active record pointer                   | Dedicated content D1; immutable revisions and monotonic inventory version                   |
| Published editorial image bytes                              | Existing private content-media R2 bucket, exposed only through the active-reference gateway |
| Initial/default content                                      | Bundled Git source, overridden as a complete record by CMS ownership                        |

A later Git deployment cannot overwrite an existing CMS record. The public reader pins one inventory per request, overlays before visibility filtering, and does not fall back to Git when activated CMS storage fails. It bypasses static HTML and manifest-asset shortcuts for affected routes. Search, feeds, sitemap and detail/listing pages use the same resolver. CMS responses use no-store initially.

## Durable operation

1. Validate owner/CSRF, operation identity, exact draft revision/source hash and reviewed public pointer/baseline.
2. Persist intent and alarm before external work. Reject a second pending activation for the same record with the original operation's visible status.
3. Validate the candidate inventory. Verify reader protocol/schema and exact bundled-content digest; unrelated code release SHAs may differ.
4. Stage bounded immutable images and check their bytes before and after copying.
5. Atomically activate one record through the existing D1 compare-and-swap transaction. Receipt replay never reactivates history.
6. Reconcile the D1 receipt before every retry. A lost response cannot cause blind republishing. Update the private baseline without overwriting newer authored text.
7. Verify public receipt identity, coherent rendered detail/discovery versions, and referenced public image hashes. Preserve incomplete verification truthfully after activation.

The DO persists leases, backoff and terminal outcomes. Maintenance retains a bounded wake; disabled publishing blocks activation while committed effects can still reconcile. A missing media binding does not block private draft/status access. A browser timer only refreshes presentation.

Initial scope is one reviewed record per operation. This does not implement atomic multi-record publication. Explicit unpublication, scheduling and URL changes wait for reviewed lifecycle/redirect ownership rather than silently taking partial effect. Existing hidden overrides remain suppressed by the reader. Drafts are preserved when an unsupported operation is refused. Limits remain 512 KiB source, ten editorial images and 10 MiB referenced image bytes per record.

## Deployment and transition

Production configuration is deliberately unchanged by this implementation. Missing mode means legacy only for compatibility; unknown explicit values fail closed.

| Control                        | Values                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Admin `EDITORIAL_PUBLISH_MODE` | `legacy`, `maintenance`, `direct`                                               |
| Public `CONTENT_RUNTIME`       | `legacy`, `cms`                                                                 |
| Direct runtime bindings        | `CONTENT_DB`, `CONTENT_MEDIA`; never reuse shared `DB` as the publication store |

Read-only provider verification on 2026-09-20 found dedicated D1 `anipotts-content` (`2679fc97-e251-46b7-ad01-db8b9fe04e8d`) with migration 0001 only and no active/publication rows. `anipotts-content-media` was private with no custom domain or r2.dev exposure and zero objects in provider metrics. Neither deployed app had these bindings. System recorded evidence in its existing consolidation handoff. This is resource inventory, not restore proof.

Activation gates, in order:

1. Review this implementation and required checks on its exact head. Preserve the current compatible software artifact.
2. Prove isolated schema migration from 0001 to 0002 and an export/restore of exact draft/history/conflict/publication/media identities. Capture compatible app/schema identities. Existing provider PITR is not complete cross-store recovery proof.
3. Prepare scoped resource bindings and dedicated migration controls in the existing release workflow. Do not run these migrations against `anipotts-db`.
4. Deploy the compatible public reader and admin with direct writes disabled. Activate `CONTENT_RUNTIME=cms` only with verified schema/bindings and reader acceptance.
5. Put the legacy publisher in maintenance. Inventory every unfinished job and inspect actual branch/PR/content effects before cancellation or reconciliation. Historical receipts remain. New direct operations reject unreconciled effectful legacy work.
6. Enable direct publishing only after reader, recovery and owner acceptance. An actual public-content acceptance change requires Ani's approval.
7. Record deployment versions, scoped targets, representative owner workflow and public verification. Retire legacy executable publishing after replacement acceptance and rollback compatibility are proven.

Maintenance exposes owner-authenticated `legacy-publication` inspection and `cancel-legacy-publication` retirement independently of direct-mode dispatch. Retirement requires the exact operation, frozen revision and job version, and only accepts a never-claimed validation job with no lease, checkpoint or blocked state. Attempted or ambiguous jobs require separate effect reconciliation; an empty checkpoint alone is insufficient. Cancellation preserves the source, receipt and private history.

The isolated release-test preflight now uses `CONTENT_DB` and `CONTENT_MEDIA`, CMS reader mode and a maintenance-mode admin with activation disabled. It explicitly rejects an active direct profile because the current publisher verifies a fixed production origin. A run-owned verification target and real owner acceptance remain prerequisites for isolated cloud publishing proof.

The observed blocked chainedchat job was still in validation with `unreleased_public_changes`; a focused GitHub read found no matching current branch or PR. That alone is not exhaustive historical-effect proof and no production job was changed.

After the first direct activation, application rollback must retain a CMS-aware public reader and publisher mode gates. Content rollback creates a new reviewed publication. Database restore starts in maintenance, with pending work suspended for reconciliation. Restoring a draft never publishes it.

## Verification boundaries

Local validation on 2026-09-20 passed `pnpm check:changed --working-tree`, which selected the full `pnpm validate` path for the shared build/contract changes. This includes builds, lint/typecheck, format checks, CI invariants and empty/populated migration proof. The run passed 1,062 admin component/controller tests, 16 Astro tests, 139 editorial Worker tests, 119 public tests and 148 content-package tests. Separate `test:runtime` exercised the built public Worker against local workerd and D1. The actual esbuild/Miniflare local-draft bootstrap is covered so importing the direct publisher cannot break local autosave.

Tests cover actual local workerd/SQLite DO/D1/R2 behavior separately from browser DOM/component tests and built-Worker render tests. Local provider-runtime proof is not isolated cloud acceptance. Browser checks cover 320, 390, 768, 792, 1280 and 1440 widths, selection with stable toolbar geometry, bold/undo and local review. Physical iOS keyboard, Safari/VoiceOver and production owner acceptance remain separate checks.

Do not report this increment as deployed, recovery-complete, or a full multi-record CMS release. It replaces the content publishing mechanism; the remaining activation gates above are concrete prerequisites, not routine authoring steps.
