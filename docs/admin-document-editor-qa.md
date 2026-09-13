# Admin document editor verification

Status: local implementation, release blocked on remaining browser QA.
Scope: admin UI and private preview only. No public writing, assets, publishing
permissions, authentication behavior, or unrelated workers are changed.

## Implementation

The writing editor uses a centered 720px document column, one locally editable
title, compact subtitle, document body, sticky actions, and a Properties disclosure.
Text fields buffer local typing and serialize at save boundaries. Existing
revision checks, one-in-flight/coalesced saves, and operation identities remain.
Autosave waits 600ms after input with a three-second maximum wait. Recovery is
scoped by origin, account, and record and cleared on logout.

Text selection exposes formatting. Links use an Astryx selection-anchored overlay
with a native form, Enter submission, dismissal, and focus restoration. Article
images support private uploads and cropping while keeping originals. The editor
caps images at 240px tall. Preview renders the saved draft in a sandboxed frame;
card preview is optional. Unsupported content retains the Source fallback.

## Verification performed

- Real local title typing/deletion updated the editable title, breadcrumb, and
  browser title immediately. The originally reported completely unresponsive
  title was not reproduced; stale headings were identified and fixed.
- Real body typing/deletion followed by Preview preserved the saved source.
- Local private office-photo crop was applied through the editor. Its original
  remains private and unchanged. No draft was published.
- Offline save failure retained text and exposed retry. Opening the record in
  another tab recovered the unsaved title; the temporary test edit was reverted.
- Desktop, tablet, mobile, and light/dark inspections found and corrected sticky
  header overlap and mobile gutters. These observations predate the link overlay.
- Three DOM interaction tests cover immediate title typing/deletion, deferred
  commit, explicit equal-value restoration, and ordinary unchanged rerenders.
- Save scheduler, recovery parsing/scoping/logout, and autosave race tests run in
  the normal admin test suite. Code review identified and fixed stale downloads,
  concurrent import edits, replacement/unmount buffers, and abandoned review races.
- Astro check after link overlay integration: zero errors and warnings, two
  existing beforeunload deprecation hints.

## Remaining release gates

The in-app Browser Node REPL tool became unavailable in this Codex session.
Do not substitute unrelated browser sessions or interpret static checks as live
interaction proof. Remaining gates include the overlay's actual positioning,
Enter/Escape/focus, paste/drop and cancellation, slow-save/two-tab conflicts,
expired sessions, reduced motion, responsive touch targets, console errors, and
caret/render performance. Real IME input was not verified: the in-app CDP runtime
rejected Input.imeSetComposition as unsupported.

The jsdom development dependency changes the shared lockfile. Inspect deployment
classification and use the explicit admin-only lane; never allow unrelated target
fanout. No release SHA, PR, deployment run, or live verification exists for this
change yet. Keep the managed localhost:4311 preview running.
