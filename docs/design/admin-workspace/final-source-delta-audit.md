# Final source delta audit

2026-09-12. Reconciled all 397 ledger paths with tracked and nonignored untracked Admin files: no source path is absent from the ledger. This is not 100% completion. Navigation, shell, palette, route and related reserved work was left untouched. No implementation edits or commits.

## Reviewed current files

Read these eight files fully (965 lines). Updated only these eight ledger entries to their reviewed current bytes. No pending entry had both its path and current hash in an existing audit receipt, so no unverified blanket promotions were made.

- Inventory projection tests cover private/published provenance, malformed/discarded records, private-only discovery, Git-byte pending detection, field summaries, meaningful Markdown differences, semantic YAML equivalence, partial read results, four concurrent reads and the single 15-second deadline with late rejection. The added page-family identity assertions validate known ids and reject invalid page ids; no route implementation was re-audited here.
- ControlPlaneReceipt tests assert retained read/proof output and absence of a retired command hook; missing observation is unknown/unavailable rather than idle. These are source-contract assertions, not runtime provider proof.
- Local runtime tests mock esbuild/Miniflare entirely, assert failed bootstrap retries coalesce and binding failures retain one initialized runtime. No real worker or service starts.
- Admin theme resolver picks first valid URL/cookie/current storage/legacy storage setting, catches optional storage errors, sets Instrument Sans marker, and removes fixed theme state in system mode. A valid incoming theme is persisted then removed from URL with history state retained. Tests execute the exact prepaint script and cover precedence/disabled storage. Actual first-paint flashes and browser system-change behavior remain visual QA concerns.
- Workspace theme tests enforce equal semantic/neutral/font tokens, scoped sidebar tint, and 4.5:1 accent contrast against sidebar/selection/document surfaces in both modes. This audits the tests, not full generated theme bytes or actual computed Browser styles.
- Hover tests exercise installed Tooltip/HoverCard immediate entry/exit, direct movement onto tooltip surface and preserved explicit dwell override. Fake popover APIs and fake timers cannot prove physical pointer-gap, clipping or touch behavior.
- LifeSupportingView is a presentation-only Health/Aesthetics component. It separates unavailable, empty and supplied summaries; React text rendering avoids raw HTML, and provenance/freshness/reveal-policy details stay in disclosure. It fetches nothing and makes no mutations. It does not enforce authorization itself: its caller must provide only allowed summaries, and hiding source details in a disclosure is not a privacy boundary. Aesthetics remains explicitly unconnected. No live health data read.

## Verification

`/private/tmp/final-source-delta-tests.log`: 36 tests pass across six suites at 05:24:10. Inventory projection, ControlPlaneReceipt, editorial-local, admin-theme, hover-timing and workspace themes. No full build/install/preview/service operation. LifeSupportingView received full source review but no new runtime test in this tranche.

## Remaining source receipt gaps

The following remain pending or hash-stale after this tranche. They are not newly discovered bugs; several are active reserved navigation work. A source receipt cannot be refreshed merely because a suite passes. Legacy auth/logout route availability, public deploy classification, connected integration proof and visual/editor QA remain separate release requirements.

29 entries remain pending or stale.

- `apps/admin/src/components/astryx/AdminCommandPalette.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/AdminShell.test.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/AdminShell.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/EditorialApp.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/HomeEditor.navigation.test.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/HomeEditor.tsx`: pending, hash changed.
- `apps/admin/src/data/admin-search.test.ts`: reviewed-retained, hash changed.
- `apps/admin/src/data/admin.ts`: reviewed-retained, hash changed.
- `apps/admin/src/data/inbox-route-parity.test.ts`: updated, hash changed.
- `apps/admin/src/layouts/AdminLayout.astro`: pending, hash changed.
- `apps/admin/src/layouts/EditorialLayout.astro`: pending, hash changed.
- `apps/admin/src/pages/content/[collection]/[id].astro`: pending, hash changed.
- `apps/admin/src/styles/editorial.css`: pending, hash changed.
- `apps/admin/src/components/astryx/EditorialWorkspaceShell.mobile.test.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/EditorialWorkspaceShell.test.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/EditorialWorkspaceShell.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/ObservabilityWorkspace.test.tsx`: pending, hash changed.
- `apps/admin/src/components/astryx/ObservabilityWorkspace.tsx`: pending, hash changed.
- `apps/admin/public/admin-bracket.svg`: pending.
- `apps/admin/src/components/astryx/WorkspaceHeader.css`: pending, hash changed.
- `apps/admin/src/components/astryx/AdminCommandPalette.test.tsx`: pending, hash changed.
- `apps/admin/src/lib/editorial-navigation.ts`: pending.
- `apps/admin/src/lib/workspace-navigation.test.ts`: pending.
- `apps/admin/src/themes/life.d.ts`: pending.
- `apps/admin/src/themes/life.js`: pending.
- `apps/admin/src/themes/life.variants.d.ts`: pending.
- `apps/admin/src/themes/operations.d.ts`: pending.
- `apps/admin/src/themes/operations.js`: pending.
- `apps/admin/src/themes/operations.variants.d.ts`: pending.

## Exact source identities

| File                                                        | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/lib/editorial-inventory-projection.test.ts` | `90dc92bcdfdfbe5f365b4dce0570fd8a5dd387d9f9707b7de0f821dd69d4267c` |
| `apps/admin/src/components/ControlPlaneReceipt.test.ts`     | `729ffc0b9e847ec36a5fa0534f516cba8f8b637dc15b73972dd5449a0ce4d6c9` |
| `apps/admin/src/lib/editorial-local.test.ts`                | `cda6858b78f577af35a2ecdabb2723e1a9fe5e6fea945923b8f181f4ce6bd45b` |
| `apps/admin/src/components/life/LifeSupportingView.tsx`     | `5d8d93b3cce1c36ba85e356a99bfb39c0e9b41f6df4990428240f57ff0a6813e` |
| `apps/admin/src/lib/admin-theme.ts`                         | `8e6f079876a7f54a255edf9cc757cafc1a46c6f6d4907046abc90db7392fdd74` |
| `apps/admin/src/lib/admin-theme.test.ts`                    | `fd4757e403b727eead145e45608dec724242cba735640431e21424899881a333` |
| `apps/admin/src/lib/hover-timing.test.ts`                   | `cd50854261100818cb2df44f3b510a2fd9b3e4775912effd38ad970317dfee14` |
| `apps/admin/src/themes/workspaces.test.ts`                  | `99344571a6da544346b55a6eab140bb69127c8594c4e35bea3e4856237714150` |

## Approved navigation integration read-only follow-up

After navigation approval, read all 13 additional files below in full (3,786 lines). No implementation or navigation test edits. The navigation worker retains ownership; subsequent hashes invalidate this receipt naturally. Four focused suites pass with 21 tests at 05:27:39 (`/private/tmp/source-integration-delta-tests.log`): HomeEditor navigation, workspace-return tests, admin-search, Inbox route parity.

### Findings for integration owner

1. Fixed with explicit integration approval: added only `/admin-bracket.svg` to the public static path allowlist used by both layouts. Its suffix/subpath/lookalikes remain protected by regression. No login/session/credential behavior changed. Wrangler uses `run_worker_first=true`, so this prevents the new icon being routed into auth instead of served as static content.
2. Confirmed actual group mapping: internal `pages` means all-record Overview; `website` is the visible Pages destination. Fixed its former fallback heading Content to Pages. Overview remains unchanged. A dedicated regression covers both.
3. SS-1 logout integration remains open exactly as the dedicated logout decision packet describes. EditorialApp clears recovery on provider logout click, while other workspaces do not; native logout routes are retired. Browser beforeunload cancellation after cleanup deserves explicit testing because local recovery may already have been cleared while the user remains in the document.
4. Recover/rebase/cancel/retry failure text and comparison instructions in HomeEditor still begin lowercase in several places; SourceEditor's accessible name is `record source`. This is a minor sentence-case consistency gap, not a data-path failure.
5. Generic page/work preview still uses a raw iframe, whereas Writing uses SavedArticlePreview with its richer availability handling. Its response can fail safely server-side without equally informative parent UI. Actual non-writing preview failure UX remains Browser QA work.

### Reviewed behavior and limits

- AdminShell derives Life versus Operations from current route, uses exact selected query values for Machines/Loops, and keeps Life palette navigation-only without mounting Operations provider. Operations primary nav is separately composed from its larger retained diagnostic/search registry. The auth branch renders no workspace palette. Changes during concurrent navigation work require reread.
- EditorialApp uses server-supplied content inventory and acknowledged-save events for library/search, never operational endpoints. It exposes one persistent inventory Reload action; generated metadata labels use sentence case while values are preserved. Lazy HomeEditor is keyed by record id and stable callbacks; route changes currently use full navigation, not a generalized SPA record swap.
- HomeEditor buffers writing title/subtitle/body, tracks edit generations, flushes before same-origin navigation and blocks leaving on failed saves/new edits. Modified/external/download link clicks retain browser behavior; same-document hash links are not intercepted. The custom navigation event delegates to the mounted editor. It is an internal coordination API, not an authorization boundary or untrusted-link sanitizer.
- Preview/review/history requests use per-operation sequence, navigation generation and controller identity guards. History keeps prior data on refresh failure. Writing document remains mounted while panels/views change; returning from preview restores focus and main-panel scroll. Tests mock rich body/preview/panel implementations, so they prove orchestration but not actual IME, selection or iframe behavior.
- Publishing captures an exact saved revision, rejects stale reviews and navigation changes, reuses publication operation identity for retries, and is disabled in local preview. Source validity, storage state and current publication gates remain. Server authoritative safeguards must still be separately verified.
- Import caps input bytes, snapshots edit generation and source before asynchronous read, and refuses to replace newly changed text. Restore replaces draft source as a new saved revision flow. Source editor remains mounted, supports Markdown/undo and read-only mode; structured parse failure retains source correction. No publication or test import was performed in this audit.
- Snapshot loading uses bounded requests and account-scoped recovery. Acknowledged saves clear local recovery; failures preserve it. The local scope comes from verified owner/server snapshot. A test pass does not prove deployed session scoping, multi-tab logout or unavailable storage behavior.
- Collection detail now uses shared `inventoryIdentity` for page families, resolving the earlier Pages editable-capability mismatch at source level. Private-only Writing discovery distinguishes unavailable 503 from absent/discarded 404. Public destination links are built only from public inventory policy; no draft is published by rendering. Full layout still loads its separate bounded inventory, so a failed direct private read can be followed by another inventory wait rather than one shared request-wide deadline.
- Admin diagnostic rows explicitly label evidence as requirements rather than queried machine/auth/deploy facts. Search and retained Inbox tests verify intended destinations and field matching; they do not prove provider data availability.
- Both layouts use the same theme prepaint resolver and generated token CSS; Admin CSS imports Instrument Sans. Editorial layout supplies owner scope and no-index metadata. Admin document title still differs (`Anipotts Admin`) from Editorial (`Admin`). The favicon is a self-contained SVG with paths and no external references/scripts; no visual size/contrast acceptance is inferred from reading its bytes.

| Additional file                                                   | SHA-256                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/components/astryx/AdminShell.tsx`                 | `800c0c2ff7387297039a00f47c5364ad6d179f2845c56d7faac4b7a3eb34b691` |
| `apps/admin/src/components/astryx/EditorialApp.tsx`               | `7ac02997ca999b7caaf252aef536691d2b7d986319f77cd05281a7a5d818b253` |
| `apps/admin/src/components/astryx/HomeEditor.tsx`                 | `abed004ea507d10bb67eabbfef7c93e201b19370a36e6eb74915461385d51c88` |
| `apps/admin/src/components/astryx/HomeEditor.navigation.test.tsx` | `48f5268fc962aa0f877c0c98aa32f09183f5281b90a3f0c00f4c6229d8820f93` |
| `apps/admin/src/lib/editorial-navigation.ts`                      | `bbfc872b82a569f377a4d52fd5433f9e4d7bd182c38a5ee663e36ac19b6450a3` |
| `apps/admin/src/lib/workspace-navigation.test.ts`                 | `6674f68486f755d6eea3acf98462910391dc2b746adbc61dedddcb34fe035776` |
| `apps/admin/src/pages/content/[collection]/[id].astro`            | `42cb47d5e4f7e5e113dee26278a63d0d26e38b737850c8790e06323b5ab23aa4` |
| `apps/admin/src/data/admin.ts`                                    | `1d97f231c47415e824a4017f2ac4314d303c028568d4becad87fc3ac0efdf6ae` |
| `apps/admin/src/data/admin-search.test.ts`                        | `b1ebef2de44d573cbb3b30439ac1ed6ec27a0474d4bb8a6e500e3e3182c1118a` |
| `apps/admin/src/data/inbox-route-parity.test.ts`                  | `970db33208b35f6f7d81177c427bda653f71377a8ebe0913125359a4350f7904` |
| `apps/admin/src/layouts/AdminLayout.astro`                        | `eb74389088c69d7943f5579f4b34cf56cc526931d73eda96af352776d64d364b` |
| `apps/admin/src/layouts/EditorialLayout.astro`                    | `c060e0068ba3c2c55fafad53ee2fd545c01700957996d665d2a690b48b8d439c` |
| `apps/admin/public/admin-bracket.svg`                             | `00a8ab8d0a44921bb6b4e017448153cd665c2baff7cf84ca23bebd11eb002f20` |

### Approved narrow follow-up verification

`/private/tmp/favicon-pages-regressions.log`: 74 tests pass in admin-access-policy and EditorialApp suites at 05:29:43. Only exact static favicon allowance and Pages heading mapping plus focused tests changed. Layout focus imports are concurrently owned elsewhere; their later hashes require reconciliation. No runtime auth action or release performed.

## Exact receipt reconciliation after focus changes

Added only `/admin-bracket.svg` to the route parity expected static path list; the route inventory contains handler files, not this static allowlist, and needed no invented handler entry. `pnpm test:admin-routes` passes; admin-access-policy has 58 passing tests at 05:36:18.

Promoted exact-current owning-agent source receipts or verified single-import layout deltas:

- `apps/admin/src/components/astryx/EditorialWorkspaceShell.tsx`
- `apps/admin/src/components/astryx/WorkspaceHeader.css`
- `apps/admin/src/styles/focus.css`
- `apps/admin/src/styles/focus.test.ts`
- `apps/admin/src/components/astryx/EditorialWorkspaceShell.test.tsx`
- `apps/admin/src/components/astryx/EditorialWorkspaceShell.mobile.test.tsx`
- `apps/admin/src/components/astryx/AdminShell.test.tsx`
- `apps/admin/src/components/astryx/EditorialApp.test.tsx`
- `apps/admin/src/layouts/AdminLayout.astro`
- `apps/admin/src/layouts/EditorialLayout.astro`

Receipt hashes that did not match were not promoted:

16 entries remain pending or hash-stale at this reconciliation:

- `apps/admin/src/components/astryx/AdminCommandPalette.tsx`
- `apps/admin/src/components/astryx/OperationalCommandPalette.test.ts`
- `apps/admin/src/components/astryx/OperationalCommandPalette.tsx`
- `apps/admin/src/data/inbox-route-parity.test.ts`
- `apps/admin/src/lib/admin-access-policy.test.ts`
- `apps/admin/src/lib/admin-access-policy.ts`
- `apps/admin/src/styles/editorial.css`
- `apps/admin/src/components/astryx/ObservabilityWorkspace.test.tsx`
- `apps/admin/src/components/astryx/ObservabilityWorkspace.tsx`
- `apps/admin/src/components/astryx/AdminCommandPalette.test.tsx`
- `apps/admin/src/themes/life.d.ts`
- `apps/admin/src/themes/life.js`
- `apps/admin/src/themes/life.variants.d.ts`
- `apps/admin/src/themes/operations.d.ts`
- `apps/admin/src/themes/operations.js`
- `apps/admin/src/themes/operations.variants.d.ts`

## Final visual receipt and policy reconciliation

Consumed 19 exact-current rows from final-visual-source-audit.md. Generated theme outputs are explicitly `producer-verified`, not represented as manual semantic reads. New CommandPalette.css is included; focus files were added in the prior owning-agent reconciliation. Full reread completed for current admin-access-policy.ts, its test, and scripts/ci/admin-route-parity.test.mjs after the favicon fix. These retain exact allowlists, GET/HEAD local-only previews, denied lookalikes and protected source routes. Parity source assertions classify every Astro/TS page, preserve retired auth handlers absent, and verify Life guarded reads; string assertions alone do not prove runtime authorization. Prior58policy tests and route parity pass at05:36:18 remain current for these bytes.

Policy/parity exact hashes:

| File                                             | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/admin/src/lib/admin-access-policy.ts`      | `a4c5e9ffe493900744241f37febb2b6a927fde76a381d94a94c173bc70fed768` |
| `apps/admin/src/lib/admin-access-policy.test.ts` | `5dddcab52354e831cdd72d04fa4517a1fdd698821e13668f7749401980b4cba4` |
| `scripts/ci/admin-route-parity.test.mjs`         | `7d41e5f9b936a4189a45d88675e2310eadb8eb5750879d85188c6d83de6e8b36` |

Remaining pending/hash-stale entries at this snapshot: 0.

Source accounting is distinct from completion: open logout/native-auth integration, unavailable Operations/Life capability evidence, final Browser interaction/geometry proof, checked PR/protected merge and deployed exact-target verification remain. No completion claim follows from zero pending source entries.
