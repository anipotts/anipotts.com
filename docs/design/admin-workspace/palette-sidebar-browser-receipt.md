# Sidebar and palette follow-up

2026-09-12, managed localhost:4311, actual Chrome DevTools browser interactions.
This is local evidence, not production or exact-release proof.

- Expanded Content and Life workspace menus measured 184px wide, matching their
  triggers. Each row was 168px wide with equal 8px insets and 44px height. Menu
  scrollWidth equaled clientWidth. Screenshots confirmed backgrounds stayed
  inside the popup in light and dark appearance.
- At 390px mobile width, the Life drawer showed readable navigation with 44px
  targets, no global search, and contained appearance segments. Its workspace
  menu matched the 243px trigger and had no horizontal overflow. Selecting
  Operations navigated to the Operations workspace.
- At 1440x900, the palette stayed at x420/y190, 600x520. Empty query and a typed
  query both measured the input row at x421/y191, 598x68 and its text field at
  x461/y215, 475.21875x20. Clear has reserved space; neither field position nor
  width changed. A no-match query retained the same panel dimensions.
- Computed backdrop-filter was none. The backdrop tint was approximately 15%
  black in light mode. The native blue nested input outline was absent.
- Operations started with Overview, Machines and Loops. Typing Loops, then
  ArrowDown and Enter, navigated to the actual Loops view. This did not change
  any loop or connection state.
- Escape returned focus to Search. Tab moved to Overview with a visible neutral
  2px focus outline in dark appearance. Dark palette screenshot showed a neutral
  surface and concise unavailable status with Retry rather than a yellow banner.
- Full Admin Vitest after these integrations: 87 files, 519 tests passed.
- Follow-up at 792px with touch/coarse-pointer emulation: all collapsed header,
  navigation and appearance controls measured x4, width44 and height44. Their
  centers align at x26 inside the unchanged 52px rail. The final coarse-only CSS
  adjustment passed nine focused shell tests after the broader validation run.
- At 792x783, the settled palette measured x96/y131.5, 600x520, with no horizontal
  overflow and an internally scrollable result region. Repository
  `check:changed --working-tree` passed before the final coarse-only adjustment.

Still open: full three-workspace query/overflow matrix, reduced-motion browser
emulation, touch-only tablet behavior, native upload-tool access, authenticated
production interactions and release verification. Earlier HMR interruptions
were excluded from settled interaction claims. No content was published.
