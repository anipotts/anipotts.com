# Admin geometry repair for PR 461

## Change

Writing opts into SDK controls inside the existing content shell. Shared navigation and gutters retain their original styles. SDK semantic tokens use the admin font, palette, control sizes and corners. The cascade places SDK resets before Astryx component geometry, preserving existing dialog insets and centering.

Both tables use one column layout calculation, including fixed widths, reservation, shares, visibility and container yielding. Phone records retain their compact title/status/time layout without duplicated metadata.

## Evidence

Pro preview: http://127.0.0.1:4739/content/writing

Private local captures: /private/tmp/admin-geometry-proof. Before/after library and editor captures use a 1032px viewport. Final hydrated library inspection covers 390, 768, 1032 and 1440px with explicit light/dark and both sidebar states. Phone layouts omit the desktop sidebar. All 48 states have no horizontal overflow or SDK boundary enclosing navigation. Final desktop navigation positions match between Pages, Writing and Projects in each compared state. Saved root sidebar hints can lag actual rendered sidebar state; captures and hydrated controls supply visual evidence.

Synthetic draft checks passed typing, bold, undo/redo, local save and reload. Compact publication review opened with local publishing disabled. Review dialog padding was visibly restored after correcting layer precedence. No production content was changed.

84 focused integration tests passed. CSS cascade and recovery regression checks passed 29 tests. Full validation passed formatting, build, typecheck and the other workspace checks but hit admin setup timeouts under unrestricted parallelism. The full admin suite passed with two workers: 1,990 tests across 153 files. Separate Astro and editorial runtime suites each passed 73 tests. No application behavior was changed to accommodate the timing failures.

## Release hold

Mini confirmed the branch was clean at 79673e420a190c65bf307c039565ddf99da3934d and delegated integration here. No merge or deployment until Ani accepts the repaired visuals and exact-head required checks pass.

Public-site PR 463 remains separate. Its owner reported build, 139 tests and responsive alignment checks passing, with changes pushed and no merge or deployment. Remaining obligation is Ani review and required checks before integration.
