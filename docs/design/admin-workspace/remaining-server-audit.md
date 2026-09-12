# Remaining server, route and authentication test audit

2026-09-12. Read all 15 listed files in full (2,051 lines at audit time). This is an exact-source audit, not a claim that authentication was changed or that provider access was exercised. The follow-up below narrows knowledge list responses and adjusts retained callers. No private data reads, service changes, auth changes or ledger edits were made by this audit.

## Findings sent to the integration owner

1. **Fixed: knowledge list overfetch.** `readAdminKnowledge` now computes the existing validated/filter/budget-bounded bundle once and returns its exact cards array as the compatibility alias. Query/domain/limit/token budget cannot be bypassed through top-level cards. Reveal policy and provenance remain untouched; this is projection minimization, not a new authorization policy. The retained Knowledge caller requests the selected kind as a query with the established maximum result/budget caps; Locations explicitly queries place with those same caps. Both disclose truncation. There is still no pagination, and relevant query ranking is not an exact exhaustive kind index. No full-projection bypass or Life endpoint was added.
2. **Page edit capability mismatch.** The collection detail route sets `editorRecord` for projects and writing (including private-only writing) and `editHome` for Home. Other page collections receive review props and rendered content, not the document editor. Meanwhile the inventory projection marks supported page entries editable. The parent should reconcile either the actual editor routing or truthful capabilities for Pages. This audit did not invent a new editing workflow.
3. **Fixed: local bootstrap retry.** A rejected esbuild/Miniflare bootstrap clears only the identical failed memoized promise. The next request retries, concurrent retries share one bootstrap, and a transient binding failure reuses the initialized runtime. Local persistence paths and process lifecycle remain unchanged.
4. **Legacy auth presentation diverges.** AuthFrame is standalone custom CSS with many hardcoded colors, a 248–320px rail and 88px desktop primary button, plus a distinct 820px breakpoint. It includes visible focus and reduced-motion rules, but it is not token-aligned Astryx shell presentation. Treat as a conscious compatibility-only surface or schedule visual refinement; passing auth-policy tests is not evidence of visual acceptance. Authentication behavior must remain unchanged.
5. **Fixed: direct snapshot deadlines.** Preview and private-only writing discovery use a shared 15-second read deadline including storage bootstrap. Unavailable/timeout is distinct from missing/discarded: preview returns its existing generic unavailable frame with 503, private-only detail returns 503 with the existing Reload recovery banner, and actual missing/discarded detail remains 404. Exact-revision preview mismatch remains 409. The read-only adapter has no abort capability: late work may finish, but cannot alter the returned response and late rejection is handled.

## Source and boundary review

- `admin-access-policy.ts` keeps an explicit public auth/static allowlist. Development bypass is read-only GET/HEAD, requires development mode, and requires exact loopback/approved Portless origins and an explicit page/asset pattern. Six Life section previews and Observability are development page exceptions only; their production routes and protected APIs remain protected. The helper is one layer, not evidence that public endpoints themselves implement all required checks.
- Access identity tests sign actual RS256 assertions with generated keys, exercise exact owner/issuer/audience/subject/expiry, reject forged or spoofed assertions and unavailable keys, and verify retained Access principals cannot mutate/publish. This audits those tests, not a fresh full implementation audit of access-identity.ts.
- Admin auth tests cover safe return paths, exact mutation origin, absolute/inactivity expiry, ten-minute step-up, viewer/operator/owner capability differences, host-only secure session cookies, and session-bound mutation CSRF. These are test cases only; deployed provider configuration remains a separate release gate.
- Editorial security tests cover same-origin and fetch-site checks, CSRF matching and duplicate cookies, JSON content type, actual byte bounds without Content-Length, invalid UTF-8/JSON, secure CSRF cookie issuance, and private error response headers. They do not constitute a full penetration test or validate every API caller.
- The local storage adapter builds the same Workers draft store with local Miniflare SQLite persistence and no remote bindings. Local base source comes from schema-derived editorial paths; missing writing files produce a new-writing base while other filesystem failures propagate. Git blob hashes include byte length and exact source bytes.
- `localGitHead` reads ordinary/linked worktree metadata, detached or symbolic HEAD, and loose/packed refs without invoking a developer-tools Git executable. Ref paths reject empty/dot/dot-dot segments, hashes must be 40 lowercase hex, corrupt loose refs do not fall back to older packed values. It is deliberately uncached, so a later valid read recovers from missing metadata. Filesystem locations come from trusted local Git metadata, not HTTP query paths.
- Knowledge storage distinguishes disconnected/failed table reads from genuine missing cards; list failure returns 503, missing detail returns 404, and unrelated operational table failures do not hide available knowledge. Detail responses are private/no-store; list is no-store. Raw loader diagnostics remain in the list shape and should not be confused with an intentionally minimal presentation.
- The content detail route discovers private-only writing through validated identities, falls back to a safe title on malformed source, and gives absent records 404. Public links are produced only for published writing, visible projects and known public page families. Newsletter landing status remains its actual schema status. Discarded private drafts are now excluded by the shared snapshot reader, consistent with inventory exclusion.
- Preview validates record identity, requires an extant non-discarded draft with the exact requested revision, validates source, and uses source-only failure for unsupported project body changes or page shapes. It renders public presentation components from private draft values and never writes publication state. Frame messages carry the caller request identifier; the receiving component owns source/request verification. Middleware was inspected narrowly to confirm preview responses get private/no-store headers and preview frame policy; no full middleware re-audit is claimed here.
- Theme tests verify URL preference consumption, shared production preference cookie versus host-local development cookie, invalid preference handling and disabled storage resilience. They do not verify live dark/system appearance.

## Verification

`/private/tmp/remaining-server-audit-tests.log`: **108 tests passed in seven suites**, run at 04:52:09. Suites: knowledge, access-identity, admin-access-policy, admin-auth, editorial-security, editorial-theme, local-git-head. No unhandled errors or test failures. Authentication signatures use test keys and storage uses fixtures, not live credentials or private records. Route/template rendering, auth-screen responsive appearance, actual provider protections and authenticated Browser QA remain separate requirements.

## Exact source identities

A hash change invalidates this receipt for that file until reviewed again. Test-file hashes record the audited tests, not completion of the implementation they import.

| File                                                   | SHA-256                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/admin/src/components/auth/AuthFrame.astro`       | `50138ec35335ec050bdc4511f2e4ce35565f5f09cffa6c15902355afc3a8ad26` |
| `apps/admin/src/data/knowledge.ts`                     | `7a25a366f58b3446b72926981cdcb79d98e2a704b2e64e7591a3db9452099249` |
| `apps/admin/src/data/knowledge.test.ts`                | `962396c4057c5a7b9f78b1965a034b2cdd4b07667606d7024a373d578812944b` |
| `apps/admin/src/lib/access-identity.test.ts`           | `10494df8ac128cd17799bef186bb48d8a5ef6a6e7e92d17f3f25d992fc40a89c` |
| `apps/admin/src/lib/admin-access-policy.ts`            | `2eb215ea7bad9df93269412daa789345d37c20ee563ed1c0512321386dd3868d` |
| `apps/admin/src/lib/admin-access-policy.test.ts`       | `38313cd16201bdf4496c64d2a94f2bc47d33fad382f468b81a75ab684fabc2ce` |
| `apps/admin/src/lib/admin-auth.test.ts`                | `500d17ecfe52ca557719c1fa23ae713009462366eb441c11a3592201b0b33fd2` |
| `apps/admin/src/lib/editorial-local.ts`                | `ed752911e8fdf379f7e3f3fbd2df83f81e5cf5ee0d10b47ffbb89898f18036db` |
| `apps/admin/src/lib/editorial-security.test.ts`        | `37ef1ba39cd21dbc987f02d96ec956cb895a2ed82caf60da99346588ed98ae64` |
| `apps/admin/src/lib/editorial-theme.test.ts`           | `494f5642407e8e5e43b0a147b549a264cd717989f94455712ce6d8de6ddbc7e5` |
| `apps/admin/src/lib/local-git-head.ts`                 | `fbea2118a3647cd243145d1baaf0241d32fefbd0b46ed96951ca65dafcd1c3a7` |
| `apps/admin/src/lib/local-git-head.test.ts`            | `a5a2c5812d382acbf07285ce375c6b8f50e8d0970b2ee94e47e14117dae89c3b` |
| `apps/admin/src/pages/api/admin/knowledge.ts`          | `87012f2108bb8bf49c87bad2f00e3968895eabd2bc1475b60c44930ca0078ee5` |
| `apps/admin/src/pages/content/[collection]/[id].astro` | `24ddb998e003dd789c277ab3a2926e30ba231f526061f5fddbf1a6fc4451411d` |
| `apps/admin/src/pages/preview/record.astro`            | `56b774467dab0bbe06a93951184943065705ca9d0addfd9fed8032912e70263f` |

## Knowledge minimization follow-up

Three new regressions failed before the fix (`/private/tmp/knowledge-bounded-before.log`): top-level cards bypassed domain/query/result limit, token budget, and an unmatched query. All **7 knowledge tests pass** afterward (`/private/tmp/knowledge-bounded-tests.log`, 04:56:01). Tests also exercise the unchanged HTTP GET serializer, retained availability semantics, and source metadata preservation. Route parity passes. The two retained route changes are caller input/truncation-label changes, not a new claim of a complete route audit.

| Changed caller                                   | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/admin/src/pages/knowledge.astro`           | `cd3eb7ddab42a5b3813e3b0b205d315c05d1aa9b6fa75a4fd78560d3bc6ad2f8` |
| `apps/admin/src/pages/knowledge/locations.astro` | `44a329b193283d3d4a8ec6e9568610c21bd460666f1be9a9981f8d7c141a766e` |

## Snapshot recovery follow-up

`/private/tmp/editorial-snapshot-recovery-tests.log`: **11 tests pass in four suites** at 04:59:13 (editorial-local, editorial-snapshot-read, preview-status, local-git-head). Fake timers verify never-resolving reads return unavailable after 15 seconds, late resolve/reject cannot replace that result, and no timers remain. Bootstrap tests mock esbuild and Miniflare: no local runtime, draft writes or service starts occur. Astro check also passed across 253 files with 0 errors, 0 warnings and 6 hints (`/private/tmp/editorial-snapshot-types.log`). Route response wiring was source-reviewed; authenticated Browser failure recovery remains separate evidence.

| Additional source                                    | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/lib/editorial-local.test.ts`         | `04343a264e496a147e6b0f1573a1d19b1b7f80817c68ad808664878b1ce8084b` |
| `apps/admin/src/lib/editorial-snapshot-read.ts`      | `45f234af0214f77e1131cb8740793bc0c55d056ce0d93a035eefd107720dbd23` |
| `apps/admin/src/lib/editorial-snapshot-read.test.ts` | `be6c3652a9e0b33abb321747d6f37e8f6552656bbe849e97c81186f45e31eb75` |
