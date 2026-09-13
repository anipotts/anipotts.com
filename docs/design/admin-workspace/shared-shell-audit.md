# Shared shell source audit

Reviewed 2026-09-12 against HEAD `4459b3d1af7623b53f293bfe5241db81e5791b18` plus the current working tree. This audit owns this document only. Both layouts have concurrent favicon edits; those bytes were read and preserved. This is source and automated-test evidence, not live authentication, browser, or deployment verification.

## Exact reviewed bytes

Paths are repository-relative; hashes are SHA-256. These hashes identify the audited snapshot, not a claim that later concurrent changes are included.

| File                                                             | SHA-256                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/layouts/AdminLayout.astro`                       | `8d8a74a073b4966e4359e2d453e0e0d1822185e2cc2be2d9f78be0f5a13d69a9` |
| `apps/admin/src/layouts/EditorialLayout.astro`                   | `a18abb6d9eb82b2764258e842966703bcd23d11920da44719de520dcd9c83b02` |
| `apps/admin/src/components/astryx/EditorialWorkspaceShell.tsx`   | `3e0f4dbed657f2c8d23ec32c2322b85c33f89fcd695eb9dbee66c54d72674012` |
| `apps/admin/src/components/astryx/AdminShell.tsx`                | `0711ddb3ec277d2914395e0ed993b3db31bc21b53692013bd37ef47f3b3b4451` |
| `apps/admin/src/components/astryx/EditorialApp.tsx`              | `fdd7f1ad49eab1e23401120c8844c588705793b202a3b8e924dace2cec4fcfad` |
| `apps/admin/src/components/astryx/AdminCommandPalette.tsx`       | `d66f7f86e38d7cfe400626952e792f7213ed9a2695eb0efbce53a30eb2609eb9` |
| `apps/admin/src/components/astryx/OperationalCommandPalette.tsx` | `66efdeb442ff248c1256d855f57ecd2f56e75289fa4504d277cff6a648351126` |
| `apps/admin/src/lib/workspace-navigation.ts`                     | `1bdc00ae299a752f2d0db0d48e1501266eadc7ee31d12ecd287edd55da482d76` |
| `apps/admin/src/lib/editorial-inventory-server.ts`               | `74e05919e1f85073e430d1cf5cb935001c39cf32c12bc73b3d8efb46a7ed1b4e` |
| `apps/admin/src/middleware.ts`                                   | `73d7f90508a4fd01f87d6af5c14656cdc72b0eb0cd6aaa900fca15c4a92643f3` |
| `apps/admin/src/lib/passkey-auth.ts`                             | `79fe053fda9fccab845eab63573f9cc09d60e9371771fcebc5ed4d3b9b55a967` |
| `packages/brand/src/theme.ts`                                    | `bbf4d7b062a629c6594092b2f70642158833efcf71a040439b607361c0450572` |
| `apps/admin/src/styles/editorial.css`                            | `1ebbb949f361fd83f1a608cb6dbbb4311b7896965e10e9acb3a813909af8a23d` |
| `apps/admin/src/styles/admin.css`                                | `ee8adf82a6719da935cd94aa52b9bbd628f0d5270b7d2f4dadf304c525ce1b4b` |
| `apps/admin/src/themes/editorial.ts`                             | `d8f2c1c25b33f53279b28bde2a930969afcaaf9e2c7ba8672c3797b1945f3814` |
| `apps/admin/src/themes/operations.ts`                            | `bbe6720b71395eb4983134d5d017aacb3fe83188c369ab4035e6d3e21d08dcb0` |
| `apps/admin/src/themes/life.ts`                                  | `0ebab34fa867d187a335c1504777d68803949e4ae4de2e08fd565c5a16b7d72a` |
| `apps/admin/src/themes/workspaces.ts`                            | `4ab7a77dbf74faf285f6493b41f0639aeeedbcd54a47cde8cd0c2546b64b953a` |
| `apps/admin/src/themes/editorial.generated.css`                  | `9885efda763a7594b857b15451bb287b07c36e42a0646f6f9a8a14dc9a43c68b` |
| `apps/admin/src/themes/operations.generated.css`                 | `2f809aa408651da41f0ae4b4a9c1bb12ec2ce9f3e284f14527d280a21d2787e6` |
| `apps/admin/src/themes/life.generated.css`                       | `cc0be7e3397177ca1b8a15934b4922b95fbafef940a7ef4e8794bfd0d54bbfef` |

## Architecture and verified boundaries

- Both editorial and operational/Life surfaces use EditorialWorkspaceShell. The installed Astryx AppShell uses fill height, independent main/sidebar scroll containers, and its own responsive mobile drawer. The shared header has identity/toggle and workspace/search rows; mobile suppresses search and retains native navigation control. Native collapse context persists a user choice in `admin:sidebar-collapsed`, with the prior editorial key as a migration fallback.
- AdminShell supplies workspace navigation and its palette. Editorial default palette receives inventory entries and no operational loader. Life supplies static section navigation entries and does not mount OperationalCommandPalette. Operations loads only its existing inbox, knowledge and runtime-feed adapters. Moving a navigation link does not move the server authorization boundary.
- EditorialLayout obtains the private inventory on the server via loadEditorialInventory. Middleware checks the explicit editorial owner for the entire editorial/preview namespace before the layout runs. Operational/Life routes use their existing retained Access principal/native session path. The explicit dev preview gates remain separate. No shared-shell source grants authorization.
- Workspace destinations are same-origin local paths from a closed workspace-specific route allowlist. Persisted query state permits only bounded navigation filters; free-text search, payload fields, item identifiers and fragments are discarded. These preferences are stored in sessionStorage, not copied into another workspace's API query.
- The theme definitions retain common neutral document/popover/status/font tokens. Workspace accents and shell-local sidebar tints are independent. The custom sidebar property is generated through Astryx's app-shell component style map, not an unknown framework token or type assertion. Built CSS is loaded alongside built theme JS.
- Light/Dark/System are direct single-selection controls. Astryx Theme explicitly handles system color-scheme and removes the root data-theme override in system mode. The shared icon-only controls have labels/tooltips in source. System mode must be reviewed alongside the legacy prepaint/bootstrap CSS described below.

## Actionable findings

### SS-1: Shared logout does not handle both accepted authentication paths

**Priority: high; source-confirmed integration gap.** The footer always links to `/cdn-cgi/access/logout`. Middleware also admits Operations/Life via a native admin session. The native revocation function is `logout` in `lib/passkey-auth.ts`, which revokes the session and expires its cookies; the shared footer does not invoke that path. A Cloudflare logout alone is not evidence that the accepted native session has been revoked.

There is a second concrete gap: editorial recovery clearing is attached by EditorialApp's document click listener. The same footer rendered through AdminShell has no equivalent cleanup. Leaving a content draft, switching to Operations, and choosing Log out does not execute that editorial listener on the new page.

Recommended follow-up: coordinate the existing authentication/logout owner to select or compose the appropriate existing logout behavior, clear owner-scoped recovery from a shared boundary, and test native-only, Access-only and combined sessions. Do not alter credentials or access policies as part of this source audit. Until then, do not report a complete shared logout guarantee.

### SS-2: Initial appearance uses conflicting sources

**Priority: medium; concrete source inconsistency, visual impact unverified.** AdminLayout calculates initialMode from URL then `ap-theme` cookie, but its prepaint script chooses localStorage (`theme`/legacy key) then OS, ignoring that URL/cookie decision. The client savedTheme helper returns URL then cookie then localStorage. With an explicit dark cookie and stale light localStorage, the prepaint root is light while the SSR provider is dark. EditorialLayout has no corresponding root prepaint synchronization.

Recommended follow-up: use one validated precedence contract for server initialMode, prepaint root attributes and client initialization. Add contradictory cookie/storage/query cases and screenshot the initial paint under slow hydration.

A previous suspicion that System always leaves a stale root data-theme was rejected after reading Astryx's `useRootThemeSync`: it removes that attribute for System. Remaining checks should focus on legacy `admin.css` forcing `html { color-scheme: light }`, and the ordering when `savedTheme()` consumes `?theme=system` and calls saveTheme after the child Theme mount effect. These are source-supported follow-up cases, not proven OS-toggle failures.

### SS-3: Global search navigation skips the editor's explicit flush flow

**Priority: medium; source-confirmed behavior difference.** AdminCommandPalette selects a result through `window.location.assign(href)`. Workspace/sidebar destinations are ordinary links. They rely on the active editor's beforeunload/recovery behavior, while record-local navigation has a dedicated asynchronous flush/generation path. This is not proof of lost drafts, but it does not demonstrate the plan's normal successful navigation without unnecessary confirmation or waiting for the browser's unload boundary.

Recommended follow-up: provide a shared optional navigation delegate from the editorial owner that completes pending flush/recovery before navigating. Preserve native fallback for non-editor pages and test palette, workspace switch and browser navigation with dirty and failed-save drafts.

### SS-4: Palette focus and live-result lifetime lack direct interaction coverage

**Priority: medium.** Closing AdminCommandPalette unconditionally calls the saved opener's focus method. Unlike SelectionOverlay's guarded restoration, it does not check whether another input has already gained focus. Test outside-click dismissal and retry remount before claiming no focus theft. Operational results are cached for the palette's mounted lifetime; one source failure rejects the whole live result set and leaves navigation with a warning. This is truthful feedback, but successful partial sources are dropped and later changes require a reload/retry policy.

Recommended follow-up: mounted real-Dialog tests for Escape/outside focus, then a deliberate refresh/invalidation policy with status/provenance rather than silently displaying indefinitely cached runtime data.

## SSR, responsive and accessibility risks requiring Browser

The collapse preference and viewport default resolve after mount. `useMediaQuery` in installed Astryx uses a false server snapshot by default; the shared rail state also starts expanded. Tests demonstrate client DOM behavior, not absence of first-paint sidebar movement. Confirm mobile startup with scripts/network throttled, persisted desktop/rail states, rotation and breakpoint crossing.

Current CSS deliberately sets the page overflow hidden and delegates scrolling to the fill shell. Review long mobile drawers, keyboard focus into content, anchored overlays, restored editor scroll and expanded top inset at 200% zoom. Reduced-motion overrides exist for shell transitions. CSS dimensions are not measured screenshot evidence. The native mobile header and the user's explicit no-mobile-search decision must be judged together in the actual app.

## Checks performed on this snapshot

- `pnpm --filter @anipotts/admin exec vitest run` for AdminShell, EditorialWorkspaceShell, mobile shell, OperationalCommandPalette adapter, workspace-navigation and workspace themes: **28 passed across 6 files**.
- The jsdom run emitted unimplemented canvas/scrollTo notices. Those APIs are not browser proof; the tests still passed their structural/event assertions.
- `pnpm --filter @anipotts/admin theme:check` **failed** on stale `operations.d.ts` and `operations.variants.d.ts`. Editorial outputs passed; the chained command stopped before Life. Rebuild the generated declarations under the theme owner, then rerun this gate. This audit did not regenerate them.
- Existing tests cover navigation selection, absence of operational loader in Life/auth shells, local/foreign return paths, mobile search absence, collapse persistence, direct appearance controls, color contrast and source-failure distinction.
- No current direct test proves authenticated server rejection/acceptance, root-theme first paint, real palette focus restoration, OS theme transitions, main-scroll geometry, or live deployment. Prior task checks are not repeated here as current proof.

## Disposition

No code, styles, layouts, theme artifacts, credentials or ledger entries were modified by this audit. Shared-shell source coverage is recorded; SS-1 through SS-4 and Browser checks remain explicit integration work. This document does not declare the admin goal complete.
