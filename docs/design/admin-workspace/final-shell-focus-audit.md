# Final shell, header and focus source receipt

2026-09-12; base observed `4f6dd6375c8e9a93e6f5875060cf60d92b0d8687`.
This is a full source review of the files below, including the complete shell,
header stylesheet, focus policy and test files. Concurrent integration changes
remain outside this receipt. No Browser acceptance or release is inferred.

## Reviewed behavior

- Expanded header renders a centered `[admin]` identity, native collapse control
  on the left and accessible Visit site link on the right. Rail state omits the
  wordmark and Visit site. Mobile omits Search and desktop collapse, retaining
  native drawer navigation. Sidechat's approved display font is retained.
- Workspace selection uses existing allowlisted return-path helpers and current
  session destinations. It introduces no data provider or authentication access.
  The expanded popup measures its trigger on open; compact popup uses its own
  width. Popover's extra padding was removed so the child stack supplies one
  padding layer. Scoped width/min-width/box-sizing rules defeat the older fixed
  switcher width and contain row hover backgrounds.
- Theme controls remain one-click Light/Dark/System. Outer-only segment corners,
  right-side sidebar tooltips and expanded theme tooltips above are preserved.
- Width animation belongs to the outer sidenav wrapper; the inner nav stays at
  100%. The approved compact width expression is 36 + 8 + 8 = 52px under the
  current spacing scale. The existing duration-fast token supplies the intended
  125ms transition. Reduced motion removes it. Stationary icon padding is
  retained; no animation geometry is claimed from DOM tests.
- The shared focus policy is imported after editorial.css in both layouts.
  Astryx focus-outline-color uses theme secondary text, keeping its width/style
  and offset tokens. Normal input boundaries are neutral; validation-status
  borders and shadows are not overwritten. Wrapped inputs get one parent ring;
  inner inputs do not draw a redundant ring. Plain keyboard focus remains
  visible. Forced-colors uses CanvasText. Palette's more specific input-row
  styling is owned separately and must be verified together in Browser.

## Review findings and remaining validation

No further implementation made after this review request. Earlier duplicate
primary-row/wordmark declarations were consolidated without changing the final
values. Remaining breakpoint-specific overrides are deliberately retained until
measured Browser evidence justifies removing them.

Source/style tests cannot prove popup positioning, focus contrast, font loading,
or clipping. Root's Browser checklist should include expanded and collapsed
workspace popup hover rows, viewport-edge placement, 390px mobile drawer,
930px rail, expanded desktop, rapid collapse reversal, reduced motion, native
Tab focus through portals, pointer focus, and invalid field styling. Numeric
3:1 focus contrast has not been measured in this tranche.

The popup width is measured when opened rather than continuously while open;
resize an open menu during Browser QA. The rail intentionally omits Visit site
per the approved design. Header brand spans are identity typography, not new
layout scaffolding. Raw legacy numeric icon/rail values retained here belong to
the approved measured design, not evidence of complete token migration.

## Checks executed

- EditorialWorkspaceShell.test.tsx, EditorialWorkspaceShell.mobile.test.tsx,
  AdminShell.test.tsx and EditorialApp.test.tsx: **31 passed**.
- focus.test.ts: **2 passed**.
- Existing jsdom canvas/scrollTo notices appeared in the shell integration run;
  they do not establish browser failures or successful native rendering.
- Updated stale assertions retain accessible `[admin]` identity and Visit site
  link checks, including its URL, new-tab target and noopener/noreferrer.
- Focus and popup containment tests are source contracts; mobile tests mount
  real Astryx components with dialog/media browser APIs supplied by jsdom mocks.
- No full build, type check, deployment, or publication was performed here.

## Exact SHA-256

| Repository-relative file                                                 | SHA-256                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| apps/admin/src/components/astryx/EditorialWorkspaceShell.tsx             | bb4640cbd17447355e0dbbca35eb057640f576ee940fce4f87e4e8c95c8682e4 |
| apps/admin/src/components/astryx/WorkspaceHeader.css                     | 89adf73bd8af8d059d06037e3ac893335aa8837f8dfd37292e2c0bc005e9d660 |
| apps/admin/src/styles/focus.css                                          | 2fcdb505aec7c4ff6820cd266d74a03cfdaf44a0ffb3ea523b38ab1638dd9a77 |
| apps/admin/src/styles/focus.test.ts                                      | 6cc835614e20f7c325a97e5094584d438069fb41eeee4662813ca36447bf280e |
| apps/admin/src/components/astryx/EditorialWorkspaceShell.test.tsx        | 9fba98df765d939d001dc96304c33c9a0c283f48c6528060e8b2358c956904a3 |
| apps/admin/src/components/astryx/EditorialWorkspaceShell.mobile.test.tsx | f539221d75e065f8d2a6acdfe63a748ee83418d1bc7d84ae38c4df87d981deaf |
| apps/admin/src/components/astryx/AdminShell.test.tsx                     | 266b905e4a051dec7877b1f035868c170f4c0a872d2193b3e3c16e264d7daeb5 |
| apps/admin/src/components/astryx/EditorialApp.test.tsx                   | cb45d6ab68d242096b249ed9e04a0cf8149bd619d5d44c92bf388fdc58fa8faf |

## Coarse tablet delta

After root measured 792px touch emulation, the collapsed rail now uses 4px
wrapper insets and 44px square navigation/theme targets inside its unchanged
52px outer width. The header already uses 44px coarse targets. This override is
restricted to min-width 768px and pointer:coarse; desktop pointer and mobile
drawer rules are unchanged. Expanded header alignment is not changed in this
bounded correction. Root owns measured acceptance. Two shell suites passed
**9 tests** after this delta; earlier broad validation predates it. The two
affected hashes above have been refreshed.
