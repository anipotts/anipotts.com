# Local to production draft continuity

Proposal for Ani's approval, 2026-09-12. No draft transfer or production mutation
has been implemented or performed by this proposal.

## Current behavior

Open production editor is a new-tab URL in HomeEditor. It does not flush and
transfer local drafts. Development uses local storage; production uses the
private production Editorial durable object. Production mutations require the
existing verified owner and same-origin CSRF. Private image IDs are content
hashes and can be verified without making an image public.

## Alternatives

1. Download/import a draft bundle. Least infrastructure, portable recovery, but
   repeated manual work. Markdown alone is insufficient for private images.
2. Explicit one-click private draft sync. Recommended first implementation:
   preserve isolated app development, transfer pending content when requested,
   then open the chosen production document. Use a durable local outbox so
   interrupted attempts can resume. This creates a foundation for later sync.
3. Always-connected shared private drafts. The smoothest eventual experience,
   but every local editing session writes to the remote draft workspace. Requires
   explicit connection semantics, version compatibility, offline reconciliation
   and conflict handling. Do not simply point the dev worker at production.

## Recommended behavior

- The button becomes Continue in production. Clicking captures a stable snapshot
  of pending local content drafts and opens the selected production document
  after those drafts have acknowledged private revisions.
- Include all pending local content changes, not app code or public Git changes.
  Preserve exact source bytes, validated record identity, field values, images,
  and original/cropped image relationships. Inventory the existing media-history
  representation before implementation; a Markdown-only copy is not sufficient.
- Save the active buffer first. If typing continues during transfer, that later
  generation remains pending and is visibly identified; never claim it synced.
- Use the existing production owner session. If sign-in is needed, retain the
  pending transfer locally and resume after authentication. Credentials never
  move into the local development server.
- Transfer through a dedicated authenticated production receiver, with exact
  origin/window/session validation and a short-lived one-use handshake. Browser
  messaging is an implementation candidate; verify authentication redirects and
  opener policy before choosing it. Do not loosen CORS or put content in URLs.
- Validate a versioned manifest, record identities, source sizes and hashes.
  Upload missing private media first and verify it. Content-addressed uploads
  avoid duplicate assets. Commit the draft only after all required assets exist.
- Each record transfer has an idempotency key, source hash and expected remote
  revision. Repeated clicks/retries cannot create duplicate saves. Retain the
  local copy and receipt until remote acknowledgement is verified.
- A first transfer must compare local base/source with the remote draft and
  current published base. An existing different production draft is a conflict,
  not permission to overwrite. Present both versions; preserve both until a
  choice or verified merge is accepted. Later syncs compare against the last
  acknowledged remote revision and source hash.
- Batch progress distinguishes synced, unchanged, pending and conflict per
  document. Partial completion is recoverable and never labeled all synced.
- This only changes private drafts. Publication remains a separate exact-revision
  review and explicit approval action. No newsletter send, account change or
  source deletion is part of sync.

## Verification before activation

Exercise synthetic writing, project and page drafts; missing/new records;
private images and originals; duplicate clicks; interrupted uploads; refresh;
sign-in interruption; stale tabs; typing during sync; schema mismatch; concurrent
production edits; partial batch failure; retry; and published-base movement.
Prove exact source/media hashes after acknowledgement and no publication calls.
Then release through the existing protected admin-only lane and verify using an
authorized production session before transferring Ani's actual drafts.

## Decision

Approve explicit one-click synchronization of all pending local content drafts,
followed by opening the selected production document. Always-on cross-environment
autosave remains a later opt-in, not an implied behavior of this first version.

## Follow-up: direct content publishing

September 12 decision update: Ani explicitly switched the plan to direct content
publishing and requested alternative system designs. The direction is selected;
the specific storage, rendering and cross-environment draft design is still
under review. The handoff design above is retained as a fallback, rather than the
next implementation commitment.

Alternatives presented were database-backed runtime content, immutable content
snapshots, pre-rendered pages in object storage, and an external headless CMS.
The recommendation combines database-backed runtime content with immutable
revisions: retain existing Astro templates; use a dedicated published-content
store; upload media before transactional revision activation; retain history for
rollback; and make every public index consume the same published source.
Prefer fresh publication reads initially and cache immutable assets or
revision-specific output. Do not promise that stale HTML caches are updated
merely because the underlying storage write succeeded.

A shared authenticated private draft service could remove repeated local-to-prod
transfers. It requires explicit origin/session and conflict handling, durable
offline recovery, and no production database credentials in development clients.
This is proposed architecture, not an implemented integration.

Ani approved the handoff fallback and asked whether content can publish directly
without GitHub or CI/CD. This is technically possible through a different public
content architecture. Current apps/www is static and reads Git-backed content;
its generated pages cannot display a new remote revision by changing Admin alone.

A proposed future content-only path would store immutable published revisions
and media separately from private drafts, validate a selected revision, activate
it atomically, and invalidate relevant public caches. Public pages, indexes,
search, feeds, sitemap, visibility and SEO would all read the same published
revision source. App code would retain protected PR/build/deployment checks.
Publishing should normally become visible within seconds, not promise globally
instant propagation. One-click rollback would reactivate a prior published
revision. No CI bypass or production content mutation has been performed.

This requires a separately selected public-site migration and checked rollout;
it is not part of the current admin-only deployment. Handoff approval remains
valid if the current Git-backed publishing architecture is retained.

## Verified implementation gaps

- Existing crop originals remain stored, but parent/crop relationships exist only
  in transient UI state. Durable lineage metadata is new work; old relationships
  cannot be invented. Referenced historical assets can be retained as evidence.
- Import the current source as a new production revision and retain local
  history separately. There is no history-import endpoint; do not renumber local
  revisions as production revisions.
- There is no universal pending-draft export. Build an explicit content-only
  manifest and coordinate active tabs; persisted inventory cannot prove another
  tab has no unsaved buffer.
- Destination revision comparison alone is insufficient: validate the local Git
  base against production source before applying a handoff.
- Existing private storage configuration and production owner authentication
  must be verified before claiming sync is available.
