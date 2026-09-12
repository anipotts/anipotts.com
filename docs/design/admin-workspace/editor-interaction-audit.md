# Editorial interaction source audit

Reviewed 2026-09-12. Scope: six requested interaction components, their directly used Markdown/media helpers, tests, and the uploader called by ArticleBody. These are local source and automated-test findings, not browser or deployment proof. No authored content or public media was changed.

## Reviewed source snapshot

Paths below are relative to `apps/admin/src`; SHA-256 hashes identify the reviewed final bytes.

| File                                        | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `components/astryx/ArticleBody.tsx`         | `780a451d9369e2869af2962b0aa43355f2e963b399770c10ea175c05ccc01477` |
| `components/astryx/RichTextField.tsx`       | `79cbc04aa0f6428b11a4711679f02cd124209ed019cefdb93ee3e1c6bd81d42e` |
| `components/astryx/SelectionOverlay.tsx`    | `cfdfc511eb663ae0d9c8e07ac154c95e40b233a67d6d1af150f7a4710d25c056` |
| `components/astryx/ArticleImageCrop.tsx`    | `e5519ec70ec22181020b4886cb474c97628747a4e1a06b82f6012e92602224ca` |
| `components/astryx/SavedArticlePreview.tsx` | `ef81dd20ea53f4f0eebb15e3da8e1c11953edee5c67fa49d253742167dd1048f` |
| `components/astryx/DocumentTitle.tsx`       | `2138b0ec1c80ff6c57e8d40c1672aa83f941102c3bf6991fb2ef1bde3ae73ab1` |
| `components/astryx/ArticleImageUpload.tsx`  | `b199d37aa8138dcdd72baaacff45a2848fb3e905fab1e17e89981f2efa40ecca` |
| `lib/article-markdown.ts`                   | `3832d1fb2655dcf0d58985f01001776d9978b8b543c835eff4e8df53e1df2f20` |
| `lib/rich-text.ts`                          | `593a010b9df3c2908bb41476d99c3c9ebdcd35cd3ddc8a461635d3e1b54f1ae3` |
| `lib/image-crop.ts`                         | `3b6cf2ebf9f5d04c6ea3780b271cda8393321e736b820e8167522d4ab23a67e8` |
| `lib/editorial-media.ts`                    | `e0fd519656645eb9709580ef6932738d1d960588ddb7e03562d6f06fd793d0a3` |
| `lib/editor-selection-bookmark.ts`          | `d17256ed7616a197459764be5c6378f219e5a9580876be56227c305b4a42db60` |

## Behavior and fixed defects

| Surface                     | Evidence and disposition                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ArticleBody                 | Immediate TipTap transactions; `shouldRerenderOnTransaction: false`; dirty callback buffers full Markdown until flush. The renderer receives explicit reset generation and uses Source when the Markdown fidelity check fails. Paste/drop selects the insertion position and stores private media through ArticleImageUpload.                                                                                  |
| Link/image target ownership | **Fixed:** applying panels previously read the current caret/image rather than the opening target. Both visual editors now capture a ProseMirror bookmark and map it through document transactions. Moving the caret cannot retarget the pending panel. A removed image invalidates its target rather than updating an adjacent image. Link removal and inline-image removal restore the same owned selection. |
| Upload panel lifecycle      | **Fixed:** a new paste/drop/open operation now changes the uploader key. Replacement unmounts the prior uploader, whose existing mounted guard rejects its late callback. Cancel likewise unmounts the uploader. No upload completion automatically publishes or inserts content.                                                                                                                              |
| SelectionOverlay            | Astryx owns popover positioning, dismissal and modal focus. **Fixed:** composition-aware Enter/submit avoids applying links while composing. Dismissal restores editor focus only when focus has not moved elsewhere and now requests no scroll. ArticleBody no longer reveals its entire in-flow formatting bar merely because the link overlay opened.                                                       |
| ArticleImageCrop            | Geometry preserves source pixels, offers four ratios including 2.4:1, caps output to approximately two megapixels and uploads a separate PNG asset. **Fixed:** the previously uncovered canvas-encoding interval now locks duplicate actions and cancellation controls; unmount/file replacement invalidates a late encoded result before the upload callback. Bitmap cleanup remains explicit.                |
| RichTextField               | Inline parse/serialize retains explicit links, logos, underline, literal punctuation and parenthesis after spelling edits. Link and image panels now own mapped selections. Disabled state protects panel removals in addition to apply.                                                                                                                                                                       |
| DocumentTitle               | Local textarea state and pending/committed refs keep typing visible immediately; flush invokes the latest callback. Equal-value explicit reset clears pending edits; ordinary same-value parent render preserves them. Stable record identity and visible page/tab title are parent responsibilities, outside this bounded audit.                                                                              |
| SavedArticlePreview         | Existing iframe is `sandbox="allow-scripts"` without same-origin permission; resize accepts only the exact frame's `contentWindow`, expected message type and finite bounded height. It does not expose source or credentials through its message listener.                                                                                                                                                    |
| Source fidelity             | `needsMarkdownEditor` rejects raw HTML, references, footnotes and rendered round-trip differences. Existing tests exercise tables, task lists, reference links, embedded HTML and inline-code literals. Visual updates do not serialize unsupported formats silently.                                                                                                                                          |
| Image presentation          | Existing writing CSS caps body images at 15rem, preserves proportions and permits full-size viewing. No universal panorama ratio is imposed. Actual mission-board readability and responsive appearance still require browser inspection.                                                                                                                                                                      |

## Concrete remaining work

1. **Preview failure handling:** SavedArticlePreview exposes no ready/error/timeout UI and preserves its previous height when `src` changes. A failed/auth-expired preview can be an unhelpful frame. Parent/controller integration should explicitly handle unavailable/stale previews using the existing preview response contract. This audit does not add speculative APIs or infer successful frame load from HTTP transport.
2. **Inline editor performance:** RichTextField still rerenders on every editor transaction and serializes its small inline document per update. Unlike ArticleBody, it only defers the callback. Profile a long homepage summary/subtitle before claiming the overall per-keystroke optimization requirement is met; a follow-up can move inline serialization into flush and subscribe only to toolbar state.
3. **Upload transport:** unmount/replacement rejects late callbacks, but the actual upload request uses timeouts rather than a caller-owned abort signal. The private asset can still be stored after cancellation, although it cannot enter the document through the canceled panel. Coordinate uploader ownership if actual request cancellation is required.
4. **Browser-only guarantees remain open:** real pointer selection, native IME, caret/undo preservation through Preview/Source, mobile overlay bounds, focus restoration after outside clicks, touch targets, image readability, light/dark/reduced-motion, and visual layout shifts. jsdom or source review is not evidence for these claims.

## Automated evidence

- Bookmark tests use real ProseMirror schemas/states/transactions: caret movement, edits before an image, deleted-image invalidation and mapped text ranges (4 cases).
- SelectionOverlay mounted test: composing form submission is ignored, then composition-end allows exactly one apply. Astryx positioning is mocked; this is a handler test, not popup geometry QA.
- ArticleImageCrop mounted test: double click schedules one encoding, the control becomes disabled, and a deferred blob after unmount cannot call onApply. Canvas/bitmap APIs are mocked; this is lifecycle evidence, not pixel QA.
- Existing fidelity, inline round-trip, geometry and title tests retained; panorama 2.4:1 added to edge/zoom geometry matrix.
- Focused suites: 28 tests across 7 files passed in the final combined run (see current run output retained by the integration task).
- Astro check: 209 files, zero errors, zero warnings, four hints in the concurrent tree. No production or browser result is implied.

## Integration boundary

Changed only ArticleBody, RichTextField, SelectionOverlay, ArticleImageCrop, the new mapped-bookmark helper and focused tests, plus this audit. HomeEditor, EditorialApp, publishing APIs, global CSS, credentials and authored drafts were not edited in this chunk. The integration owner should rerun checks on the exact PR head and keep the browser QA requirement open.

## Upload cancellation follow-up, 2026-09-12

Closing or replacing the keyed upload panel now aborts its owned controller. The signal propagates through CSRF fetch, FileReader and media POST, retaining existing request timeouts. Cancellation during bitmap decoding prevents a later network request; the decoded bitmap is still closed. An older operation cannot unlock or complete a newer operation. The crop upload uses the same controller ownership. Cancellation cannot roll back an asset already accepted by the server; no deletion is attempted and a canceled result cannot enter the draft.

A mounted regression first failed because the POST signal remained active after unmount (`/private/tmp/admin-upload-cancel-before.log`). After the fix, six uploader/crop lifecycle tests passed (`/private/tmp/admin-upload-cancel-final.log`), including cancellation during decoding, CSRF preparation and FileReader, and successful uncanceled completion. This supersedes remaining item 3 above. Actual network/browser cancellation and pixel QA remain open.

The preview failure gap in remaining item 1 was separately addressed in foundation commit a3f4e992 by request-scoped ready/failure messages, bounded timeout, loading skeleton and retry. See SavedArticlePreview.test.tsx and preview-status.test.ts; visual verification remains open. The inline-editor performance gap remains unresolved.

## Buffered inline editor follow-up, 2026-09-12

RichTextField now defers `inlineMarkdown(editor.getJSON())` until its controller flushes pending edits. It stores a dirty flag rather than repeatedly serializing the subtitle on each transaction. Immediate TipTap document updates remain local; callers without a buffered controller retain immediate onChange. Explicit source resets clear pending serialization, while unrelated same-value parent renders preserve typed text.

`shouldRerenderOnTransaction` is false. A `useEditorState` selector subscribes to selection presence, bold/italic/underline and undo/redo availability; ordinary typing with unchanged controls produces no RichTextField React render. Toolbar selection and undo remain reactive. Four mounted tests use the real TipTap editor and a serialization spy: local typing/flush, explicit reset, selected formatting/undo, and unbuffered compatibility. The performance regression failed before the change (three serialization calls for three edits), then passed. Fourteen focused editor/navigation/Markdown tests pass (`/private/tmp/admin-inline-final.log`). This closes the source-level gap in remaining item 2; actual browser latency/IME profiling and full visual interaction QA remain open.
