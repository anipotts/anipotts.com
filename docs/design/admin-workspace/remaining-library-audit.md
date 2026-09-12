# Content library and creation audit

Audit date: 2026-09-12. Scope: the 19 exact source/test/route files below, read in full. The follow-up changed only interface copy and the partial-inventory recovery control. No private records were read or changed during this audit. The layout and content-library-state helper were read as integration context; this receipt does not claim a fresh full audit of their dependencies or authentication middleware.

## Findings requiring follow-up

1. **Fixed: persistent partial-inventory failure now has one recovery action.** `EditorialApp` owns the warning and a Reload button whether records remain or not. The library no longer duplicates a Retry button for the empty failure state. Published rows remain available and unchecked draft state stays explicitly unavailable. Both partial and empty failure markup are covered by new tests.
2. **Fixed: inventory reads share a 15-second total deadline.** A four-worker queue includes writing and non-writing reads, so a stalled writing list does not block other available snapshots. Results completed before the deadline remain visible; unread/timed-out state stays unavailable. No queued read starts after expiration. Timers clear after success or failure. Storage has no abort interface, so underlying reads may finish later; handled race results cannot mutate the returned inventory. Regression first failed with an unresolved result at 15 seconds, then passed with completed home metadata preserved, late resolve/reject ignored, and concurrency/queue limits enforced.
3. **Fixed: small copy inconsistencies.** Removed the redundant NewWriting introduction without changing title/slug behavior. Empty creation actions now say “New article.” Generated boolean/metadata labels use sentence case; user-authored values remain unchanged, covered by a regression test.
4. **Browser acceptance remains open.** Fixed 160/112-pixel decision/date columns, CSS-hidden mobile duplicate cell content, recent cards, and real menu focus/overflow need requested Browser verification. Static markup assertions do not establish touch target size, absence of duplicate focusable controls at a breakpoint, or visual correspondence to the approved mockup.

## Verified source behavior

- The library uses installed Astryx Table, DropdownMenu, Timestamp, EmptyState, TextInput, and Button. Sorting is deterministic: attention priority, then update time, then title and stable href. Search filters title/summary/section without modifying record text. URL state changes preserve useful filters; search replaces history and other changes push history, with popstate restoration.
- Overview's recent area uses up to three acknowledged private/local edit timestamps, excludes Git-only updates, preserves the record title, and links directly to the document. It is hidden for search or a non-default status filter. This is evidence of saved/local work, not last opened or unsaved session state.
- The decision model separates unpublished drafts, changes to visibility, unpublished edits, hidden records, and unchanged public records. An unavailable private inventory does not label unchecked published rows “Up to date.” Newsletter review-only rows do not gain editing/publishing actions. Review links change the document view only.
- Inventory projection selects latest non-discarded revisions, rejects invalid record identities, adds valid private-only writing drafts, preserves published visibility and Git provenance separately from intended draft visibility and private dates, and returns metadata rather than raw draft source/base hashes/media/history. Malformed or empty title drafts stay discoverable through published metadata. Semantic field summaries use validated source and do not claim complete diffs when unavailable.
- Save events validate bounded metadata and positive revision numbers; old/duplicate/unrelated events do not overwrite a newer mounted inventory. Only matching editorial records/search results update; status and URL stay stable. Raw source/status fields supplied in an event are ignored. This is same-window metadata refresh, not cross-tab synchronization proof.
- The server loader requests editorial storage only, preserving successful private snapshot reads when other reads reject. It does not query Operations or Life. `writing-inventory.ts` is a compatibility wrapper over the canonical projection, suitable for compatibility-only disposition.
- NewWriting scopes recovery through the server-provided owner scope and origin-local storage. It does not adopt legacy unscoped text or another scope. Same-tab and cross-tab logout clear displayed creation data, disable controls, abort active requests, and stop repopulating recovery. Creation locks duplicate submissions synchronously, retains request identity on ambiguous failure, applies CSRF and 15-second transport deadlines, and clears recovery only after a successful draft response. Custom slugs remain independent after deliberate editing. This creates a private draft, not a publication.
- Content index supplies the server projection to the shared layout; new article delegates to the shared creation screen. Newsletter uses the existing newsletterDrafts collection and maps only review metadata/body/claims/sources. A missing newsletter slug sets HTTP 404. No send or publish operation was introduced by these routes.
- Integration context: EditorialLayout supplies noindex metadata, current theme, shared search inventory, and the established single-owner recovery scope. Authorization remains the middleware's responsibility; this audit does not establish authenticated live access or broaden that boundary.

## Verification

Executed the existing seven focused suites: ContentLibrary, EditorialApp, EditorialApp.inventory, NewWriting, content-decision, editorial-inventory-events, and editorial-inventory-projection. **48 tests passed across seven files.** Evidence: `/private/tmp/remaining-library-audit-tests.log` (04:37:29 run). Expected jsdom canvas notices appeared; no test failure. No draft publishing, real creation, provider change, or Browser substitution occurred.

The tests cover deterministic/filter ordering, initial URL state, unavailable versus empty, recent-work provenance, review-only capability, immutable source-free projection, malformed/discarded drafts, semantic field comparisons, partial failed reads, newer acknowledged metadata, scoped recovery/logout, duplicate submission suppression, and stable retry operation identity. The deadline follow-up adds never-resolving inventory and late rejection coverage; it does not cover real browser Back/Forward transitions, successful creation navigation, live authentication, visual geometry, or actual private provider access.

## Source identity

SHA-256 at audit time. A subsequent edit requires renewed review of that file; this document does not mark unresolved findings complete.

| File                                                               | SHA-256                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/admin/src/components/astryx/ContentLibrary.tsx`              | `bbbf7c81349b77849ddcc5eaf47351e9fa4026e8f4033946d02610eeff3ef45c` |
| `apps/admin/src/components/astryx/ContentLibrary.test.tsx`         | `da320289e2ee7b867713ae76b401c6bcf08b8c5869d4783848a5f52befb117a8` |
| `apps/admin/src/components/astryx/EditorialApp.tsx`                | `fdd7f1ad49eab1e23401120c8844c588705793b202a3b8e924dace2cec4fcfad` |
| `apps/admin/src/components/astryx/EditorialApp.test.tsx`           | `b7ce2cd091d874d85c33e17529202f17b1e302f2c4498e3fa0220cd66275dfa2` |
| `apps/admin/src/components/astryx/EditorialApp.inventory.test.tsx` | `4a58725c198b7e581bebbd727426549453074f10f11143ba88ba558f963f9fd3` |
| `apps/admin/src/components/astryx/NewWriting.tsx`                  | `704e105b9a313cff80de96e41950ae28a2feeee2ae53ac9b63449739f0d0c8b6` |
| `apps/admin/src/components/astryx/NewWriting.test.tsx`             | `47033365411f67cf3099fe0476dfbf0986216732a079b6ec53e8e61115e72b50` |
| `apps/admin/src/lib/content-decision.ts`                           | `82bd6cb8db7927d221b207737e9dc2f5e38928d02cc7cf62b9f982c431c61638` |
| `apps/admin/src/lib/content-decision.test.ts`                      | `97b07961668e3bdfbba147453eb2e9048c49b045f11a6c975d5643f162124efe` |
| `apps/admin/src/lib/editorial-inventory-events.ts`                 | `80087c0e596c5d177487d97c59694b95a88243437626ba90e8cd350f3649be69` |
| `apps/admin/src/lib/editorial-inventory-events.test.ts`            | `c67176b359ae0503d8b8efbf58a70f2770681b659b6ed34b291facefb2afa842` |
| `apps/admin/src/lib/editorial-inventory-projection.ts`             | `54cd9643371e45e9d7c509df7a06946e719a27cdd641cd31499a78d0e100b95c` |
| `apps/admin/src/lib/editorial-inventory-projection.test.ts`        | `6ba968ec9f4d98f9d1aab86e1876ed87bb45f7d03f1da35ef0a6a08fd87a6133` |
| `apps/admin/src/lib/editorial-inventory-server.ts`                 | `74e05919e1f85073e430d1cf5cb935001c39cf32c12bc73b3d8efb46a7ed1b4e` |
| `apps/admin/src/lib/writing-inventory.ts`                          | `c0c71ff05df3728de1ccc6924fdc10ef142fcf22acff19c8163373211284fb8a` |
| `apps/admin/src/pages/content/index.astro`                         | `123d91f9c1aa6decae46819f29509801cc0726a8cc3eac0926055999ce8fc530` |
| `apps/admin/src/pages/content/new.astro`                           | `7eee2e69be404488c0d3d2b2cc9eed2901ba5a907f49c63dc0b14b49f6bd227a` |
| `apps/admin/src/pages/newsletter.astro`                            | `be161139a9abeab457acf4ccf82cc1781b65a43aed6480175293d0498be68dfd` |
| `apps/admin/src/pages/newsletter/[slug].astro`                     | `5d908f5cec08a56a5049647e07a0206b583d440ce8622d764b772fb50368c07e` |

## Inventory deadline follow-up

`/private/tmp/inventory-deadline-before.log` records the failing never-resolving test before the fix. `/private/tmp/inventory-deadline-tests.log` records **21 passing tests across three affected suites** at 04:42:23. These include the unchanged projection/partial-failure cases plus deadline, late-resolution/rejection, queue and concurrency regressions. No storage writes or auth changes were introduced.
