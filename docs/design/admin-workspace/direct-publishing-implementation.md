# Direct publishing implementation

Status: implementation and local QA in progress. Not deployed or activated.
Ani authorized implementation, QA and deployment on September 12, 2026.
Website remains the integration owner. No user draft has been published.

## Implemented boundaries

- A separate publication repository stores immutable source revisions, operation
  receipts and active pointers. Record and whole-inventory compare-and-swap
  checks protect both concurrent editing and cross-record references.
- The existing private SQLite draft object captures exact reviewed revisions
  without queuing Git publication jobs or alarms.
- Images are validated, copied to a private publication media store, and verified
  before activating the revision. Public media reads require a reference from an
  active visible publication.
- Runtime Astro routes overlay publications by record identity before visibility
  filtering. Hidden overrides suppress the old Git record. The same inventory
  feeds pages, indexes, search, sitemap and feeds. Configured storage failure
  fails closed rather than resurrecting an older public version.
- Local transfers use an exact-origin/window/nonce popup channel, existing owner
  authentication, same-origin CSRF and durable private import receipts. Stable
  operation IDs survive retry. Acknowledged publication advances the local base;
  later private typing stays intact. Ordinary transfer does not publish.
- The proposed D1 migration lane is separate from the existing private database.
  Schema, rerun preservation and release classification have local proofs.
  Public rendering must be ready before publication activation is permitted.

## Local evidence

- Shared repository: eight tests using real SQLite transactions.
- Publication service/API: exact revision, replay, media verification and stale
  pointer tests; private-object tests verify no Git jobs or alarms are created.
- Handoff: fifteen client/API tests and five real Worker SQLite tests reported
  by the owning agent. Mounted editor tests exercise review, duplicate publish
  protection, later typing and popup failure.
- Full admin Vitest run: 93 files, 549 tests passed in
  `/private/tmp/direct-admin-vitest.log`.
- Full `pnpm validate` passed in `/private/tmp/direct-validation.log` before the
  final isolated integration/projection additions. Subsequent targeted checks
  passed: four real DO/D1/R2 integration tests, twenty-one inventory/projection
  tests and eighteen mounted editor/API tests. Editorial TypeScript passed.
- Public built-worker tests reported by the owning agent verify nineteen
  baseline public pages, five published search records, private exclusions and
  redirects. Isolated local D1 fixtures verify a new article, hidden override,
  sanitized HTML, discovery updates and storage-failure 503 responses.
- Chrome DevTools browser page 3, isolated `direct-publishing-qa` context:
  synthetic local review renders with no horizontal overflow. With popup opening
  deliberately blocked, a native click on Open production editor reports the
  recoverable error and retains the draft. The original browser function was
  restored afterward. This is not a production transfer or authenticated popup
  acceptance receipt.
- Managed `localhost:4311` preview remains running, PID 22426 at the last check.

The final projection audit caught and fixed a stale private-base comparison:
unchanged published drafts no longer show Changes pending, while newer typing
still does. Runtime source bytes stay on the server and are not included in
catalog or search props.

Final configuration check: selecting direct publishing with a missing database,
media or private draft binding returns unavailable rather than falling back to
the Git publisher. All nine direct API tests passed after this guard. The final
admin Astro check reported zero errors; editorial TypeScript completed as well.

September 12 release-preparation follow-up: refreshed the admin source ledger.
Seventeen changed hashes invalidate prior exact-source reviews, and seventeen
new publishing files are explicitly pending final source review. Prior receipts
are retained as history, not current acceptance. Current working-tree deployment
classification selects only `www` and `admin`; `ingest`, `newsletter`, `state`
and `weekly_email` are excluded. This is local classification, not a deployed
workflow receipt. Recompute against the eventual immutable PR head.

Final recovery audit found three issues and reopened acceptance: observing a
payload promise after popup failure, bounding receiver CSRF/transfer lifetime,
and tying local publication acknowledgment to its exact originating revision.
The revision fix passes five real draft-object tests and five API tests,
including delayed A-to-B-to-A acknowledgment ordering. The mounted editor tests
confirm the local revision is carried after saving. The sign-in return link now
preserves a valid handoff fragment only for the same-origin transfer route;
Chrome DevTools verified that link and an ordinary Content return link locally.
This does not prove production authentication. The post-fix Astro check reports
zero errors and zero warnings.

All three recovery fixes are now implemented. Final combined client/API/mounted
editor run passed 23 tests across four files. Receiver requests share a bounded
deadline; expiration prevents subsequent requests, while an already-accepted
publication remains an uncertain outcome reconciled by the durable operation ID.
No production write was used to test these changes.

September 12, 12:35 UTC: production admin build passed after all recovery and
sign-in fragment changes (`/private/tmp/direct-recovery-admin-build.log`).
This confirms compilation and packaging, not authenticated production transfer.
Life's compact task snapshot confirms its changes remain reconciled and its
visual acceptance awaits the Website integration release. No peer was restarted.

## Provider blockers

The existing value-silent Cloudflare credential successfully listed D1 metadata.
Creation of `anipotts-content` was rejected because account
`0f856093bdcd34a7da1bde5ee4385163` has reached its database-count limit. No database
was created or deleted. Listing R2 buckets with that credential returned
authentication error 10000; R2 permission/configuration is not verified.

Ani has been asked to choose between retaining the dedicated D1 design and
resolving its capacity, or using an isolated SQLite Durable Object instead.
Do not change billing, credentials, access or delete another database to bypass
these blockers. Production bindings and migration activation remain pending.

## Remaining acceptance

- Repeat affected release checks after production configuration is resolved.
  Local validation, route classification and runtime serving assertions passed.
- Resolve the storage choice, verify exact production resources and configuration,
  and run the reviewed migration before dependent consumers.
- Exercise the actual authenticated cross-origin popup, images, interrupted
  transfer/retry, continued local editing after publication acknowledgment and
  rollback using recoverable synthetic fixtures outside public production content.
- Complete protected exact-head PR checks, inspect all deployment targets and
  verify live interactions. No PR, release SHA or deployment is claimed here.
