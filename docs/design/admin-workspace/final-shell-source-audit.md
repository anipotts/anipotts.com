# Final shared configuration and editor source audit

Audit date: 2026-09-12. Repository base observed:
`af84e79b4861f1c3a25f461b549856be22bddbbf`. The worktree includes concurrent
integration changes. This receipt identifies the files actually read, not an
exact-head release or Browser acceptance. All nine assigned files were read in
full, including all 727 original lines of ArticleBody and all 1,622 lines of
admin-canvas.css. No configuration, navigation, or stylesheet changes were made.
Root subsequently authorized the concrete ArticleBody fix below.

## Findings

### Fixed: stale image state survives a new paste or drop

ArticleBody captured a new insertion bookmark and remounted its uploader, but its
paste/drop handlers retained the previous panel's URL, alt text, and error. After
opening image A, canceling, then pasting image B whose upload fails, Apply could
reuse A. Both handlers now clear those three fields before starting the new
operation. Selection mapping, panel generation, upload cancellation, and existing
image placement remain intact.

The new mounted regression uses the real TipTap editor, Astryx controls, and
ArticleBody handlers; only the remote upload boundary is replaced with a failed
uploader. Both paste and drop cases failed on the stale A URL before the fix and
pass afterward. They verify that A's URL and alt are absent, Apply presents URL
validation, and the document still has exactly its original image. These are DOM
and handler tests, not browser clipboard/drop proof.

### Open: diagnostic tables state unverified operational facts

`data/admin.ts` exports hard-coded mutation rows claiming “no active passkey
credential yet” and publication proof through `content_publish_events` and
`page_content` version history. These are rendered by `/mutations` and
`/ops/destructive`. The latter proof describes the legacy D1 publication path,
not the current Git-backed editorial contract. The credential statement has no
live query or timestamp and cannot establish present account state.

The same module's deploy rows and handoff rows mix policy guidance with
present-tense proof/status text; `/deploys`, `/handoffs`, and `/system` consume
them. Recommended bounded follow-up: label these as reference requirements and
remove unsupported current-state claims. Do not invent live provider evidence or
connect new APIs merely to populate these reference pages. Root owns triage.

### Review limitations and intentional tradeoffs

- `scrollbars.css` hides scrollbar chrome globally, including nested scrolling
  areas. It does not disable scrolling, but reduces discoverability. Browser QA
  should cover source textareas, drawers, and horizontal canvas lists with
  keyboard, wheel, and touch. No change made to this established styling choice.
- The legacy canvas stylesheet remains a large separate visual system with raw
  pixel sizing and old CSS aliases, alongside token-backed colors. Its responsive
  rules include 44px mobile actions and a safe-area-aware bottom inspector. A
  full token migration is not demonstrated by this audit; do not claim all
  reachable operator pages now use identical Astryx component layouts.
- The nav tests exercise the retained route catalog, not the rendered workspace
  sidebar or authorization middleware. Static catalog visibility is not proof
  of access. `routeTitle` matches pathname and therefore cannot distinguish
  query-only variants such as `/work?view=now`; explicit page titles remain
  necessary for those views.
- ArticleBody buffers rich-editor serialization when a flush callback is wired,
  preserves advanced Markdown through a source fallback, and uses mapped
  selection bookmarks for delayed link/image operations. Its word count is
  derived from acknowledged component value and may lag buffered typing. This
  is not a claim that all browser editing/caret cases were exercised here.

## Source review evidence

- Package scripts retain theme checks before build, Astro type checks, and the
  dedicated editorial binding check. No release workflow or API access was added.
- AdminFeedback uses layout-shaped skeletons with one accessible loading region;
  recovery banners use Astryx button action handling. No confirmed defect found.
- Interaction CSS includes coarse-pointer/mobile target sizing and reduced-motion
  suppression. Actual measured targets and native drawer transitions remain
  Browser checks rather than proof inferred from these selectors.
- The generated editorial theme contains Instrument Sans, neutral light/dark
  surfaces, restrained blue accents, and scoped sidebar tint. It is generated
  output, not a file to hand-edit. The workspace theme tests passed; a fresh full
  theme build/type check was intentionally not run under the disk constraint.

## Verification

Available disk was 313 MiB. No build, dependency install, broad test suite, media
artifact, or cleanup was attempted.

- `pnpm --dir apps/admin exec vitest run src/data/admin-search.test.ts src/lib/article-markdown.test.ts src/lib/editor-selection-bookmark.test.ts src/themes/workspaces.test.ts`: **19 tests passed** across four files.
- `pnpm --dir apps/admin exec vitest run src/components/astryx/ArticleBody.image-panel.test.tsx`: **2 tests passed**; both reproduced stale state before the patch.
- Prettier formatted the new test; ArticleBody was already formatted.
- No Browser, full type-check, merge, deployment, or public-content publication
  claim is made by this receipt. Root owns integration and live verification.

## SHA-256 receipt

Paths are relative to the repository. ArticleBody and its regression are the
post-fix bytes; all other entries are read-only audit inputs.

| File                                                              | SHA-256                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| apps/admin/package.json                                           | cb360d512cbab9cc8839ef7c79e67f16aeb45e13744b666341d1881bc0f83b8b |
| apps/admin/src/data/admin.ts                                      | 917a9761183bf19726644863da381f5eb6e3325733cc543119c20635fbbf5166 |
| apps/admin/src/data/admin-search.test.ts                          | 1f7b34d59c4aee05d9941afc44fe424d87c3a0e77c7c68faf28eb87c1461772e |
| apps/admin/src/components/astryx/AdminFeedback.tsx                | ea038bd10077946c701f4eb82fa8de79612b54fc961734c63eabffdf77bcaa75 |
| apps/admin/src/styles/admin-canvas.css                            | 2cff1a9a15d2236678c74b4e40a56ac746b175d22031385b7b240b09e80777da |
| apps/admin/src/styles/admin-interactions.css                      | 49133c67db2f88f314719a184f3281a54fa6e11e3b2ccc70b6883136c3780d3e |
| apps/admin/src/styles/scrollbars.css                              | 1e90a44723624fcbda10fdfb64dcd90fcbbd9fe6d40da9415728fb9215aba52c |
| apps/admin/src/themes/editorial.js                                | 345d3a95656f0d8550947301c784e541c36dfa80365577d8106b9effb42a5101 |
| apps/admin/src/components/astryx/ArticleBody.tsx                  | 91edbc19d34a6eed72e6ed5b82a0b51184ef3865c29ee8692eb2f9a5aa0c6540 |
| apps/admin/src/components/astryx/ArticleBody.image-panel.test.tsx | efbc6b4dd1e0e85439ba79eae6583ecd69a27b50ca87ca0fcf728729c4ea8fcd |
