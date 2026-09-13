# Quiet Precision component catalog

This is the first bounded R1 implementation. Quiet Precision, the eight approved
visual studies, and the existing sidebar, Instrument Sans typography, Phosphor
icons, and Astryx themes remain the design references. Generated studies describe
composition; they do not define source data, capabilities, or new navigation.

## Review header

On the real Content review screen, “Review changes” and the added/removed legend
share the leading group. The current draft save status sits at the trailing edge
of the same row, at its natural text width. When the available width cannot fit
both groups, the status wraps onto a following row and remains aligned to the
trailing edge. The action toolbar follows below, with no duplicate save status.
The edit/preview toolbar keeps its status in the existing location.

The badge reports the current autosave controller state. Buffered newer edits,
failed saves, and conflicts take precedence over a prior saved revision. Private
saving and public publication remain separate facts. No persistence or publishing
behavior changes in this increment.

## Actual-component fixture

`/content/dev-catalog` is available only in local development. It uses the normal
Content middleware and editorial layout with an explicitly empty synthetic
inventory. A production build returns 404 before rendering the catalog. It is
absent from navigation and production smoke routes.

The fixture imports `ReviewHeading`, `ReviewChanges`, `SaveStatus`, and the real
`HomeAutosave` controller. Its transport outcomes stay in memory. It never calls
an editorial API, reads browser recovery, opens a draft store, or publishes. A
visible explanation identifies the save labels as synthetic examples.

Use **Save scenario** to inspect unchanged, unsaved, saving, saved locally, saved
privately, failed, and conflicting states. Use **Content example** for long
unbroken text and Unicode. The source/field and split/unified diff controls are
the actual production controls. “Review changes” is the catalog page's single H1.
“Component catalog” is supporting context above the example, so the review heading
uses the exact H1 typography of the real review route.

This fixture is a component review surface, not evidence of real persistence,
publication, owner authentication, or connected Life/Operations capabilities.
Session expiry and discarded-state components already have unit coverage; their
end-to-end recovery interactions remain work for the corresponding plan increments.

## Eight-study mapping

All eight references are retained from the September 13 visual index. No images
were regenerated for this increment.

| Study                   | Reference                                       | Current catalog coverage                                             |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Content review          | `exec-0c087384-0ea0-47d2-b146-82f8dd31693c.png` | Real title, legend, status, fields, source, split/unified comparison |
| Publication outcome     | `exec-a5396ff3-3335-4d12-a643-50ec94f58d71.png` | Pending durable publication/status increment R7/R8                   |
| Command palette         | `exec-b275560e-0a32-4951-9a93-69e7facb72c8.png` | Existing actual shell; dedicated scenario fixture pending R9         |
| Sidebar controls        | `exec-c67b6ad1-3aa8-4b45-b25b-05bd9d2a3db6.png` | Existing actual shell, collapse and theme controls retained          |
| Machines                | `exec-554f252f-845c-4f87-9fa1-29553f78fd3c.png` | Pending observation-backed list/detail fixture R11                   |
| Loops                   | `exec-7ff9c51d-1c0e-416c-a029-5dc364ff8db7.png` | Pending observation-backed list/detail fixture R11                   |
| Life library            | `exec-5f4ee62d-6069-40a8-8f58-d0229d3e9774.png` | Pending capability-bound fixture R12                                 |
| Life record and context | `exec-1810d078-d982-4917-adfc-d0bf23e52d00.png` | Pending provenance/session-state fixture R12                         |

Original images live in
`/Users/anipotts/.codex/generated_images/01a0837d-8547-7e33-a34d-2c7ba78b8036/`.
Ani's latest annotations override details invented by those images, including
extra navigation, substitute branding, and illustrative content/statuses.

## Review acceptance

Run the catalog and real review page at 320, 390, 768, 792, 1280, and 1440 CSS
pixels, including collapsed and expanded sidebar, light/dark/system themes, 200%
zoom and enlarged text. Check that title/legend/status never overlap, status text
is complete, narrow wrapping is deliberate, and long diffs do not widen the page.
Check keyboard access to selectors and diff controls, visible focus, reading
order, a single polite save-status announcement, and reduced motion.

The focused tests cover controller outcomes, save-status uniqueness/location in
the actual editor, diff behavior, and fixture boundaries. They cannot establish
optical alignment. Record browser dimensions, screenshots, interaction outcomes,
and any untested cases with each review-ready commit; Ani's visual approval is a
separate gate. The managed review preview at localhost:4311 remains owned by the
main feedback loop and must not be replaced by this catalog branch.
