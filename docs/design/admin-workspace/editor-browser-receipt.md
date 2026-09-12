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
