# Site release review: engineer with taste

## September 8 recovered Browser follow-through

Native fork `01a0837d-8547-7e33-a34d-2c7ba78b8036` owns publishing continuation. The in-app Browser works in this task. Ani's table feedback is applied consistently to editorial headers and cells: horizontal padding increases from 8px to the 12px spacing token, preserving row height. Browser measurement and visual review confirm the change without horizontal page overflow.

Browser QA exposed stale optimized dependencies returning HTTP 504 and preventing editor hydration. The managed preview now uses an isolated development cache; the editor remains usable after a production build and type checks. Private autosave, a two-tab revision conflict, use-saved recovery, history restore and actual home preview passed. The original subheading was restored exactly and verified after reload. No test text was published.

Release review fixes restore a bounded newsletter-table probe in public health and require database readiness in www smoke. Verified Access owner assertions also permit read-only access to retained dashboards and read APIs without a legacy login cookie; existing mutation gates remain in place. Owner boundary smoke includes inbox, proof, deploys and control-plane reads.

The dedicated GitHub App form is prepared with the reviewed repository permissions. Creation, installation, keys and Cloudflare Access verification remain activation steps; no operational publishing receipt is claimed by this local/browser evidence.

## September 8 website task succession

Ani authorized task `01a08347-87d8-7341-806e-f0ad7f9baffb` (`website successor`) to continue the failed `website` task `01a026ea-1eee-7d11-a9cf-5a7f8a518644`. The source transcript and its compacted user requests were recovered read-only. The original task remains preserved: its paginated history expects inherited ordinal 518, while resume recognizes a final durable ordinal of 517. No runtime database or transcript was edited.

Current ownership: this successor owns the existing dirty `codex/editorial-site-simplification` checkout and admin publishing work. `Refine systems page mobile layout` retains the public design work in `/private/tmp/anipotts-shared-card-release` on `codex/writing-work-editorial`. That task is also hiding options-pricing-sensitivity at Ani's request; regenerate content projections from the merged content when integrating, preserving its design and content changes.

Recovered priority: make home-subheading editing, private autosave/recovery, actual-page preview and protected publication work end to end, then extend the workflow. Work/writing title and subtitle editing also remain requested. Operational extraction remains paused. Keep the managed preview running at `http://localhost:4311/`.

Current implementation now connects private draft storage, same-origin/CSRF APIs, immutable publication snapshots, signed Git commits, protected exact-head native merge, deployment tracking, and live release/source verification. Publication alarms persist checkpoints and recover after eviction; rejected work can be stopped without losing drafts, and a merge racing with a stop continues through release verification. Unchanged Git source is rejected before queueing.

The successor integrated current main at `adb74ec`, preserving the deployed public cards, identity links and Safari theme fixes. Generated public projections are build outputs so one canonical Markdown publication does not need generated-file edits. The paused newsletter delivery extraction is excluded from this release and remains recoverable at `49e7526`. The separate public design checkpoint `0315960` remains held for Ani's review.

Verification: 207 admin tests and 73 real Workers tests pass, including persistence after eviction, conflicting saves, source disclosure, provider identity, lost responses, native merge gates, cancellation races and release verification. Both apps pass type checking. Repository CI invariants, formatting, all workspace builds, lint, type checking and tests passed after newsletter scope separation. Generated Cloudflare declaration formatting is excluded because Wrangler owns those files. Managed local preview and its existing private home draft are preserved. No fresh Browser QA or owner-authenticated production proof is claimed.

Production publishing remains disabled pending the exact provider setup and owner workflow review in [editorial publishing activation](editorial-publishing-activation.md). The two publisher secrets and trusted public key are absent, no dedicated repository installation has been verified, and the editorial release gate remains held. No provider authentication policy, secret or production deployment was changed. Historical sections below describe earlier implementation checkpoints and are superseded by this status.

## September 8 private work and writing editor

Added protected-base CI verification for deterministic publisher branches. The verifier reads an RSA-signed JSON publication envelope, pins repository/operation/revision/base, allows one canonical Markdown file plus the manifest, and compares exact Git blob bytes/mode. Verification code and the public key are read from protected base, never the PR. Four tests pass through `pnpm test:workflows`, including a real temporary Git repository, changed content, substituted signing key, unexpected commits/files and unsafe paths. Synthetic compact-JWT formatting initially triggered the machine secret scanner; structured JSON signature fields pass with hooks intact. This is not activated: `.github/editorial-publisher.pem` is not provisioned, and server signing/atomic manifest commit wiring remain required. No production credential or provider policy changed.

Publishing checks now re-read the recorded PR by number and verify node identity, same-repository branch, exact head and receipt marker. An open PR's speculative merge SHA is ignored; a confirmed merge must have consistent closed/merged metadata and a real SHA. The durable stage waits on pending checks, blocks failed checks or closed-unmerged PRs, and records confirmed merges for deployment tracking. Successful checks alone remain blocked at `native_merge_not_configured`. Workers suite: 59 passing; editorial TypeScript and diff whitespace checks: passing. No GitHub mutations or production activation occurred.

Home preview now ensures an initial private revision even if the text has not changed, using the existing serialized autosave/idempotency path. Selecting the preview tab opens the saved actual-page preview directly. Five autosave tests pass, including unchanged-source lost-response retry and conflict refusal; Astro check reports zero errors and one existing beforeunload compatibility hint. Browser verified the home preview renders and selecting the tab alone loads revision 4, with no console errors during the preview check. No public copy or production deployment changed. The preview health probe succeeds with local process/network access and identifies an existing running service; no listener was stopped or replaced.

The store now exposes record-scoped publication status and version-checked retry RPCs. Retry arms a durable alarm before removing a hold, then atomically rechecks the version. A real Workers test races two retries, rejects a different record, evicts the object, runs its alarm, and proves subsequent draft edits did not alter the publication. Workers suite: 57 passing; editorial TypeScript: passing. The alarm still stops at `publisher_not_configured`; authenticated HTTP controls and provider execution remain incomplete.

Blocked-job retry now requires the exact stored job version and preserves its phase, provider checkpoints, attempt history and queue position. A Workers storage test evicts the object, resumes the same checkpoint, and rejects duplicate/stale retries and retry during active execution. Workers suite: 56 passing; editorial TypeScript and diff whitespace checks: passing. This is the coordinator operation only; authenticated retry API/alarm wiring and production activation remain unfinished.

Exact-head required-check evaluation now uses app-bound check identities, validates returned head SHAs, considers the newest attempt, and distinguishes pending, failed and passed. Skipped/neutral jobs never qualify as full validation; incomplete result inventories fail closed. Workers suite: 55 passing; editorial TypeScript: passing. This read-side evaluator is not yet a native auto-merge integration. Publication-manifest CI enforcement and merge/deployment stages remain required.

Joined the content preflight and live protection reader to checkpointed validate/commit/branch/PR stage execution. Each stage checks provider protections; validate and commit also require an explicit matching release-readiness result. Tests advance the immutable home edit through synthetic commit/branch/PR calls and prove a release hold prevents writes. Workers suite: 51 passing; editorial TypeScript: passing. Production alarms remain on the unconfigured gate: the real readiness verifier and checks/merge/deploy/verification stages are not yet connected. No real GitHub writes were made by these tests.

Added a live provider-protection reader for the publisher. It checks the exact repository/default branch, native squash auto-merge and branch deletion settings, strict app-bound required checks, admin enforcement, conversations and force-push/deletion protection, plus active branch-applicable PR rulesets with no bypass actors. Paginated/incomplete rule reads fail closed. Workers tests cover weakened enforcement, missing/spoofable checks, bypass grants, disabled rules and changed repository identity: 50 Workers tests and editorial TypeScript pass. Runtime write stages still need to invoke this guard; no policy mutations or production editor writes occurred.

The publisher preflight now joins pinned base/conflict inspection, complete Git inventory reads and shared content validation. It overlays only the frozen record, reads other content with bounded concurrency/memory, and rejects inconsistent inventory/base objects before any write capability is involved. Real canonical Markdown fixtures run through this composition in Workers: 47 Workers tests and editorial TypeScript pass. Live protection re-read confirms strict required GitHub Actions checks (Build/lint/typecheck/test and Security Review, app 15368), admin enforcement, conversation resolution, no force pushes/deletions, and active main ruleset 21578155 with required PRs and no bypass actors. Full runtime readiness enforcement, provider-stage wiring and production proof remain unfinished.

Pinned Git content inventory and source retrieval are implemented. Inventory reads reject truncation, unknown active content paths and non-regular records; source reads validate declared size, encoding, UTF-8 and the exact Git blob hash, preserving BOM and newline bytes. No provider download URLs are followed. Workers suite: 44 passing; editorial TypeScript: passing. These readers still require connection to the snapshot validator and durable provider stages before enabling Publish.

Added shared complete-inventory validation for the publisher's proposed snapshot: per-record parsing/schema checks, required pages, duplicate identities/slugs, cross-record writing references, homepage publication safety, and work route consistency. Canonical-content tests include a one-field home edit, missing/duplicate records, malformed drafts, missing featured essays, hidden homepage work and route mismatch. Editorial content suite: 41 passing; content typecheck: passing. The retained retired newsletter-archive file is explicitly outside the active inventory. This validator is not yet wired to runtime Git inventory loading; unsafe-link/media checks and full provider-stage integration remain required before publication activation.

Durable alarm execution is connected to the private publication queue. `startPublication` arms a wake before freezing; the alarm claims one leased stage, persists a recovery wake before external I/O, preserves provider backoff, and stops on sanitized authorization/integrity failures. Tests execute the actual alarm after eviction, deduplicate a concurrent delivery, verify the recovery alarm exists before provider work, and preserve backoff across eviction. Workers suite: 41 passing; editorial TypeScript: passing. The production step deliberately blocks with `publisher_not_configured`; full validation/provider transitions are still unwired, so this proves alarm infrastructure rather than operational publishing.

The Git adapter now resolves main once and follows immutable commit/tree IDs to the server-mapped record. It supports resuming a pinned commit, traverses non-recursive trees, bounds response bytes, and rejects truncated inventories, substituted objects, duplicate entries and symlinked parent directories. Tests distinguish missing records from incomplete responses and feed the inspected base into conflict planning. Workers suite: 38 passing; editorial TypeScript: passing. This is controlled-provider evidence, not a live GitHub App integration or enabled publication runner.

Server GitHub App authentication now signs short-lived RS256 JWTs and requests a single-repository installation token with explicit publisher permissions. It accepts GitHub RSA PEM and PKCS8 keys, rejects expired/foreign/excessive grants, bounds provider responses, and preserves sanitized authentication/rate-limit failures through the repository adapter. Synthetic signing and provider-contract tests run in Workers; 34 tests and the editorial TypeScript check pass. No real App credentials were read or created, no token was minted against GitHub, and no production write path is enabled. Durable runner, complete snapshot/readiness validation, protected auto-merge and deployment verification still require integration and live proof.

Draft loading regression fixed: local base lookup no longer invokes Apple Git on every request. It reads HEAD, linked-worktree common metadata and packed references directly; five filesystem regression tests pass, including recovery after temporarily missing metadata and rejection of corrupt loose references instead of stale packed values. Browser rechecked `/content/projects/claude-code-tips`: editable fields, saved state and history load, with the record API returning 200 after prior 503s. The editor was left on edit. No drafts were removed. Apple Git also became available after Ani accepted the separate host agreement. The combined metadata/autosave suite passes eight tests and the real Workers suite passes 30; the latter required loopback permission after the sandbox denied its local listener. Publishing remains disabled pending provider integration and production proof.

Publication jobs now persist phase, checkpoint, attempts, backoff and optimistic leases in the same SQLite object, enqueued atomically with the frozen receipt. Real Workers tests evict the object, reclaim an expired lease, reject stale completion, keep later publications from overtaking, and reject a jump to live. The Workers suite passes 30 tests. Alarm execution and provider-stage integration remain outstanding; these queue tests do not prove browser-independent publishing yet.

PR adapter follow-up: same-repository non-draft PR creation now reconciles all existing PR states before writing. A lost creation response reuses the existing PR; closed candidates are not reopened. Changed heads, foreign repositories, missing publication receipts and duplicate candidates fail closed. The Workers suite passes 28 tests. This remains a controlled-transport test, not a real synthetic PR or production publishing proof. The goal control still reports paused and Apple Git remains unavailable pending the host Xcode license agreement; no agreement was accepted by this task.

The restricted GitHub adapter now creates deterministic trees/commits and reconciles deterministic branch creation. Controlled transport tests cover lost commit/ref responses, identical retry payloads, changed branch rejection, rate limits, authentication failures and malformed provider responses. The Workers suite passes 25 tests. No production GitHub App token is connected, no editor publication has been sent, and the durable coordinator/PR/deployment stages remain unfinished.

Publishing foundation follow-up: the same SQLite object now freezes an immutable, private per-record publication receipt. Concurrent requests for one revision deduplicate, retried operation IDs cannot be repurposed, and later edits cannot alter the authorized source. Malformed, discarded, and stale drafts are rejected. A pure Git preparation check preserves newer unrelated main changes and rejects overlapping edits, removed/renamed records, symlinks, and path substitution. These are internal building blocks only: no publish HTTP endpoint, GitHub write, alarm runner, or production activation is claimed by this addition.

Extended the home editor's revision-safe private storage to server-validated work and writing identities. Work exposes title, subtitle, card copy, and description; writing exposes title and summary as subtitle. Source and history remain available. Archived status, visibility, publication dates, body, and slugs are preserved by field edits.

Verification: 13 real Workers SQLite/API tests passed, including cross-record isolation and traversal rejection. All 37 content fidelity tests passed, now checking subtitle edits preserve lifecycle fields and body across actual records. Admin build passed without Miniflare/esbuild in the worker output. Astro check reported zero errors and one existing beforeunload deprecation hint. Browser verified archived chainedchat subtitle autosave and reload recovery; the private test edit was restored to its original wording. Writing title/subtitle controls loaded, and dark theme was exercised. The requested mobile emulation did not change the inspected tab's 1280px width, so mobile QA is not claimed. Viewport control was reset.

This is local-only editing, not operational publishing. Production API writes remain closed; Publish remains disabled. Work/writing actual-page previews, GitHub App authorization, durable publication jobs, protected merge/deploy integration, and real production proof remain outstanding. Canonical home, chainedchat, and awareness-is-alpha files were unchanged by browser QA. Managed preview stays running.

## September 8 search and section controls

Local admin follow-up: view site now uses a native new-tab anchor with noopener/noreferrer, preserving its environment-local themed URL. The shared search field uses Astryx's leading search icon. All-page records expose their section through compact tokens; obvious same-name landing labels are not repeated. One Astryx MultiSelector provides checkbox section filters without restoring a tree. Selection combines with search, and empty-result reset restores every section.

Verification: 17 component/theme tests, Astro check (122 files, no diagnostics), admin build and generated-theme check passed. Browser exercised work plus writing (20 records), search within those sections (one match), empty selection, reset (23 records), Escape focus restoration, and both themes at mobile/desktop sizes. The 319px dropdown has readable dark text on its light surface and 44px trigger/options; no document overflow. Reduced-motion transition is zero. The new-tab anchor attributes and retained admin URL were verified; the Browser tab inventory did not expose a new target tab after the click, so destination-tab creation is not claimed as browser proof. Console inspection returned no warnings/errors. Normal viewport and original light preference restored. Preview remains running; production and public source are unchanged by this follow-up. Git-backed editing/publishing remains unfinished as detailed below.

## September 8 flat collection follow-up

This supersedes the collection hierarchy described below. Ani requested flat results, including all pages. Removed TreeList composition and nested catalog data; all pages now lists the same 23 records in one searchable Astryx table. Systems remains a dedicated tab. Newest-first ordering is retained without explanatory recency text.

Filters and the right-aligned record count share a row. Tables have a readable last-updated column with semantic dates and detailed tooltips. Below 481px, status appears beneath the title instead of in a separate column. Below 641px, header links use labeled, tooltip-equipped icons with 44px targets, keeping the header on one row; content gutters are 8px. Public appearance, content, publication states and authentication are unchanged.

Local verification: 11 focused component tests pass; Astro check reports zero errors, warnings or hints across 122 files; admin build and theme drift check pass. Browser checks covered search, hidden filtering, keyboard arrow selection, record navigation and return, systems navigation, both themes, and reduced motion. Dark-mode overflow checks passed at 319, 390, 480, 481, 640, 641, 759 and 1440px; light-mode checks passed at 319, 390, 481, 759 and 1440px. The 319px header is one 60px row. Browser console inspection returned no warnings or errors. Normal viewport and original light preference restored; managed preview remains running. No deployment or authenticated production proof is claimed. The broader editor/publisher and previously recorded full-validation failures remain outstanding.

## September 8 content hierarchy and Astryx usability pass

Local review only. Systems has a dedicated tab. Pages is the default expanded tree, with projects beneath work and essays beneath writing. Search preserves matching records' ancestors. Each branch and its children sort newest-first using file-level Git history, with uncommitted development changes explicitly labeled as local edits. Publication dates are unchanged; unknown update dates are not invented. Private draft-store update times are not connected yet.

Astryx TabList owns collection navigation, SegmentedControl owns status filters, and TreeList owns the hierarchy and keyboard navigation. StatusDot/Token distinguish public and private states; update tooltips provide exact timestamps. Shared record details use named disclosures for workflow steps and tokens for short metadata lists. Systems and other published landing records have environment-local public links; hidden work, draft writing and the newsletter draft do not. Newsletter review uses the same update metadata. Mobile tabs and filters measure 44px high, with 36px desktop minimums centralized in the theme. No competing component catalog or fake loading skeleton was introduced.

Build metadata is a virtual module, not another checked-in content projection. Admin build-cache inputs now include canonical public/editorial Markdown and the metadata plugin. Turbo's dry-run confirms these actual inputs. The admin deploy checkout requests full history so a shallow clone cannot falsely label every record with the deployment commit's date. Runtime Git reads and content-only public deployment remain part of the unfinished publisher integration.

Verification on this pass:

- 37 focused component, theme and return-path tests pass, plus three metadata tests and the existing release-policy test suite. The Vitest include now covers `.test.tsx`; those component tests were previously omitted from ordinary runs.
- Astro check: 122 files, zero errors/warnings/hints. Admin build and generated-theme drift check pass. Full admin unit run: 192 passing, two inherited failures (inbox/root parity and deleted invitation route). Neither was suppressed.
- `pnpm check:changed --working-tree` invokes full validation for the accumulated checkout and still stops at the previously recorded `scripts/ci/navigation.test.mjs:122` light/dark expectation. This pass is not a full-release validation receipt.
- Browser-only QA: page identity and meaningful rendered content; systems tab to review and back; nested search; arrow-key tree collapse; writing draft and work hidden filters; hidden-record review without a public-page link. Light hierarchy and dark work table have no document overflow at 319, 390, 768, 879, 880, 907 and 1440px. Screenshots inspected at mobile and desktop. Reduced-motion emulation confirmed zero tab transitions; emulation was cleared and the normal viewport and original light preference restored.
- One transient hydration fetch error occurred while the development server/modules restarted. Subsequent navigation and interaction checks had no new console warning/error events. This is local preview proof, not authenticated Access or production proof.
- Managed preview remains available at `http://localhost:4311/content?group=pages`. No public-site source, credentials, production resources or deployments were changed by this UI pass.

Next implementation remains: authenticated draft APIs and storage wiring; CodeMirror/forms and real-page preview; company/media/settings management; then durable GitHub publication, protected release verification and recovery. The editor/publisher is not operational yet.

## September 8 Git-backed editor implementation

Ani approved the Git-backed editing/publishing plan. Operational extraction stays paused. Production activation still requires local workflow review and the exact provider approvals; no GitHub App, secret, Access policy, production binding, database or deployment was changed in this slice.

Starting checkout: `codex/editorial-site-simplification` at `65254f396886bb1c8f18ca436f1c4370daf3f3c6`, with existing presentation/auth work preserved. Recovery copies of tracked changes and untracked files were captured in `/private/tmp/anipotts-editor-start.HIdwuT`. Existing worktrees were inventoried without removal. The separately owned public-site release is untouched.

Current implementation is a backend foundation, **not an operational editor or publisher**:

- Shared source parsing and single-field YAML updates preserve unchanged bytes, comments, quotes, dates, CRLF and Markdown bodies. Record IDs map to server-owned paths. Duplicate YAML keys, aliases, custom tags, unsafe IDs and oversized sources are rejected. Existing canonical schemas validate publishable source; raw invalid source remains eligible for private draft storage.
- A local-tested SQLite Durable Object supports revision-checked saves, idempotent retry receipts, retained conflict sources, bounded revisions, recoverable discard and restore. No production namespace is bound yet. Real Workers tests cover competing saves and persistence after actual object eviction.
- Request-security helpers provide same-origin/CSRF checks, bounded streaming JSON reads and private response headers. They do not replace Access verification, and are not yet wired to write routes.
- Workers typechecking is isolated from Astro's browser globals. Generated runtime types stay ignored and are regenerated by the typecheck command. Tests run with the current Cloudflare Vitest integration, not an in-memory storage mock.

Verified locally: 72 content tests, 24 Access/request-security tests, eight Workers SQLite tests, and the admin build/theme check. Full baseline validation stops at the pre-existing `scripts/ci/navigation.test.mjs:122` expectation (`light` versus `dark`) on Node 24.19.0; that failure is not waived. The wider admin unit run has 175 passing tests and two inherited failures: the former inbox/root parity assertion and an invitation test reading an already-deleted route. These need successor-behavior checks during the Access cutover rather than suppression. Final full validation remains required. The managed preview remains running at `http://localhost:4311/` (verified with the manager).

Remaining implementation: authenticated API integration and local storage wiring; CodeMirror/forms, actual-page preview and history; company/media/settings catalogs and private image staging; durable publication coordination, GitHub App operations and release verification; recovery snapshots; full UI and production acceptance. No publish control should claim readiness from these foundation checks.

## September 8 editorial architecture execution

### Local Astryx review focus (supersedes broader execution until reviewed)

Follow-up boundary pass: removed a duplicated missing-record heading and corrected missing newsletter drafts to return to `/newsletter`. Supplementary details now omit duplicated titles, slugs, body copy and absent fields; newsletter subjects appear separately only when different from the title. Browser verified a genuine 404 for a missing draft, one heading and a working return link. A writing preview retained its full body with JavaScript disabled; scripting was restored afterward. The compact details disclosure then opened with only publication date, tags and type, without console warning/error events or hydration exceptions. Seven editorial component tests and the admin typecheck/build/theme-drift check pass on this follow-up tree. Production and broad extraction remain paused.

Operational extraction and the wider cleanup are paused at Ani's request. Current work is the local Astryx editorial interface; no production promotion or authentication cutover has occurred.

Scrolling review exposed transparent sticky navigation over the white article card. The Astryx theme now gives TopNav the opaque page-background token; Browser confirmed the light header resolves to `rgb(97, 171, 234)` and masks underlying article text while scrolling. This is a centralized theme override, with regenerated CLI outputs.

- Astryx core, CLI and neutral base are aligned at 0.4.6. CLI-generated admin agent instructions and the custom editorial theme are installed. `astryx doctor` reports six passes, zero warnings and zero failures. Admin builds now check generated-theme drift before building. The Instrument Sans font is self-hosted through the layout import.
- One React region per editorial page uses Astryx navigation, buttons, searchable tables, status tokens, cards, disclosures and empty states. Removed the superseded hand-styled editorial field component and catalog styles. Broader legacy operational routes are unchanged during this paused lane.
- The latest requested theme control is one icon button cycling light, dark and system, with a tooltip and accessible action label. Light-mode text is white on blue; white cards and tables have dark text. The choices persist in this browser, with environment-local site/review links and theme transfer across localhost and the local www hostname. Server rendering now honors the incoming preference before hydration.
- Newsletter archive is absent from active admin collections and public routes. The newsletter landing record is a draft and has no public page. Old archive source/default compatibility remains pending the paused content cleanup; newsletter service and stored data are untouched.
- Confirmed integration fixes: Astro 5 requires the compatible React integration 4.x rather than the installed 6.x/Vite 8 integration; empty Astro slots must not be passed to React on pages without a body, preventing newsletter-preview hydration mismatches. Table columns now have explicit proportional title and fixed status widths.
- Local proof: admin typecheck, admin build/theme drift check, www build/public-output checks, and 47 focused UI/theme/return-path/identity tests pass. Public output contains 20 pages and five search records with private exclusions. Browser checked catalog overflow at 319, 390, 768, 879, 880, 907 and 1440px in both themes, the single theme cycle, writing preview/disclosures, newsletter preview, keyboard focus, reduced motion and an actual admin-to-www-to-admin theme round trip. The 319px theme target is 44 by 44px. A fresh newsletter navigation after the empty-slot fix produced no hydration exceptions or warning/error console events.
- Viewport and media overrides were restored. Managed preview remains running at `http://localhost:4311/` (PID 19225). No merge, deploy, Access-policy change, database write or email send occurred. Authenticated production Access verification and the complete final release QA matrix remain outstanding.

Latest sign-in refinement: Ani requested removing the visible button entirely. The centered AP logo is now the sole 128px link target, with an accessible name, native tooltip, visible keyboard focus, shared hover separation and static reduced-motion behavior. No visible sign-in/preview copy remains. The same-environment destination fix remains intact.

Sign-in presentation and environment correction: `/auth` is now a standalone centered AP mark and single control, without editorial navigation or explanatory copy. WWW and admin consume the same brand component; keyboard focus separates the AP mark and reduced motion disables that movement. Browser proved one link, no header, no overflow and keyboard focus at 759px. Both app typechecks passed after sharing the component. The original production-absolute sign-in link was a confirmed bug: it sent localhost users into the still-deployed legacy production passkey flow. Sign-in destinations now remain relative, preserve approved editorial paths and queries, and reject external/auth/API destinations. All 21 return-path tests and 16 signed-identity tests pass. Browser followed `/auth?next=%2Fnewsletter` to `http://localhost:4311/newsletter`. Local preview is labeled `open preview`, not represented as an authenticated Access session. A real local Access test still requires a separately protected preview hostname/tunnel; no DNS, Access policy, or production authentication was changed. Ani's production sign-in tab was left untouched while subsequent QA used tab 4.

The approved target supersedes the earlier cleanup scope: a static editorial website, an Access-authenticated read-only editorial admin, and the existing newsletter worker. Operational APIs, workers, runner, and database migration ownership move to the existing private System project. Production data and private stored drafts remain untouched.

Execution starts at clean main `7fe5074af292517e1470f51cdeb0f2cadc59f31d` on `codex/editorial-site-simplification`. The replacement execution goal is active. Existing recovery refs and worktree dispositions below remain in force; running previews are preserved.

Baseline: full `pnpm validate` passed before restructuring. The first sandboxed attempt stopped at Wrangler's local server/log permissions; the same suite passed with the required local execution permission. This was an environment restriction, not an application test failure.

Current slice: landing pages read validated Markdown through Astro collections; detail pages, newsletter landing/archive, RSS and sitemap render at build time. Native collection entries replace duplicate wrapper objects. A build-produced published search index serves the existing search API. Cross-record validation rejects duplicate slugs, unknown project references and unpublished homepage selections. Page schemas reject missing fields and unknown provider IDs.

Confirmed regression caught during local built-worker QA: `run_worker_first` plus the on-demand catch-all returned 404 for existing prebuilt detail pages. Runtime routing now consults the assets binding after legacy redirects; build-time rendering bypasses that serving boundary. Query-preserving redirects and genuine missing-record 404s remain acceptance checks.

First-slice verification: full `pnpm validate` passed after the changes. Built-output tests prove 22 editorial pages, five published search records, private-record exclusion, served detail pages, genuine 404s and query-preserving legacy redirects. Browser checks on systems covered the seven requested widths in both themes with no document overflow or broken images; navigation between work and writing passed without console errors. Browser viewport and media overrides were restored. Newsletter-host routing and the full final interaction matrix still require dedicated verification.

Newsletter isolation is implemented locally. The public worker forwards the existing API URLs to the named private `NewsletterApi` service entrypoint; D1, queue and mail configuration belong to the existing newsletter worker. The queue consumer identity is unchanged. Public health now reports build identity without a database probe. Newsletter deployment precedes a dependent public deployment, and public-only releases still permit a skipped newsletter target.

Confirmed newsletter findings fixed during extraction: expired/malformed token dates fail closed; unsubscribe retains a prior complaint/suppression; signed webhook timestamps enforce the provider's five-minute replay window; a missing email transport retries instead of acknowledging a mocked delivery. Local built-worker tests also caught Astro's blanket origin check blocking one-click requests and request streams outliving early service responses. Endpoint-specific origin/signature/token protections now own the public POST boundary, and the forwarding body is bounded to 1 MiB and fully read before transfer.

Newsletter verification: full `pnpm validate` passed on the local isolation tree, with real in-memory SQLite tests for confirmation, expiry/reuse, unsubscribe and suppression, isolated mail-transport retry tests, raw webhook forwarding and signature/replay checks. A local Wrangler pair proved the private service binding, both subscribe URLs rejecting foreign origins, missing-token confirmation, one-click-compatible unsubscribe, unconfigured webhook denial and static public availability. These checks sent no real email and created no production subscriptions. The worker dry-run compiled successfully; its first attempt emitted a sandbox log-permission warning.

Not released: generated projections and legacy admin consumers remain until their replacement is complete. Operations extraction, Access cutover, dependency/build cleanup, exact-head CI and production proof are still pending. No provider authentication, secrets, bindings, database contents, or release ownership have been changed. Binding/secret cutover requires exact native approval before deployment.

System extraction is staged separately in `/private/tmp/anipotts-system-extraction.3SiFfo` on `codex/pro/editorial-operations-extraction`, based on System main `a17c977a02aaab09f6e12edfbf0aeb9496f01773`. The primary System checkout's seven pre-existing generated modifications are untouched. Worker source, contracts and migration history have been copied for verification; website copies and deployment ownership remain until the extracted services pass their checks and cutover is ready.

Access authority: on September 8 Ani confirmed `hello@anipotts.com` as the canonical sole owner and explicitly approved the Access-only admin cutover. This authorizes the planned owner-only replacement, not deletion of stored auth records or unrelated policy changes. The exact provider effect still passes the native approval boundary when ready. Existing authentication remains active until the replacement is verified.

The replacement Access verifier currently passes 16 local tests with real RSA signatures and a local JWKS. Tests cover exact owner acceptance and rejection of spoofed email headers, forged signatures, expired/missing expiry, wrong issuer/audience/owner, service identities, future validity, missing configuration and unavailable signing keys. It is not wired into the current admin middleware yet and is not production proof. Read-only provider inspection returned no account-scoped Access apps and denied zone-scoped Access inspection (403); the actual policy still needs verification before cutover.

Editorial admin implementation now reads all public records through Astro collections and four newsletter drafts through private Markdown. A field-for-field comparison verified the newsletter conversion without copy changes. The content index, record previews and newsletter review use a plain Astro layout. Ani explicitly rejected self-narrating interface copy: keep navigation, titles, content and necessary controls; omit architectural explanations, instructional footers and preview badges. The new shared layout follows that direction. Browser verified content-to-draft navigation, newsletter navigation and the stripped-down sign-in screen; current admin typecheck passes. Final responsive/authentication QA is pending.

Custom passkey/password, phone, invitation, recovery and machine-token provisioning routes have been removed locally. The legacy session middleware and operational consumers are still being extracted; this intermediate tree is not a deployable auth cutover. Stored auth records are unchanged. The managed local preview is running at `http://localhost:4311/`; a sandboxed health probe incorrectly reported it stopped, and an unsandboxed probe confirmed the live managed process. Browser tab 3 is the active review tab after tab 1 became stuck on a connection-error page.

## September 8 cleanup execution

Status: cleanup merged through protected PR [#308](https://github.com/anipotts/anipotts.com/pull/308) and verified in production. Release SHA: `7dc131d19706569e545f93f5a31ef8d4f405bb1f`. Admin promotion and two dirty historical worktree removals remain independently held as described below.

Starting release head: `98d2d8292c0bf95c1d66edfd605c8e4d14e365fa`.
The initial review scope includes 32 modified files, two untracked tests and 15 release-branch commits beyond main.
Tracked changes are recoverable through `refs/cleanup-recovery/site-2026-09-08` (`a50dcd541cd15d7ee8f4508efb3a8be42f88e90a`).
The initial untracked tests and ignored legacy build artifacts are preserved under `.local/cleanup-recovery/2026-09-08/`.
The pre-retirement source is retained at `refs/cleanup-recovery/admin-solid-2026-09-08`.

### Confirmed findings and dispositions

| Severity       | Location                                                                   | Failure or redundancy                                                                            | Disposition                                                                                               |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| P2             | `apps/www/src/pages/writing/[slug].astro`                                  | Unknown and draft article URLs redirected to a successful index instead of returning 404         | Uses the existing not-found component and real 404; detail rendering extracted without changing copy      |
| P2             | `apps/www/src/pages/api/subscribe.ts`                                      | Re-exported prerender flag was not recognized by Astro, causing the POST alias to be prerendered | Declares server rendering directly; retains the same handler                                              |
| P2             | `apps/www/src/layouts/Shell.astro`, `components/Nav.astro`                 | Blocked localStorage threw during theme initialization or toggle                                 | Theme applies even when persistence is unavailable                                                        |
| P2             | `scripts/ci/check-changed-scope.mjs`                                       | Local checks ignored staged, unstaged and untracked edits                                        | Explicit working-tree mode and real temporary-repository tests, including canceling staged/unstaged edits |
| P2             | `scripts/ci/brand-contract.test.mjs`                                       | Existing marquee tests were not invoked by the suite                                             | Wired into the brand contract                                                                             |
| P2             | `scripts/ci/public-app-boundary.test.mjs`                                  | Baseline validation required a retired fifth artwork layer                                       | Replaced with proportional-crop and decorative-accessibility checks                                       |
| Simplification | `apps/admin-solid` and deploy policy                                       | Unused rollback implementation retained a separate dependency/build/deploy surface               | Removed local source and target; regression check prevents their return; production resources untouched   |
| Simplification | `packages/lib/src/data`, CMS project/settings readers                      | Unused database-first public content with independent stale fallback copy                        | Removed readers, datasets and exports; active operational readers preserved                               |
| Simplification | Systems lifecycle/topology components, contracts and canonical fields      | Unrendered experiment data imposed validation and generated-data overhead                        | Removed executable experiments and their contracts; current workflow remains                              |
| Simplification | Public settings and provider registry                                      | Site metadata/social links and allowed provider IDs could drift between consumers                | Shared typed settings and approved provider registry                                                      |
| Simplification | Public frontmatter and route inventory                                     | Astro and generation accepted different shapes; smoke routes duplicated content records          | Shared canonical schemas and content-derived detail smoke routes                                          |
| Simplification | Generated projections and bootstrap script                                 | Unconsumed validation JSON, future D1 seed, and reverse-bootstrap mode                           | Removed; retain typed defaults and actual admin projection with drift checks                              |
| Simplification | Alternate public Markdown path, old Claude stats and unused grouping/types | No active consumer                                                                               | Removed; canonical Astro rendering and current data models remain                                         |

Additional confirmed findings from the final pass:

- P2, `apps/www/src/lib/api.ts`: a caller-controlled leftmost forwarding address could choose the newsletter rate-limit bucket, and database failures allowed the request through. The guard now uses Cloudflare's client identity and fails closed for missing/failed/malformed rate-limit reads. Reproduction failed before the patch and passed afterward. Tests exercise the real subscription handler and its legacy alias with an isolated outbound boundary, including success, 400, 403, 429 and 500 responses. Independent investigation and bypass review found no remaining scoped regression. No real subscription, queue message or database write was made.
- P2, `SystemMap.astro`, `AmbientFlow.astro`, `Footer.astro` and global styles: fractional viewport widths between 879 and 880 fell into neither responsive rule. Stacked styling now covers every width below 880; desktop starts at 880.
- P2, shared build scripts: content build/typecheck each invoked the types build, allowing concurrent deletion of the same output. Dependency builds now belong to Turbo's existing dependency graph; direct callers invoke that graph.
- Test repair, `operator-work.test.ts`: fixture preservation now hashes the actual exported payload rather than requiring a marker string in its implementation. Its digest matches the original release-head payload exactly: `6ed83aa1ef017c21a3bcb8afa8895f55de998e1bb937612579e43a8a54ba1255`.

Baseline `pnpm validate` stopped at the obsolete fifth-layer assertion. Full validation subsequently passed, as did working-tree scope validation, 133 admin tests, 38 shared-library tests and 32 content tests. The final guard/build-ordering tree passed another full `pnpm validate` run. A forced clean affected-build pass and exact committed-diff check follow the final documentation commit.

Browser-only QA covered home, work, writing and systems at 319, 390, 768, 879, 880, 907 and 1440 CSS pixels in both themes (56 checks), plus all 20 public index/detail routes at mobile and desktop widths. No document overflow, missing completed images or console errors were observed. Reduced-motion and JavaScript-disabled systems retain all four steps and 14 sources. At 319px with 200% root text, the return caption fits the arrow's height without overflow. Keyboard pause/resume, menu Escape/focus return and touch targets passed. Three consecutive AP-logo refresh checks kept the artwork separated with the pointer stationary over it. Browser emulation, text-size and media overrides were cleared; the tab was returned to the homepage in normal view, retaining the user's browser zoom.

Compatible `tar` resolution was patched to 7.5.22. The production dependency audit now reports zero critical, 25 high, 41 moderate and 12 low advisories. Existing framework/toolchain advisories remain a maintenance risk, not a claim of a vulnerability-free deployment; major upgrades were not folded into this cleanup.

Focused cleanup commits so far: `26a6b98` Solid retirement, `354eb51` unused services and admin fixture ownership, `92f37cc` canonical public content and reviewed presentation, `e16b8e3` working-tree validation and derived-output cleanup. These remove roughly 30,000 lines before the final guard/documentation pass.

### Recoverable worktree inventory

The primary checkout and running previews remain intact. The other four worktrees have been compared using ancestry and patch equivalence; none was merged wholesale.

| Worktree                                                | Disposition and recovery                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `26f0/anipotts-com` discovery                           | Unique rationale document retained at `refs/cleanup-recovery/discovery-2026-09-08`; old diagram decisions are superseded                                                                                                                       |
| `911c/anipotts-com` systems experiment                  | Committed base integrated; dirty tracked work at `refs/cleanup-recovery/systems-experiment-2026-09-08`; 19 untracked files in `.local/cleanup-recovery/2026-09-08/systems-experiment-untracked.tar.gz`                                         |
| `anipotts-com-public-site-review-batch-2026-08-28`      | Committed base integrated; older card/hero changes superseded by current components; tracked recovery at `refs/cleanup-recovery/card-review-2026-09-08`, untracked component in `card-review-untracked.tar.gz` beside the other recovery files |
| `anipotts-com-public-work-canonical-records-2026-08-26` | Record/artwork patches are equivalent to integrated changes; obsolete Portless-removal commit intentionally not merged; dirty work retained at `refs/cleanup-recovery/canonical-records-2026-09-08`                                            |

All archives were listed and checked. The inactive discovery worktree was removed after preserving its unique commit. The systems experiment has active preview and Claude processes and remains in place. The card-review and canonical-records worktrees have no processes with a working directory inside them, and their tracked diffs match their recovery snapshots exactly. Native policy blocked forced removal of the dirty card-review tree; no alternative deletion path was attempted. Both dirty historical directories remain preserved pending native approval. Canonical-records screenshots, preview metadata and local Miniflare database are also retained in `.local/cleanup-recovery/2026-09-08/canonical-records-local-state.tar.gz`.

Read-only production inspection found the current Astro admin worker `anipotts-admin`; its listed deployment uses version `a1825b84-b47b-4b5a-8a9b-7df8f32cccc3`. Probes of admin health, inbox, content and passkey routes redirect to Cloudflare Access. This proves the edge gate is still present, not authenticated app-native access. No auth, secret, production data or worker-resource mutation was made.

The four retained worker configs still declare a state domain/DO bindings, ingest cron, newsletter queue, and weekly cron. Their active operational roles are distinct from public rendering. Final provider and release-target evidence is still required.

### Protected release receipt

- Exact PR head: `27e2ac2b4176e0da781e174739c722ab8b5b72a2`; merged with the merge method so focused commits remain intact.
- [CI run](https://github.com/anipotts/anipotts.com/actions/runs/34202164227): classification and full build/lint/typecheck/test passed. [Security Review](https://github.com/anipotts/anipotts.com/actions/runs/34202164190) passed. PR was ready for review, not a draft with reduced checks.
- Live main protection was reread immediately before merge: required PR, strict exact-head checks from GitHub Actions, admin enforcement, no ruleset bypass actors, no force push or deletion, and no unresolved review threads.
- Final local `pnpm check:changed` passed on the committed release diff, as did `git diff --check` and forced clean affected builds. The merged tree is identical to the checked PR head.
- [Deployment run](https://github.com/anipotts/anipotts.com/actions/runs/34202417739) succeeded for www and state. Admin, ingest, newsletter and weekly email jobs were skipped. Classification recorded `d1_changed=false`; migration steps were skipped. No production database migration or auth/resource mutation occurred.
- Cloudflare versions: www `b041c404-eabf-467b-b966-d3375fc462fd`; state `ac4bd133-1368-4124-99e5-9b3ada408fc5`.
- Independent production smoke passed all 23 public routes. Public health reports the exact release SHA, database connected and schema `0043`; state health reports `ok: true`. Old work redirects preserve query strings; hidden and unknown work and the JPEGMAFIA draft return genuine 404s. Feed, sitemap and robots return 200. Cloudflare adds its existing managed content-signal block to robots while retaining the canonical sitemap and API exclusion.
- Production Browser checks at 319 and 1440px in both themes passed on all four shared pages after waiting for document readiness. One h1, no document overflow, no missing completed images and no production console errors were observed. The initial too-early samples were discarded and rerun after DOM readiness. Browser viewport overrides were reset and the tab left on the production homepage.
- Primary checkout returned to main. Previous known-good public release: `2451782dfe1599c642b1f75d39623e4ec9e592ce`; the deployment workflow captured the previous Cloudflare version before promotion for app-only rollback. Rollback was not needed.
- Switching through the old local main tree interrupted Astro's module graph during the shared-content rebuild. The final local check caught a 502; only the recognized broken www process was restarted through the existing manager, after which the same canonical URL returned 200. The shared proxy, managed admin fallback and active experimental preview were left untouched. The pre-existing stale admin Portless record remains separate from this public preview repair.

The checked release configuration holds authenticated admin smoke at `held_identity_required`; this is an external identity gate, not permission to weaken authentication. Shared changes classify www, admin and state, while removal of the legacy target alone does not deploy unrelated workers. Older checkpoints below describe earlier trees and must not be treated as proof for this cleanup.

### Admin release gate follow-up

Read-only checks confirmed that the three `ADMIN_CI_*` identity secrets are absent from both repository and Production-environment secret inventories. The continuation found an additional confirmed release bug: previous-version capture and the smoke health preflight made unauthenticated requests through Cloudflare Access. Health checks now use the configured read-only identity with redirects disabled, including rollback verification; negative route probes remain unauthenticated. A mocked Access-protected health response reproduced the missing header before the fix and passed afterward. Missing credentials still fail before any request, and redirected health responses are rejected. No credential, account, Access policy, production data or release gate was changed.

Updated: 2026-09-07. Owner: Ani, with Codex implementing the public-site lane.

## Release state

This is an internal editorial and release ledger, not published page copy. The release is **in review**, not deployed. The working branch is `codex/site-work-release-2026-09-07`, based on `2451782dfe1599c642b1f75d39623e4ec9e592ce`.

The direction is thoughtful systems and products, engineering depth demonstrated by the work, and Ani's own taste across technical and creative interests. Systems protect attention and preserve context. Personal integrations are not a launch prerequisite.

Engineering checkpoint: the final `pnpm check:changed` run passed for `33a8f5a`, including full workspace validation after the unavailable-source correction. `3711bfa` only normalizes Obsidian SVG line endings; its diff is empty when end-of-line whitespace is ignored, and the full branch passes `git diff --check`. The branch was pushed and its remote SHA verified. There is no PR, merge, or deployment yet. The public preview is running; the manager reports an unrelated stale admin process, which was left unchanged.

Substantive replacement copy needs section-by-section approval. Existing selections, publication dates, project IDs, hidden records, and draft state remain unchanged. No invented contributions, metrics, client permissions, or first-person anecdotes.

### Implemented commit groups

| Commit    | Scope                                                                                  | State                                                             |
| --------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `1da3954` | Mobile footer and page spacing                                                         | Preserved prior local edits; locally checked                      |
| `ce7f0d7` | Provider artwork, 14-source marquee, mobile steps and return caption                   | Preserved approved systems presentation; locally checked          |
| `2def063` | `/work` index/details, permanent redirects, navigation, metadata, shared compatibility | Implemented; legacy records and review IDs retained               |
| `b9f563f` | Canonical content build-cache inputs and RSS freshness                                 | Implemented; local feed and Turbo input inventory checked         |
| `e12239b` | Work section metadata and older shared-consumer tests                                  | Regression repair from full validation                            |
| `62b5e79` | Coding Agent Tips title, alt text, canonical repository link                           | Factual identity correction; existing slug and record ID retained |

The broad classifier selects `www`, `admin`, and `state` because shared types/configuration changed. Do not bypass that classification or describe the eventual release as www-only without an exact-tree deployment-plan review. There are no production database rewrites in this change. Generated seed files are projections, not evidence of a remote migration.

## First editorial batch: systems

Approval state: **current systems page accepted for production** in Ani's latest request to move on to writing/work subtext. This includes the subsequent exact closing-copy annotation. Retrieval-description, related-work, source-tray, and paragraph-spacing proposals are deferred optimizations, not systems editorial launch blockers. Technical release checks and the wider site review still apply; no deployment is recorded here.

### Rationale before the map

Previous:

> the map below shows my general process for keeping track of what i'm working towards

Approved replacement, split into short standalone paragraphs for scanning:

> over time i've built an intuition for how to approach things, but keeping up with information coming from every direction still takes attention.
>
> i use this system to piece together those everyday details, so i can put more thought into bigger questions about my future and decisions that need my judgment
>
> the map below is how i organize that, with context that persists and agents that carry work forward, leaving more room for work i care about, things i want to explore, and people i love

Provenance: Ani described delegating everyday information synthesis to preserve attention for deeper questions and consequential decisions, accepted the derived wording, then changed “the” to “my” before “future”. Approval covers this rationale only, not the next retrieval-description proposal or publication. No new site-wide editorial structure is inferred from the request for tweet-friendly formatting.

### Retrieve context

Current:

> i share the files, examples, and constraints that make the task specific

Proposed:

> my agents retrieve relevant context, and i add the details and permissions the task needs

This distinguishes retrieval from Ani's contribution. Tailscale is connectivity, 1Password is credentials, and Obsidian is knowledge; their presence does not grant blanket authority.

### Return caption and related work

Preserve exactly:

> we persist what we learn, and my agents carry that context into the next task

After the rationale is reviewed, add ordinary text links below the map: `coding agent tips` and `awareness is alpha`. Use the canonical existing `public_tools`/`featured_writing` content instead of another hardcoded card grid. The essay itself still needs its content review below. No links have been added as a substitute for that review.

## Editorial method

Current review anchor: homepage and shared work/writing summaries. The approved work hero remains “things i've built on my own and with teams, from early experiments to products people use”. Ani's later exact writing annotation is applied: “what i'm learning as i build systems using AI, and some of my thoughts on the things that hold my attention”.

### Homepage and summary voice pass, local review

Ani requested rewriting the pasted homepage and work-section copy in his voice, with lighter punctuation on short card/component subtext. Applied one candidate pass to the home introduction, all 11 public project card summaries and subtitles, the five published essay summaries, and the Coding Agent Tips callout. These shared canonical summaries also appear on the work/writing indexes and relevant detail-page headers. Full case studies, article bodies, titles, dates, links, ordering, statuses, the hidden project, and the draft essay are unchanged.

The introduction now starts “i build systems with AI and share what i'm learning along the way”. Artist-discovery work at Our Bad Habit is separated from real-time agent I/O at Structured AI instead of grouping them under the same technical role. This wording is based on the existing records and Ani's supplied context, not a fresh employment/affiliation verification. The established factual questions in the route ledger remain open.

Examples of the candidate pass:

- Quantercise: “quant interview practice with mental math and sandboxed Python execution.” → “a place to practice quant problems, work on mental math, and write Python”
- Coding Agent Tips: “practical patterns from running coding agents in real repositories.” → “my notes on working with coding agents, written while i'm figuring things out”
- Claude Code todo essay: “vague todos waste context. specific prompts let claude code start from the right file.” → “leaving enough detail in a todo for a coding agent to pick it up the next day”

No blanket punctuation transform was added to components. Short summaries are authored without final periods; normal sentence boundaries, proper names, prose, and accessible image descriptions keep their punctuation. Unsupported numerical teasers were omitted from the revised Quantercise and NYU subtitles; unresolved numbers in the full project records remain part of the later factual review. Candidate wording is available for Ani's local review, not recorded as accepted or published.

### Shared landscape implementation

September 8 follow-up supersedes the page-background portion below: Ani requested restoring the previous root-page background. `PageCurrent.astro` is restored byte-for-byte to its pre-landscape version, including original light/dark opacity and reduced-motion fallback. Component artwork remains intact. The mobile header now has a compact grid, aligned 44px controls, 52px menu links, active-page/tap feedback, and visible focus. Escape closes the menu and returns focus; outside clicks and breakpoint changes close it as well.

The AP logo preserves fine-pointer hover across full-document home navigation and reload using a consumed, short-lived session hint applied before paint. It clears on departure, ignores old/out-of-bounds/different-viewport hints, and tolerates unavailable storage. Browser sampling found all first 24 animation frames separated after both click navigation and reload; pointer departure closes it. Unit regression coverage includes persistence, expiry, touch exclusion, and storage failure. Five widths (319, 390, 720, 721, 1440), both themes, showed no document overflow and the original background opacity. Separate Playwright was used because the in-app Browser tool is unavailable. Typecheck and brand/navigation tests passed; no deployment occurred.

Implemented the requested continuous landscape using one three-path artwork family with proportional SVG cropping. Page-edge curves use separate light/dark opacity levels, increased slightly at Ani's request. Screenshot frames use stronger crops; writing and compact work cards use a fading edge contour. Desktop hover/focus shifts only artwork by 4px. Mobile, coarse pointers, and reduced motion use two static layers. Keyboard focus and mobile tap feedback remain visible.

Ani explicitly authorized separate Playwright QA when the in-app Browser control tool was unavailable. The in-app tab was left untouched. The 84-case route/width/theme matrix found no overflow or page errors. Work and writing interaction checks passed; a fresh homepage navigation also confirmed identical card/text/screenshot bounds during hover, artwork movement only, visible focus, and no artwork transform with reduced motion. No-JavaScript writing content and touch navigation passed. Local public build/typecheck, brand/landscape, content-platform, and public-copy checks passed. This is local implementation proof, not PR, merge, or deployment proof.

Latest systems annotations: applied Ani's exact closing wording beginning “this is how i direct traces of context” and ending “people that are important.” Removed the stacked step descriptions' 42ch width cap below the existing 880px breakpoint, allowing the available column width at intermediate sizes such as 802px. Paragraph-spacing guidance was discussed only: continuous prose should have consistent paragraph gaps, with larger gaps reserved for sections or the map. Browser QA for this follow-up is unavailable because the newly listed in-app Browser skill's required control tool is not exposed; no alternate browser was substituted.

Systems follow-up: the closing rationale now lives in optional canonical `workflow.outro` and renders below the map, with the location-dependent opening changed to “this is how i organize that.” The loop caption uses available desktop width rather than a 48ch cap; it fits one line at the existing 880px breakpoint while mobile retains vertical placement. Browser checks at 319, 390, 879, 880, 883, 907, and 1440px in both themes found no overflow or console errors; pause/resume still works. A static two-row source collection was proposed as a replacement for the marquee and remains unapproved/unimplemented. Work-page review remains at Structured AI's personal engineering decision.

Ani clarified that the desired format is **tweet-length paragraphs**, not inverted-pyramid news structure. Keep each paragraph focused and short enough to stand alone, preserving the argument's natural order and voice. The approved systems rationale uses three paragraphs below 280 characters each across its introduction and closing copy. Apply this paragraph treatment during each approved work/writing review; do not reorder every piece into a news story or silently rewrite all existing copy.

The supplied portfolio-walkthrough video informs the work-page review: decide what a visitor should learn about Ani, establish role/scope, show the finished artifact early, select important decisions and alternatives, then show evidence and genuine reflection. Avoid a chronological process dump or forcing every small project into seven headings.

For writing, apply clarity of argument, concrete examples, evidence, and purposeful structure. Keep the author's historical perspective and original date. Product-case-study structure does not belong in every essay.

The tables below separate existing publication state from new editorial approval. “Retain pending review” means leave existing copy intact, not that its claims have been verified.

## Route and content ledger

Visual code `M/D`: automated 390px and 1440px checks in light/dark themes returned 200, one h1, no document overflow, no broken completed images, and no page errors. This is technical coverage, not Ani's visual or editorial approval. Systems and work also received the seven-width check. Selected screenshots were inspected; every page still needs final human reading.

| Route                                                    | Publication state             | Factual questions / proposed direction                                                                                                                                                           | Approval                                                | Visual                                | Release disposition                                      |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `/systems`                                               | Public                        | Rationale approved; retrieval proposal remains under review                                                                                                                                      | Presentation and rationale approved; retrieval pending  | Seven widths, M/D, 319px at 200% text | Include approved rationale; hold remaining proposed copy |
| `/`                                                      | Public                        | Keep contribution distinct from company product claims; verify employment dates, Atlantic relationship, press attribution; draft a lighter introduction after systems review                     | Existing selection preserved; rewrite pending           | M/D                                   | Rename links now; hold positioning changes               |
| `/work`                                                  | New canonical index           | Experience, selected projects, archive; preserve ordering and visibility                                                                                                                         | Structure requested; minimal index metadata implemented | Seven widths, M/D                     | Include route migration                                  |
| `/work/structured-ai`                                    | Featured experience           | Which difficult interaction/engineering decision was Ani's? Confirm 2025 dates, team scope and permission for screenshot. Current company site supports drawing review/citations, not authorship | Retain pending review                                   | M/D                                   | No new contribution claims                               |
| `/work/pgi-research-platform`                            | Featured experience           | Confirm role/dates, specific portal ownership, client screenshot permission, decision rationale and result                                                                                       | Retain pending review                                   | M/D                                   | Keep existing artifact and order                         |
| `/work/habittracker-obh`                                 | Featured experience           | Separate Ani's work from venture capabilities; verify Atlantic affiliation and approved screenshots                                                                                              | Retain pending review                                   | M/D                                   | Hold substantive revision                                |
| `/work/range-media-partners`                             | Featured experience           | Clarify current dating, client relationship, useful deliverable, and what can be public                                                                                                          | Retain pending review                                   | M/D                                   | Hold substantive revision                                |
| `/work/quantercise`                                      | Featured project              | Which version is shown? Verify 400+ problems, grading/runtime, availability and payments; do not silently replace historical features with current beta plans                                    | Retain pending review                                   | M/D                                   | Hold feature/status rewrite                              |
| `/work/claude-code-tips`                                 | Featured project              | Canonical repository now Coding Agent Tips; verify hundreds-of-sessions claim and current guide scope before changing description                                                                | Identity correction verified; story pending             | M/D                                   | Name/link correction included; slug retained             |
| `/work/imessage-mcp`                                     | Featured project              | Confirm current package capabilities, read-only boundaries, meaningful implementation choice; use synthetic/redacted examples                                                                    | Retain pending review                                   | M/D                                   | No personal messages or new private examples             |
| `/work/nyu-purity-test`                                  | Featured project              | Source 3,000+ completions, 1,000+ in 17 hours, and 200k+ visits; distinguish visits, people, completions                                                                                         | Retain pending review                                   | M/D                                   | Metrics require receipts or approved narrower wording    |
| `/work/chainedchat`                                      | Listed project                | Verify sunset status, original contribution and repository; keep concise                                                                                                                         | Retain pending review                                   | M/D                                   | Compact archive entry                                    |
| `/work/quantercise-extension`                            | Listed project                | Verify extension availability/repository; distinguish it from main Quantercise                                                                                                                   | Retain pending review                                   | M/D                                   | Compact archive entry                                    |
| `/work/options-pricing-sensitivity`                      | Listed project                | Confirm repository ownership and scope of pricing/volatility work; avoid claims about financial results                                                                                          | Retain pending review                                   | M/D                                   | Compact archive entry                                    |
| Hidden project record                                    | Hidden                        | Review privately, including identity and media rights; no new public URL or selected card                                                                                                        | Not approved for publication                            | Hidden URL tested 404                 | Preserve hidden                                          |
| `/writing`                                               | Public                        | Existing introduction and all five published essays retained; selection/description review after work                                                                                            | Retain pending review                                   | M/D                                   | Canonical links only                                     |
| `/writing/awareness-is-alpha`                            | Published, 2026-07-14         | Ground central argument in one actual example; reduce abstractions and repetition                                                                                                                | Retain pending review                                   | M/D                                   | Preserve date; draft next editorial batch                |
| `/writing/saturdays-are-for-claude-code`                 | Published, 2026-04-13         | Verify 1,000 hours, 600+ sessions, 3.3 tool rate, 8.8x ratio, “100% human idle” causality and press link                                                                                         | Retain pending review                                   | M/D                                   | Preserve historical context; no current-state rewrite    |
| `/writing/i-built-a-monitor-for-my-claude-code-sessions` | Published, 2026-04-07         | Resolve coming-soon promises, actual current/historical status and observability claims                                                                                                          | Retain pending review                                   | M/D                                   | Evidence needed before revised promises                  |
| `/writing/stop-ending-your-day-with-fix-the-bug`         | Published, 2026-04-07         | Keep concrete task example; verify 30+ calls, 2/10+ minute comparison and billing assumptions                                                                                                    | Retain pending review                                   | M/D                                   | Scope observations; preserve original date               |
| `/writing/search-will-be-dead-by-2030`                   | Published, 2026-01-31         | Make prediction an argued position with counterexamples and reasoning                                                                                                                            | Retain pending review                                   | M/D                                   | Do not backdate newly learned facts                      |
| JPEGMAFIA essay                                          | Draft, original date retained | Recover Ani's actual music argument; no generic product analogy imposed                                                                                                                          | Not approved for publication                            | Absent from feed/sitemap              | Preserve draft                                           |
| `/links`, newsletter surfaces, 404, feeds                | Public supporting routes      | Final link/form/metadata regression checks; no real outbound form submission                                                                                                                     | No substantive copy change                              | See verification                      | Keep in release smoke inventory                          |

### Source receipts

- External project-link HEAD checks: eight destinations returned 200; the npm website returned 403 (access restriction, not proof the package is missing); the old options-pricing repository returned 404. A read-only visibility check found its current repository private. The source button was removed in `2bb23b7`; no repository visibility was changed.

- GitHub read on 2026-09-07: requesting `anipotts/claude-code-tips` resolves to [anipotts/coding-agent-tips](https://github.com/anipotts/coding-agent-tips), not archived, homepage `https://agents.anipotts.com`. This supports the name/link correction only.
- [Structured AI's current product site](https://getstructured.ai/) describes drawing review, drawing-set chat and cited findings. It does not prove Ani's personal contribution, historic release scope, employment dates, or screenshot permission.
- The Quantercise website returned no extractable copy in the research read. Treat its detailed feature/payment claims as unresolved, not verified.
- No new analytics totals, client permissions, employment facts, or first-person decisions were inferred from logos or screenshots.

## Workspace preservation

No worktree, branch, or user-authored experiment was deleted. The managed preview remains running.

Ignored local recovery files in `.local/release-preservation/`:

- `pre-work-release.patch` and `pre-work-release-untracked.tar.gz`: original main-checkout work before the focused commits.
- `systems-experiments.tar.gz`: 20 tracked-dirty/untracked files from the older systems worktree, including variants and screenshots.
- `hero-card-drafts.tar.gz`: five files from the older hero/card worktree.
- `canonical-record-qa.tar.gz`: the remaining QA document from the canonical-record worktree.

Archives were created without moving originals; entry counts were checked against the source file lists. Git retains committed bases and deleted tracked-file history. These archives are local, not cloud backups.

| Worktree / branch                          | Evidence                                                                               | Disposition and next action                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Main project checkout, release branch      | Current work committed by scope                                                        | Keep preview and checkout; return to updated main only after integration                            |
| `26f0`, systems discovery                  | One unique docs commit `7eabfd8`                                                       | Retain attention/context rationale; old two-loop topology is superseded by current four-step design |
| `911c`, systems-simple-workflow            | Branch commits are ancestors of main; 20 dirty/untracked files archived                | Experiments preserved, not production candidates; retire only after review loop closes              |
| `public-site-review-batch-2026-08-28`      | Base integrated; CodingAgentTipsCard draft is byte-identical to current component      | Its SectionHero proposal is superseded by current shared PageHero; five files recoverably preserved |
| `public-work-canonical-records-2026-08-26` | Two record/style patches equivalent to main; only unique patch is old Portless removal | Do not merge whole branch; preserve QA document; current managed preview stays                      |

### Remaining local branches

Compared against `main` using ancestry and `git cherry`, not names/upstream presence.

- Integrated by ancestry: `codex/preserve/home-polish-before-consolidation-2026-09-07`, `codex/preserve/homepage-content-editing-2026-08-26`, `codex/preserve/state-deploy-dependency-fix-2026-08-26`, `codex/preserve/systems-before-consolidation-2026-09-07`, `codex/pro/preserve-64c19ce-20260715`, `codex/public-card-geometry-fix-2026-08-29`, `codex/systems-simple-workflow`. Eligible for later retirement after associated dirty work is resolved.
- Entirely patch-equivalent: `codex/admin-activation-graph-2026-07-31` (1), `codex/preserve/d1-ledger-bootstrap-batch-2026-08-22` (1), `codex/pro/brand-palette-admin-2026-07-17` (1), `codex/pro/brand-palette-www-2026-07-17` (1), `codex/public-site-review-main-preserve-2026-08-28` (2), `codex/public-site-review-pre-attribution-repair-2026-08-28` (3), `preserve/pro-admin-polish-20260702` (2). Retain until release closeout; no integration needed.
- `codex/preserve/ap-structural-width-fix-2026-08-23`: two equivalent patches, two unique historical Node-policy patches. Preserve; current Node 24.19.0 policy supersedes old environment proposals. Do not merge wholesale.
- `codex/pro/archive-homepage-f98e-2026-07-17`: one unique orphaned homepage experiment. Preserve as design history; compare only if Ani requests that direction.
- `codex/pro/site-annotations-2026-07-17`: five unique older homepage/typography/logo commits. Preserve; current approved layout is authoritative. Any future recovery must be selective.
- `codex/remove-portless-2026-08-28`: one unique Portless-removal patch. Superseded by current managed-preview policy; preserve without merging.
- Discovery and canonical-record branches: dispositions in the worktree table above.

## Open issue dispositions

All 21 issues remain open. These are proposed dispositions, not posted comments or closures. “Successor check” means the old implementation was removed but the corresponding current behavior has not been fully audited.

| Issue                         | Classification                            | Evidence / next action                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #43 React Review Audit        | Admin-only                                | Old React/Next audit; review relevant current Astro/React islands separately                                                                                                                |
| #27 Resend response details   | Superseded, successor check               | Old `/api/send` absent; review current newsletter response sanitization in its outbound lane                                                                                                |
| #25 Turbo cache inputs        | Maintenance, locally fixed public portion | Added root canonical Markdown glob; Turbo reports all 26 canonical files in public build inputs; audit remaining config packages separately                                                 |
| #24 Package metadata          | Already fixed                             | Root package has license, author, repository, homepage and description                                                                                                                      |
| #23 Slug collision            | Admin-only                                | Old publishing route; inspect current stable-ID/draft-operation flow before closing                                                                                                         |
| #22 RSS lastBuildDate         | Maintenance, locally fixed                | Feed now reports newest published date, not request time; five items, no draft                                                                                                              |
| #20 Icon cache                | Maintenance                               | Current route is a 307 to approved static assets; assess redirect caching separately                                                                                                        |
| #19 Turnstile/CSRF            | Superseded, successor check               | Old `/api/send` absent; do not infer current newsletter forms are covered                                                                                                                   |
| #16 ThemeContext memoization  | Superseded                                | Public site no longer uses old Next ThemeContext; any retained admin equivalent belongs to admin lane                                                                                       |
| #15 logger.info               | Already fixed                             | `packages/lib/src/logger.ts` uses `console.info`                                                                                                                                            |
| #14 Admin error boundary      | Admin-only                                | Review current Astro failure routes; old Next boundary prescription is stale                                                                                                                |
| #13 Unused exports            | Maintenance                               | Scope by current consumers; no blanket export deletion                                                                                                                                      |
| #12 TipCard nested controls   | Superseded, successor check               | Old card implementation absent; keyboard-check current linked cards before closing                                                                                                          |
| #11 Form labels               | Maintenance; public form checked          | Newsletter email has an accessible name and required email validation; mocked 503 produced the retry message without an outbound send. Remaining admin/search surfaces need their own check |
| #10 Atom count full scan      | Admin-only                                | Old Supabase pipeline; inspect current D1 query behavior                                                                                                                                    |
| #9 SERIES_COLORS              | Admin-only                                | Verify current chart consumers before extracting or removing anything                                                                                                                       |
| #7 CI ignored failures        | Already fixed in current workflows        | No `                                                                                                                                                                                        |     | true`found in`.github/workflows`; exact required checks still matter |
| #6 window.location.reload     | Admin-only                                | Old Next refresh advice; do not change authentication/navigation behavior in this release                                                                                                   |
| #5 Environment validation     | Maintenance                               | Audit per-target binding requirements without reading secret values                                                                                                                         |
| #4 ThroughputChart empty data | Admin-only                                | Check successor chart/empty states in dedicated admin review                                                                                                                                |
| #3 Login rate limiting        | Admin-only, security priority             | Current passkey/auth path needs a separate exact-scope audit; do not revive old login code                                                                                                  |

### Dependency PRs

Additional release gate discovered during push: GitHub reports 102 open dependency alerts on default main, including one critical. Read-only inspection identifies [alert #143](https://github.com/anipotts/anipotts.com/security/dependabot/143): `tar`, decompression/parse denial of service, patched in 7.5.19. The current lockfile contains 7.5.15; `pnpm why tar -r --depth 3` shows `www → astro-icon → @iconify/tools → tar`. That confirms the dependency chain, not public-request reachability. Before production, assess actual exposure and apply/reverify the narrow patch in the dependency lane. Do not equate green application tests with a cleared dependency-security gate.

Read-only snapshot 2026-09-07: #302 CLEAN; #306 BEHIND; #292–#295 draft/BLOCKED. No dependency branch was changed or merged.

- #302: refresh exact head, diff and checks against latest main after public integration; separate maintenance release.
- #306: update from latest main and rerun action compatibility checks in a dedicated CI lane.
- #292–#295: keep out of public launch. Diagnose Hono, TypeScript 7, SolidStart 2 and Astro Cloudflare 14 failures independently. Do not upgrade rollback-only Solid merely to empty the list.

## Verification and release gate

Completed local checks:

- Content generation/check and content-platform tests, including legacy path/placement normalization, stable admin identity, hidden record filtering and route inventory.
- Public and admin Astro typechecks: zero errors/warnings.
- All CI-invariant checks, brand/public-copy/boundary/routes, full workspace builds/lint/typechecks passed in the first full run. That run then found two shared unit-test regressions; both were repaired, and the 141 lib tests subsequently passed. The full `pnpm check:changed` rerun (which invokes `pnpm validate`) passed at `62b5e79`, including 141 lib and 132 admin unit tests. A final check follows the source-link correction.
- Public route smoke inventory: 23 routes. Sitemap: 20 index/detail URLs, including 11 work details and five published essays. No old `/making` or `/projects` canonical URLs, hidden project or draft in sitemap/feed.
- Eighty automated page checks: every sitemap URL at 390/1440px, both themes; no document overflow, broken completed images, missing h1, HTTP failure or page error.
- Systems and work at 319/390/768/879/880/907/1440px in both themes. The 880px switch is retained. Mobile title/icons/description stacking and 36px tiles measured. Return caption fits the diagram at 319px and 200% root text size.
- Marquee hover continues; keyboard Enter toggles pause/resume; reduced-motion and JavaScript-disabled views retain four steps and all 14 sources. Repeated full visits do not accumulate visible tracks. The current Shell uses full document navigation, not Astro ClientRouter; the actual navigation path was exercised. Disposal hooks remain for future Astro navigation support.
- Old index aliases and detail redirects preserve query strings with 301 responses. Valid work detail 200; hidden/unknown detail 404. The first test found an Astro rewrite 500, repaired by shared detail/404 components.
- Turbo dry-run input inventory includes 26 canonical content files. RSS `lastBuildDate` is `Tue, 14 Jul 2026 00:00:00 GMT`, matching the newest published essay.

Outstanding gates:

1. Review the remaining systems retrieval-description and related-work proposals, then proceed homepage → work index/details → writing index/essays. No batch approval is assumed.
2. Resolve factual claims, media permissions and remaining source questions. The broken options-pricing source button is now omitted because the replacement repository is private; project visibility is unchanged.
3. Finish human visual review beyond the automated dimensions. Keyboard-visible pause focus is a 2px outline; mobile pause and footer targets are at least 44px. Development toolbar overlays are not production UI. Browser QA finished at 1440px in a regular viewport; the in-app device toolbar was not changed.
4. Rerun `pnpm check:changed`/full validation for the final committed tree. Push the branch and open a same-repository PR after checking publication readiness of its content.
5. Re-read exact-head required checks and live provider protections. Review actual target classification and route-change gates. No merge/deploy bypass.
6. Record PR, merged SHA, release run, executed/skipped targets, production routes and rollback SHA. Current known-good baseline: `2451782dfe1599c642b1f75d39623e4ec9e592ce`, deployment run `34153601249`.
7. Return the canonical checkout to updated main after integration. Retire only verified integrated or recoverably preserved agent worktrees. Leave remaining maintenance with priority and next action.

There has been no production deployment, remote migration, issue comment/closure, dependency merge, or destructive workspace cleanup in this implementation batch. The review branch is backed up remotely; main and production remain on the previous release.
