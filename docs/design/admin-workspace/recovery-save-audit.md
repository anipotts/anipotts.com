# Draft recovery and save-controller audit

Reviewed 2026-09-12. Scope is the six complete helper/test files below; HomeEditor, EditorialApp and server/layout scope assignments were inspected only at their recovery integration points and are not marked fully reviewed by this receipt.

- Recovery keys encode account, record kind and ID; browser origin separates local and production storage. Current editorial scope is the server-defined single allowed owner email, consistent with verified-owner access, not a browser-selected account. Account/auth policy remains unchanged.
- Existing-draft recovery checks source/saved strings, nonnegative safe revisions and pending operation shape; malformed JSON returns unavailable. New-writing recovery validates title/slug and retains a retry ID only for the same trimmed-title/slug pair. Neither reads legacy unscoped session storage. Fixed its storage getter being outside the try/catch, so denied storage now returns unavailable consistently. The regression failed before correction.
- HomeAutosave retains the original expected revision and ambiguous operation identity after reload. It sends one operation at a time, coalesces later edits, never installs older response text over current typing, and stops on conflict pending an explicit choice. Initial preview can save an unchanged source once without bypassing a conflict. Tests cover lost responses, concurrent flushes, typing during saves, initial preview, two-tab revision conflict and recovered pending operations.
- SaveScheduler uses a 600ms idle debounce and three-second maximum wait; explicit flush/dispose cancels both timers. Fake-timer tests verify continuous typing and shutdown cancellation. Network latency itself is not guaranteed by these timings.
- Inspected integration: HomeEditor persists non-saved controller state, removes acknowledged saved recovery, recovers only non-discarded records and keeps the recovered revision for conflict detection. BeforeUnload flushes title/subtitle/body buffers. Logout recovery events disable subsequent local recovery writes in the current and sibling tabs. EditorialApp invokes clearing on the existing Access logout link. Full logout/network/browser behavior remains unverified.

## Limitations and browser gates

Recovery source limits currently count JavaScript string units; server source validation measures UTF-8 bytes. This distinction is retained to avoid silently discarding recoverable multilingual edits. Server validation remains authoritative. Recovery is not encrypted browser storage. A disabled storage backend cannot promise persistent recovery; editing continues. The storage-clear helper's operations may throw, and the caller catches that failure; actual browser privacy/storage modes and logout behavior require QA. No new authentication or storage authority is introduced.

Eighteen focused tests passed across draft recovery, autosave, new-writing and scheduling (`/private/tmp/admin-recovery-final.log`). NewWriting's jsdom run emits canvas-not-implemented notices; no canvas/browser rendering claim is made. Real offline/reload/IME, cross-tab events and focus/navigation remain explicit browser gates.

| Source                                      | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/lib/draft-recovery.ts`      | `822167a52b7b0f222b12079d4de9cafe4a6734eed93ce67baa0730871d60ebfa` |
| `apps/admin/src/lib/draft-recovery.test.ts` | `1dd5e3e759f5c51074dd195032c2d22738c1d3c73b49f4ac1e0a4f2d32a89c2e` |
| `apps/admin/src/lib/home-autosave.ts`       | `b446b006f39d06e2e9dae5a8e25b7b4288701dff5f97321c42b55647e0872a6d` |
| `apps/admin/src/lib/home-autosave.test.ts`  | `403b5ffe19e559c328c576570744207dc692dc7c66ec0900cd2d95cffd19221c` |
| `apps/admin/src/lib/save-scheduler.ts`      | `e41639ecac390282bc0d9073265d64a48ab336fcae5ea31b5d20d2620f181b49` |
| `apps/admin/src/lib/save-scheduler.test.ts` | `ad910055d2a4da878ce97517c0a6a1b01bc6ff545ca6495a7ad5c9ec7ed95903` |
