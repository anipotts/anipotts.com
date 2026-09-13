# Remaining media and text fidelity audit

Audit date: 2026-09-12. Scope is the nine files below, read completely. Paths are relative to `apps/admin/src`. No private photo, draft payload, or public content was read or changed.

## Findings resolved

- `inlineMarkdown` duplicated whitespace-only marked groups because leading and trailing whitespace covered the same string. A scratch regression reproduced three spaces becoming six before the fix (`/private/tmp/admin-media-whitespace-repro.log`). The serializer now preserves that text once. Committed regressions cover bold, italic, underline, and strike.
- Crop rendering previously treated a decoded bitmap as sufficient readiness even when `getContext("2d")` returned null. Apply could then encode a blank canvas. Rendering now fails closed, disables Apply, displays one error, and leaves Cancel available. Its regression checks that no encoding or upload callback occurs and the bitmap closes on unmount. Drawing failures use the same failure path.

## Invariants reviewed

- Cropping draws source pixels through canvas into a new PNG Blob. It never writes the input File. The component emits only `onApply(blob)`; media storage and original upload retention are separate responsibilities. This source review does not prove private storage retention or the office-photo crop's readability.
- Geometry validates finite positive dimensions/ratio and zoom >=1, clamps positions, and keeps the crop inside the original. Output has a 2560px longest edge and approximately two-megapixel bound with upload-size headroom. Shape choices are local to an explicit crop operation; no global photo ratio is imposed.
- Duplicate encoding is locked synchronously. File generation checks suppress late encoded results after unmount/replacement, and decoded bitmaps close on cleanup or late completion. Existing test verifies duplicate click and unmount cancellation. Server upload cancellation remains covered by the separate upload audit.
- `editorial-media` accepts hashed jpg/png/webp private identifiers. Preview maps canonical image paths to the private endpoint; copied private image URLs normalize back to canonical paths only for the listed admin/local hostnames. Other sources remain available to downstream URL validation. Referenced media identifiers deduplicate and sort. These helpers perform no fetch or authorization; they do not themselves prove the media endpoint's access controls.
- Article extensions retain image alt/title attributes, normalize source attributes on HTML import, and map preview paths only at rendering. This layer neither moves image nodes nor changes their order. Actual caret insertion/replacement remains owned by the ArticleBody audit.
- The article visual/source decision rejects reference definitions, footnotes, raw HTML, and parse failures, and compares rendered HTML before/after Markdown serialization. Existing fixtures retain supported headings, links, images, lists, quotes, rules, and fenced code while routing unsupported tables/task lists/figures to Source. This protects rendering semantics; it is not byte-identical Markdown preservation. Keeping untouched source until a user edits remains the parent editor's responsibility.
- Inline serialization groups adjacent equal marks, keeps a link around edited text/images, escapes literal Markdown punctuation, retains hard breaks, and chooses code fences longer than embedded backtick runs. Legacy homepage mention conversion is skipped for explicit fields, preventing deleted brand links from being reintroduced. Relevant existing tests pass after the whitespace correction.

## Verification and limits

Node 24.19.0 focused run: 25 tests in four files passed (`ArticleImageCrop`, `image-crop`, `article-markdown`, `rich-text`). Evidence: `/private/tmp/admin-remaining-media-tests.log`.

Full Astro check completed with 245 files, zero errors, zero warnings, and six hints. Evidence: `/private/tmp/admin-remaining-media-types.log`.

Outstanding Browser evidence: real image decode/canvas/PNG behavior, source-to-crop readability, aspect controls and touch/keyboard affordances, original preservation in private storage, replacement cancellation, image placement, alt edits, and actual Markdown fallback/preview. Synthetic tests and source audit do not complete these checks. No publication or deployment was performed by this audit.

## Audited source hashes

| File                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `components/astryx/ArticleImageCrop.tsx`      | `498020abfdc98dbd3d6530f4179482c7a38f3c5ed642dc65918a63baff6c7d62` |
| `components/astryx/ArticleImageCrop.test.tsx` | `c9b09b41108287865f98368e7f0e86e7b46263c535af23cf1038cd9e902849bb` |
| `lib/image-crop.ts`                           | `3b6cf2ebf9f5d04c6ea3780b271cda8393321e736b820e8167522d4ab23a67e8` |
| `lib/image-crop.test.ts`                      | `e55e74cc00e9986f619292d05626fa1dea54b0ea392b9ccc14abfd68aff41e63` |
| `lib/editorial-media.ts`                      | `e0fd519656645eb9709580ef6932738d1d960588ddb7e03562d6f06fd793d0a3` |
| `lib/article-markdown.ts`                     | `3832d1fb2655dcf0d58985f01001776d9978b8b543c835eff4e8df53e1df2f20` |
| `lib/article-markdown.test.ts`                | `089748995d1cb93bc6a4045790fa0b22da079a492c0107442f04ee860ebc7a94` |
| `lib/rich-text.ts`                            | `025f47fff80c9d842252e311f5c2d2bfb7fa436ad080aeed6414a55bc044ecb5` |
| `lib/rich-text.test.ts`                       | `93c70aea8161be5f1cc67e37c6d18b89b1e19e67b045c69d34b7c46b5c5d2380` |
