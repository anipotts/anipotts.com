# Editor browser receipt

2026-09-12, managed localhost:4311, Chrome DevTools browser tools. Local synthetic
QA record `/content/writing/admin-qa-september-12` was created through New article
and remains a recoverable private local draft. No content was published.

Observed:

- Title clicked and typed directly; Backspace and subsequent typing changed the
  visible title. Browser fill replaced its full value. The automation's Meta+A
  and Control+A calls did not select the full value, so native shortcut-based
  selection replacement remains unverified rather than counted as passing.
- Typed a subtitle and body into their actual contenteditable surfaces.
- Preview rendered the acknowledged private revision with the typed title,
  subtitle and body. Returning to Edit retained the text and restored body focus.
- With network emulation Offline, title typing remained immediately visible with
  focus and caret in the textarea. Save failure rendered one Retry save action;
  it did not claim Saved. Returning online and clicking Retry save acknowledged
  the same text. A subsequent reload restored title and body from local storage
  service. The record URL remained unchanged while its title changed.
- Final title: Admin QA: typing and recovery offline. Body is an explicit private
  QA note. This receipt stores no user-authored draft payload.
- A stale Vite dependency graph initially failed resolving RecordPanel's Dialog
  import after the pnpm patch installation. Touching the existing Astro config
  triggered the native watcher restart; the editor then loaded. The managed
  preview process remained running. This transient failure is not hidden as a
  successful first-load check.

Still open: native IME, native selection shortcuts/undo, long-body caret and scroll
preservation, slow continuous saves, two-tab conflicts, session expiration/logout,
image paste/drop/crop/placement, full keyboard and live authenticated verification.
This receipt is not production or release evidence.

## Navigation follow-up

The active synthetic draft was renamed to `Admin QA: navigation recovery`. With
Chrome DevTools offline emulation, clicking the actual Overview sidebar link
kept the record URL and edited textarea value, showed the save-before-leaving
message, and exposed one Retry save action. After restoring networking, clicking
the same link completed the save and navigated to `/content`; Overview displayed
the new title. No publication action was invoked.

Twenty focused navigation, mounted palette focus/IME and admin appearance tests
passed after this change. Full release verification remains open.

## Shared shell follow-up

Life dark appearance matched an explicit dark URL over stale light local storage.
At desktop1440×900, collapsing put the panel at y0 and the expand control at y8,
with body height900 and window scroll0. At mobile390×844 after the responsive
transition settled, main was x0/y56/390×788 and global Search was absent.

The real mobile drawer initially clipped Admin. The shared CSS correction was
then verified visually: identity y12/height44, workspace menu target44×44 at y65,
no horizontal overflow, and the header separator below both rows. The compact
topbar remained intact. This verifies settled geometry, not frame-perfect first
paint or a complete reduced-motion/keyboard matrix. Browser returned to desktop
1440×900, automatic color-scheme emulation and System appearance afterward.

The work listing page route `/content/workPage/work` now uses the same validated
editor identity as the inventory. Browser inspection confirmed its saved-state
indicator, Heading/Introduction/Search fields, Edit/Preview tabs and Review
changes action. No authored field was changed. Other page-family mappings have
a focused identity regression; their complete Browser flows remain open.
