# Admin geometry repair for PR 461

## Change

Writing opts into SDK controls inside the existing content shell. Shared navigation and gutters retain their original styles. SDK semantic tokens use Instrument Sans and the admin palette, control sizes and corners. The cascade places SDK resets before Astryx component geometry, preserving existing dialog insets and centering.

Both tables use one column layout calculation, including fixed widths, reservation, shares, visibility and container yielding. Summaries yield before titles; dates and headers keep their widths. Phone records use a stacked layout without duplicated metadata or horizontal scrolling.

SDK wrappers preserve caller refs, events and described-by relationships. A control with an owned delayed tooltip does not also display an immediate SDK or native tooltip. Menus and dialogs mount in their own scoped portal; the shared shell never receives SDK resets.

## Review evidence

Combined Pro preview for #461 and #464: http://127.0.0.1:4675/content/writing. The older mini preview on port 4935 is not the current acceptance target.

Private local captures and measurements are under `/private/tmp/admin-qa-v2/combined`. The latest library matrix compares Writing, Pages and Projects at 390, 768, 1032 and 1440px in light and dark themes. Expanded and collapsed desktop/tablet states are compared; the phone sidebar is not applicable. Shared navigation positions remain stable and neither table has horizontal overflow.

Synthetic local checks exercise typing, formatting, undo/redo, saving, reload, preview and compact publication review. The local preview does not permit production publication. Private records and production reader connectivity are not established by these synthetic checks.

Collection preloads keep cold SDK/component transforms outside timed test setup. Per-case module resets, assertion timeouts and default worker concurrency remain unchanged. The final PR description records the exact validation result for the reviewed head.

## Release hold

This chat owns integration of both admin PRs. Ani's visual acceptance and required checks on the exact head are still required before merge and deployment. Source changes and local browser proof do not establish production state.

Public-site work remains separate from this admin repair.
