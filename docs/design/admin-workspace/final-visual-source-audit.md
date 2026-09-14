# Final visual source audit

2026-09-12. Full source reads cover the palette implementation/tests, Operations workspace/tests, 1022-line editorial stylesheet and two theme producers below. Generated outputs are checked by producer equivalence, not described as manually reviewed semantic source. This audit owns this document only after the authorized palette refinement; it does not change the coverage ledger.

## Palette findings resolved

- An uncancelled installed CommandPaletteInput animation-frame autofocus reclaimed focus after rapid dismissal while the input remained mounted for exit. Reproduced before correction; disabled that behavior through supported hasAutoFocus=false and focused synchronously after native dialog open. Closing preserves a deliberate newer outside focus target. The deterministic regression holds opening frames until after dismissal; no timer increase masks the race.
- Palette remains centered with a viewport-capped 520px height and internal results scrolling. The input row now has a token-derived fixed 68px height and Clear permanently reserves its width; while empty Clear is hidden, disabled, aria-hidden and removed from tab order. This removes the parent's observed 52-to-68px query jump. No geometry claim comes from jsdom.
- Backdrop has no blur and uses 30% of the existing overlay token, preserving page context. Neutral surface, compact aligned rows, one-line record summaries, native shortcut footer and a single subdued input-row focus indication replace nested outlines. Source failure is a compact neutral role=status line with Retry; provider payloads never render.
- Operations bootstrap presents only Overview, Machines and Loops. Advanced navigation uses exact operational route allowlisting and appears only during search. Operations no longer requests Inbox or Knowledge; its only live source is the existing runtime-feed endpoint. Content/Life records are not fetched and then filtered. Retained Inbox routing is separately tested without assuming Inbox is a palette data source.
- Native search loading/live announcements, keyboard selection, Escape, composition guard, focus restoration and navigateAdmin unsaved-editor flow remain. No source credentials, authentication or enrollment changes were made.

## Other reviewed visual source

Operations distinguishes unavailable transport from measured disconnection and preserves Last known evidence. Inventory disclosures show unknown last contact rather than inventing it. Diagnostic tables, search/clear and selected tab behavior use Astryx. The one-second freshness tick rebuilds view projections even when unconfigured; acceptable for the small bounded inventory but worth profiling before adding large streams. Native history replace preserves selected view but is not durable replay history.

Editorial CSS provides 45rem writing measure, proportional images capped 15rem, responsive table/status layout, touch targets, native fill-shell scrolling, expanded-only inset gap/top-left rounding and reduced-motion transitions. It still contains prior top-nav and sidebar rules plus broad component selectors and raw structural dimension budgets. This is an integration-maintenance concern: retire unused rules with route/DOM proof, not a blind CSS purge during concurrent sidebar work. The global coarse-pointer target selector needs Browser confirmation against current rendered icon attributes. No source-only review establishes clipping, drawer geometry or every cascade outcome.

Operations and Life producers extend editorialTheme and change accent/on-accent plus a component-scoped sidebar tint. Neutral document surfaces, semantic statuses and fonts remain inherited. Astryx CLI check mode confirmed both generated outputs match their producers, including emitted runtime/declaration artifacts; generated file hashes below are build-artifact provenance, not independent manual semantic review.

## Verification and limits

Latest focused palette/Operations-adapter/Inbox-parity run: **13 tests passed in three files**. Earlier current Operations UI focused test run passed eight tests as part the supporting audit; subsequent source review reflects its unavailable-copy correction. Both theme producer check commands passed without rewriting outputs. Formatting and git diff --check passed.

Parent Browser reported 600×520 centered dialog with no blur or blue input outline before the final fixed-row/neutral-status refinement. Root owns final screenshots and full responsive/error/loading/result geometry checks. No parent Browser evidence is relabeled as this worker's direct observation. Final row geometry, dark colors, error footer capacity and keyboard scrolling remain parent verification. No release or overall completion is claimed here.

## Full-read source hashes

Paths relative to apps/admin/src.

| File                                                  | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `components/astryx/AdminCommandPalette.tsx`           | `8a8b04724a927b5baf26d568c287aa68a78d45af1b2c7d13195041f0758ece59` |
| `components/astryx/AdminCommandPalette.test.tsx`      | `5e652c4322b289cb1afef9ae525e5aa3508e21147b2ad7784a6952621ab8a0bf` |
| `components/astryx/OperationalCommandPalette.tsx`     | `8526345e3eaca0fc8d10b77f3aaaeb2ea6c1d69d6635db6c4b08f5aab743178e` |
| `components/astryx/OperationalCommandPalette.test.ts` | `36667b28efc60769e5decad5b49586367ae471fbe43329100a33e697ba8eed50` |
| `components/astryx/CommandPalette.css`                | `c2d7556c305c6875bd5f75322dca8d9ae6be56d338cd58f6a26be7c7809d691c` |
| `data/inbox-route-parity.test.ts`                     | `a1f1460e6765963f1e1878ae368f8a27cfc12e2ca238dff25f0b53428c9a393f` |
| `components/astryx/ObservabilityWorkspace.tsx`        | `7202cb0b7b5038337f22ca7db95bde44420b3763ff77b209fcec841b03a6b651` |
| `components/astryx/ObservabilityWorkspace.test.tsx`   | `a6ae9a7cf15693449fc835c5c5269045fa9f39007842aea6fbf6a2739b059dff` |
| `styles/editorial.css`                                | `1ed76e5071d6669b5ead4793e8942dbc82475be74a7e8f843bbe5e5f3b8b6ff4` |
| `themes/operations.ts`                                | `bbe6720b71395eb4983134d5d017aacb3fe83188c369ab4035e6d3e21d08dcb0` |
| `themes/life.ts`                                      | `0ebab34fa867d187a335c1504777d68803949e4ae4de2e08fd565c5a16b7d72a` |

## Generated producer-equivalent artifact hashes

| File                              | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `themes/operations.generated.css` | `2f809aa408651da41f0ae4b4a9c1bb12ec2ce9f3e284f14527d280a21d2787e6` |
| `themes/operations.js`            | `d79dccdf095be35a64cff3ef232a7eb8ea99d88f9905057f0f71a558e4038d65` |
| `themes/operations.d.ts`          | `b0a751faab67d9045846404f7121d22084dd45cb8a5a9e2e416aa10a68d27426` |
| `themes/operations.variants.d.ts` | `3f899a34c58c9e05987fd58c5276f4c7fe5763118115c6c510695ec34b1ce52d` |
| `themes/life.generated.css`       | `cc0be7e3397177ca1b8a15934b4922b95fbafef940a7ef4e8794bfd0d54bbfef` |
| `themes/life.js`                  | `9c73b608aa1349686e399a2a7fe2e4bad4142a551fd2f40e06ae55d04bb0aef5` |
| `themes/life.d.ts`                | `4b8946ac2603e310b22115107979cf7453892f7dcf7304e82257635e3fcef088` |
| `themes/life.variants.d.ts`       | `3cca60681ab03d7cc16740d432516c6fe7b618819c8cb482657e7f13e11185c8` |
