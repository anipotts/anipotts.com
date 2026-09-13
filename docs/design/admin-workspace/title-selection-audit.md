# Title and selection ownership audit

Reviewed 2026-09-12. Complete source review covers the six files below. Their parent controllers and Astryx internals are separate audit scopes.

- DocumentTitle keeps text and pending/committed values locally. Each change immediately updates the visible title callback and dirty notification; commit waits for flush. Same-value parent renders preserve local typing. An explicit reset generation clears pending text even when the restored serialized title equals the previous committed value. Cleanup flushes once and clears only its own flush handle. Astryx TextArea owns accessible label and native input semantics. Disabled/error props are retained.
- EditorSelectionBookmark captures the opening selection and maps only document-changing transactions. Moving the current caret does not change the captured link/image target. Deleting the selected image invalidates its node bookmark, preventing accidental replacement of the next image. Text insertion before a target maps its position. ProseMirror state tests cover all of these cases.
- SelectionOverlay delegates popup dismissal and focus trap to Astryx. Its invisible anchor tracks editor coordinates on scroll/resize, clamps within viewport edges, and avoids repositioning after editor destruction. Composition-aware submit prevents Enter from applying an unfinished IME link. Dismissal restores editor focus without scrolling only when focus remains inside the overlay or has fallen to the document; another focused control is preserved. New handler tests cover inside, outside and destroyed-editor focus cases.

Eleven focused tests passed (`/private/tmp/admin-selection-audit-tests.log`). Title tests simulate input/deletion and resets in jsdom; they are not native typing/IME proof. Overlay tests mock Astryx rendering, so they establish handler semantics only, not actual Escape, focus trapping or geometry. Pixel-valued anchor coordinates and popup size/gutter constants remain custom editor positioning; token alignment and mobile/touch layout require visual review before claiming design completion.

| Source                                                       | SHA-256                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/admin/src/components/astryx/DocumentTitle.tsx`         | `2138b0ec1c80ff6c57e8d40c1672aa83f941102c3bf6991fb2ef1bde3ae73ab1` |
| `apps/admin/src/components/astryx/DocumentTitle.test.tsx`    | `da9225475f36e350ddc9ac9c7fe6e15e1f01a3397848a54d0f37e06ac7361367` |
| `apps/admin/src/components/astryx/SelectionOverlay.tsx`      | `cfdfc511eb663ae0d9c8e07ac154c95e40b233a67d6d1af150f7a4710d25c056` |
| `apps/admin/src/components/astryx/SelectionOverlay.test.tsx` | `0a0a36d7eb5a26c07a6405f271defcba6876b4f238c08bef646cfb4969c6f86c` |
| `apps/admin/src/lib/editor-selection-bookmark.ts`            | `d17256ed7616a197459764be5c6378f219e5a9580876be56227c305b4a42db60` |
| `apps/admin/src/lib/editor-selection-bookmark.test.ts`       | `ae9d130f5e945ba9ff536eafd729931eae9a18416463ba340cf6be62de1d6156` |
