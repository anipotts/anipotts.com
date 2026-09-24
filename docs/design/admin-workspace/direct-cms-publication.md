# Direct CMS publication

Status: the public reader serves from the content store (`CONTENT_RUNTIME = "cms"`) and the admin publishes directly, including per-record unpublish. The direct publisher is the only publisher; the repository (GitHub pull request) publisher was removed on 2026-09-22.
This replaces GitHub pull requests and site deployments as the content publication workflow. GitHub remains the software review and release system. The existing Quiet Precision contract remains applicable to appearance, private history and recovery.

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

A later Git deployment cannot overwrite an existing CMS record. The public reader pins one inventory per request, overlays before visibility filtering, and does not fall back to Git when activated CMS storage fails. It bypasses static HTML and manifest-asset shortcuts for affected routes. Search, feeds, sitemap and detail/listing pages use the same resolver. A 200 from those routes revalidates on every use (`public, max-age=0, must-revalidate`) under a strong ETag of content schema, inventory version and a hash of release plus path, so a publish changes every tag. A matching `If-None-Match` gets a 304 from the single-row inventory counter before the publications load or anything renders. Each colo keeps a Cache API copy keyed by host, path and that tag, so a publish or deploy moves every route to a new key and an old copy never answers. `/api/content-version`, editorial media, 404s, redirects and every 503 stay `no-store` with no validator, and `CDN-Cache-Control`/`Cloudflare-CDN-Cache-Control` stay `no-store` everywhere.

## Durable operation

1. Validate owner/CSRF, operation identity, exact draft revision/source hash and reviewed public pointer/baseline.
2. Persist intent and alarm before external work. Reject a second pending activation for the same record with the original operation's visible status.
3. Validate the candidate inventory. Verify reader protocol/schema and exact bundled-content digest; unrelated code release SHAs may differ.
4. Stage bounded immutable images and check their bytes before and after copying.
5. Atomically activate one record through the existing D1 compare-and-swap transaction. Receipt replay never reactivates history.
6. Reconcile the D1 receipt before every retry. A lost response cannot cause blind republishing. Update the private baseline without overwriting newer authored text.
7. Verify public receipt identity, coherent rendered detail/discovery versions, and referenced public image hashes. Preserve incomplete verification truthfully after activation.

The DO persists leases, backoff and terminal outcomes. The kill switch (`EDITORIAL_PUBLISH_ENABLED = "false"`) blocks new activation and keeps a bounded wake, while committed effects still reconcile and verify. A missing `CONTENT_DB` binding keeps the wake without any external I/O. A missing media binding does not block private draft/status access. A browser timer only refreshes presentation.

Scope is one reviewed record per operation. This does not implement atomic multi-record publication. Scheduling and URL changes wait for reviewed lifecycle/redirect ownership rather than silently taking partial effect. Drafts are preserved when an unsupported operation is refused. Limits remain 512 KiB source, ten editorial images and 10 MiB referenced image bytes per record.

## Unpublish and publish again

Unpublish is the same durable operation with `action: "unpublish"`. It never deletes a row. It activates a new immutable revision built from the current public source with only its visibility switched off: writing gets `status: draft` and keeps `published_at`; work gets `public_state: hidden` and `homepage_placement: none`, because a hidden project cannot hold a homepage placement. The reader already filters on exactly these fields, so the piece leaves listings, the detail route (404), sitemap, feed and search index at the new inventory version.

- The hidden revision comes from the public source, never the private draft, so an unpublish carries no unreviewed private text into the publication database. The browser sends only hashes. The API route reads the public source itself, and the publisher checks it against the reviewed baseline hash and the reviewed hidden-revision hash before persisting intent.
- CAS, receipt reconciliation, leases, retry windows and the kill switch are shared with publish. No media is staged.
- Pages are refused (`unpublish_unsupported`): every required page renders a route. A record that is not public is refused (`already_hidden`). An article the homepage still features blocks in preparation (`unpublish_breaks_reference`) with no write, until the homepage is published without it.
- Verification for an unpublish: `/api/content-version` reports `visible: false` at an inventory at or after the activation, the detail route and the article's social card return 404 with that `X-Content-Version`, and `/writing` (or `/work`), `/feed.xml`, `/search-index.json`, `/sitemap.xml` and `/` return 200 at that version without naming the route or slug. A stale validator, colo copy or older 404 fails verification.
- The private draft and its full history are untouched, and every revision stays in `editorial_published_revisions`. Publish again is the normal publish flow: the draft still says published, so review shows the visibility change and approval activates the next revision.
- Social cards are built at deploy time. Under the content store the www Worker serves `/social/writing-<slug>.png` only while that article is public at the current inventory, returns a no-store 404 with the version header otherwise, and makes a served card revalidate on every use.
- Editor: a ghost Unpublish action (Phosphor EyeSlash) opens a compact inline confirmation; while hidden, the primary action reads Publish again. The Content library labels an unpublished record Hidden from site, apart from never-published drafts.

## Deployment and controls

The public reader has one mode: `CONTENT_RUNTIME` must be exactly `cms`, and a missing, `legacy` or any other value returns a no-store 503 on every content route. The bundled Git content is never a runtime source on its own.

| Control                           | Values                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Admin `EDITORIAL_PUBLISH_ENABLED` | `"true"` publishes; anything else is the kill switch                            |
| Public `CONTENT_RUNTIME`          | `cms`                                                                           |
| Runtime bindings                  | `CONTENT_DB`, `CONTENT_MEDIA`; never reuse shared `DB` as the publication store |

`EDITORIAL_PUBLISH_MODE` and the GitHub App identity (`EDITORIAL_GITHUB_APP_ID`, `EDITORIAL_GITHUB_INSTALLATION_ID`) are no longer read. The retired publisher's private SQLite tables (`publications`, `publication_requests`, `publication_jobs`) stay in the Durable Object untouched; nothing reads or writes them. Its last signed manifest, `content/publication.json`, stays in the repository as content history.

The isolated release-test preflight uses `CONTENT_DB` and `CONTENT_MEDIA`, CMS reader mode and an admin with activation disabled. It explicitly rejects an active direct profile because the publisher verifies a fixed production origin. A run-owned verification target and real owner acceptance remain prerequisites for isolated cloud publishing proof.

Application rollback must retain a CMS-aware public reader. Content rollback creates a new reviewed publication. Database restore starts with the kill switch on, with pending work suspended for reconciliation. Restoring a draft never publishes it.

The activation records below are dated history. Where they name `EDITORIAL_PUBLISH_MODE`, maintenance or legacy jobs, those controls have since been removed.

## Direct activation, 2026-09-21

Ani approved turning on direct publishing. Every gate the code still enforces, and its state for this change:

| Gate (where enforced)                                                                                      | State                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EDITORIAL_PUBLISH_MODE = "direct"` (`editorialPublishMode`, `productionEditor`)                           | Set in `apps/admin/wrangler.toml` by this change                                                                                                                                                                   |
| `EDITORIAL_ENABLED` and `EDITORIAL_PUBLISH_ENABLED` are `"true"` (`startDirectPublication`, `canActivate`) | Already set                                                                                                                                                                                                        |
| `CONTENT_DB` and `CONTENT_MEDIA` bound (`startDirectPublication`, `canActivate`, runtime contract)         | Bound since #422; the drift test requires both in direct mode                                                                                                                                                      |
| 40-hex `PUBLIC_RELEASE_SHA` in the admin build (`productionEditor().publishing`)                           | `deploy.yml` builds with `github.sha`                                                                                                                                                                              |
| Migration 0002 on `anipotts-content` (`publishDirect` names `content_schema_version`)                      | Applied remotely per the activation record. If it were missing, the batch fails and rolls back with no write, and the operation stops at `publication_retry_required`                                              |
| No unfinished legacy job with attempts, lease or checkpoint (`start`)                                      | Both held jobs were retired to `cancelled` by the #423 maintenance retirement; the queue is empty                                                                                                                  |
| Reader ready: runtime 1, content schema 1 and identical bundled-source digest (commit phase)               | Satisfied while www and admin run the same `content/public` tree. This change edits no content                                                                                                                     |
| Public verification against the #425 validators (`verify`)                                                 | A 200 must carry `X-Content-Version` equal to the reader's inventory and an ETag matching `cms<schema>-v<version>-<hex>` (weak allowed); a 404 must carry the version header. Covered by `test:runtime`            |
| Isolated release-test profile rejects direct mode (`content-release-isolation.mjs`)                        | Obsolete for production: it governs only the synthetic run-owned profile, whose verification cannot target anipotts.com                                                                                            |
| Coordinated DO/D1/R2 export and isolated restore (gate 2 above)                                            | Superseded for this activation by a Time Travel bookmark captured before deploy plus the local publish, unpublish, publish again and restore proof. Private drafts stay in the Durable Object and are not exported |

Nothing in code blocks activation. Two steps need Ani: merging after review, and the live acceptance below. The read-only bookmark capture right before the admin deploy needs his Wrangler session.

## Recovery and rollback

Capture a bookmark immediately before the admin deploy that turns on direct mode, and keep the id with the deploy record:

```bash
pnpm exec wrangler d1 time-travel info anipotts-content --config apps/admin/wrangler.toml --json
```

Export on demand before any risky change, and nightly from ap-mini once a read-only D1 token is issued for it (age-encrypted and copied by the existing rclone path; this change adds no schedule or credential):

```bash
pnpm exec wrangler d1 export anipotts-content --remote --config apps/admin/wrangler.toml \
  --output "anipotts-content-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

Time Travel restores to any minute in its retention window (30 days on the paid plan). An export is the portable copy beyond that window; restore it into a fresh database with `wrangler d1 execute <db> --remote --file <export.sql>`.

Rollback, in order. Stop writes before restoring, and roll code back only if code regressed:

```bash
# 1. stop publishing: set EDITORIAL_PUBLISH_ENABLED = "false" in apps/admin/wrangler.toml and deploy,
#    or roll the admin Worker back to its previous version
pnpm exec wrangler rollback --config apps/admin/wrangler.toml
# 2. restore published content to the captured bookmark
pnpm exec wrangler d1 time-travel restore anipotts-content --bookmark=<id> --config apps/admin/wrangler.toml
# 3. only if the reader regressed: roll www back to its previous version
pnpm exec wrangler rollback --config apps/www/wrangler.toml
```

`wrangler rollback` without a version id returns to the previous deployment; pass `<version-id>` from `wrangler deployments list --config <app>/wrangler.toml` to pick one. A restore moves the inventory back, so every public validator changes and no cached copy answers. Accepted operations whose receipt the restore removed stop at `publication_receipt_missing` for reconciliation rather than republishing. The private baseline marker ignores receipts below its recorded inventory, so Content library change hints can lag until the inventory passes its pre-restore version; publishing itself reads D1 and is unaffected. Content rollback of a single piece stays a new reviewed publication, not a restore.

`apps/www/test/workerd-publication-smoke.mjs` (`pnpm --filter @anipotts/www test:runtime`) proves the sequence locally against the built Worker and workerd D1: publish, unpublish (detail and card 404, absent from discovery at the new version, stale validators refused), publish again, then replace the database from an export taken before the unpublish and confirm the reader serves the captured version.

## Verification boundaries

Local validation on 2026-09-20 passed `pnpm check:changed --working-tree`, which selected the full `pnpm validate` path for the shared build/contract changes. This includes builds, lint/typecheck, format checks, CI invariants and empty/populated migration proof. The run passed 1,062 admin component/controller tests, 16 Astro tests, 139 editorial Worker tests, 119 public tests and 148 content-package tests. Separate `test:runtime` exercised the built public Worker against local workerd and D1. The actual esbuild/Miniflare local-draft bootstrap is covered so importing the direct publisher cannot break local autosave.

Tests cover actual local workerd/SQLite DO/D1/R2 behavior separately from browser DOM/component tests and built-Worker render tests. Local provider-runtime proof is not isolated cloud acceptance. Browser checks cover 320, 390, 768, 792, 1280 and 1440 widths, selection with stable toolbar geometry, bold/undo and local review. Physical iOS keyboard, Safari/VoiceOver and production owner acceptance remain separate checks.

Do not report this increment as deployed, recovery-complete, or a full multi-record CMS release. It replaces the content publishing mechanism; the remaining activation gates above are concrete prerequisites, not routine authoring steps.

## Activation evidence refresh, 2026-09-21

Audited implementation: `8c5acd58fafc13ab00ba1ba3b55af8c8fd3fa4e4`.
Required GitHub checks passed on this exact head. Production admin is separately
verified at editor-only release `7439c053033cc3903de88489ac16c2de8c966ec0`;
this does not activate the direct publisher.

| Gate                          | Fresh evidence                                                                                                                                                                                  | Disposition                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Migration compatibility       | `node scripts/ci/content-publication-migration-proof.mjs` passed empty and populated 0001-to-0002, retained revisions/pointers, old named-column writer defaults, immutability and foreign keys | Local compatibility proven; remote migration not applied                                                                            |
| Retry/interruption            | `test/editorial/direct-publisher.test.ts`: 24/24 passed using local workerd, D1 and R2 with remote bindings disabled                                                                            | Durable intent, lost activation response, newer private revision, alarms and media-copy failures covered; public fetch is synthetic |
| Disaster recovery             | No portable coordinated DO/D1/R2 export/import, independent restore or measured protected checkpoint age exists in the audited implementation                                                   | Missing implementation, not a test waiting to be checked off                                                                        |
| Pending awareness operation   | Owner-authenticated production response: `04e4d58a-bf1f-4070-bc44-524f8feee54a`, validate, version 0, attempts 0, no lease, blocker or checkpoint                                               | Never started; preserve until maintenance retirement is deployed and freshly checked                                                |
| Pending chainedchat operation | Owner-authenticated production response: `788547af-0aa4-4e8c-bb7f-6e83d62cf1c6`, validate, version 5, attempts 2, no lease/checkpoint, blocked `unreleased_public_changes`                      | Requires explicit reconciliation; existing unstarted-only retirement rejects                                                        |

On deployed `7439c053`, validation only reads and checks readiness. The first
publication write is `createCommit` in the subsequent commit phase. Job phases
advance monotonically; attempts count claims, not writes. Current editorial
branch enumeration and all-state PR queries found no matching artifacts for
either operation. Commit search found no chainedchat publication trailer.
The deployed FIFO claim/next-wake logic selects only the first unfinished job and stops on a blocked head. Later jobs therefore remain unstarted while the older UI reports checking content.
These corroborate the validation-only state; absent search results alone do not
prove complete historical absence. No production operation was cancelled,
retried or replayed during this inspection.

System's existing recovery capability report confirms reusable age/rclone tools
and Google Drive capacity. CMS generation capture and restore remain website
work. Unattended Drive authentication on always-on mini and protected-checkpoint
monitoring remain setup gates; the laptop's existing access does not establish a
one-hour unattended recovery guarantee. No new credential or schedule was set.

Fresh read-only provider verification through mini's existing Wrangler session:

| Resource             | Observed result                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin                | Version `042839d5-a1ec-4fcf-8bce-6167711f36ad`, release `7439c053033cc3903de88489ac16c2de8c966ec0`, 100% traffic; no CONTENT_DB or CONTENT_MEDIA binding |
| Public renderer      | Version `d026eaa7-74ac-4eb0-9889-27425962e61a`, 100% traffic; no CONTENT_DB or CONTENT_MEDIA binding                                                     |
| Existing shared DB   | Both apps still bind DB to `a8aadf73-bbf4-447c-97db-cb3e50b4e26f`; preserve it                                                                           |
| Dedicated content D1 | Migration ledger contains only `0001_published_snapshots.sql`; zero revisions and zero active rows; 53,248 bytes; queries report zero writes             |
| Content media        | Provider metrics: zero objects/bytes; r2.dev disabled; no custom domains                                                                                 |
| D1 recovery API      | Bookmark `00000007-00000000-000050ed-6b530ff039a95314c2cb3ba823f6142f`; availability proven, independent restore not performed                           |

No migration, binding, account, media, publication or authentication mutation was
performed for these checks. The next implementation prerequisite is a coherent,
versioned recovery export and isolated restore. Then apply the reviewed dedicated
migration and bindings, deploy the reader before enabling the writer, and reconcile
legacy operations against refreshed exact versions. Provider PITR is retained as
an additional recovery mechanism, not substituted for cross-store restore proof.

## Git baseline seed

`scripts/content/seed-content-d1.mjs` copies each public Git record into the dedicated content D1 as revision 1 with publication ID `git-seed.<kind>.<id>`, no expected publication and expected inventory version 0. All seeded records share one activation, so the inventory moves 0 to 1 once. Hidden projects, draft writing, the newsletter page and non-record files stay Git-only, because the publisher refuses to activate them and the database holds public snapshots only. The script is a dry run by default. It reads state before writing and refuses any row it did not produce. Every statement is guarded, so an interrupted file converges on rerun. Remote writes need `--confirm-remote anipotts-content`. Media upload is a separate `--upload-media` mode.

`node apps/www/test/cms-seed-routes.mjs` (`pnpm --filter @anipotts/www test:cms-routes`) seeds a local D1 with this script, serves the existing www build under local workerd and checks every public route on all three hostnames: status, the cms cache contract, and that each seeded record is answered from the store. `apps/www/test/published-runtime.test.mjs` proves in process that a store seeded from Git renders every route byte for byte like the bundled defaults, so a reseed is a zero visible change: sitemap `lastmod` comes from frontmatter dates only, articles emit no publication-based `dateModified`, a CMS article keeps its bundled social card by slug and falls back to the site card only when none was built, and CMS bodies are trimmed like Astro's loader.
