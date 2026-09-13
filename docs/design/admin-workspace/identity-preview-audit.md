# Identity and preview follow-up

## Adopted direction

Ani requested Admin as the title and ani potts as the subtitle in every workspace.
Content and Operations now use that hierarchy. The native Astryx identity is
retained; below the existing 768px navigation breakpoint the header is 56px,
with 16px gutters and a 44px identity target. Expanded desktop retains the inset
content panel; collapsed desktop retains the flush top edge. No new breakpoint.
Life joins the shared shell during integration, still pending.

Remove generic product/onboarding helper copy. Operations should begin with
machines, loops and latest activity. Existing connections require actual evidence;
no status is inferred from machine reachability. Disconnect, archive and delete
remain distinct and are not invented frontend operations. This direction was
forwarded to both scoped successors. Blue/teal/violet workspace accents are a
proposal, not adopted or implemented globally.

## Preview source review

Reviewed SavedArticlePreview, preview-status and article-preview and their tests.
Status and size messages require the current iframe Window and navigation identity.
Retry changes that identity without remounting the frame. Old messages cannot mark
a new revision ready. Size accepts finite bounded numbers only. The sandbox permits
scripts without same-origin access. Failure handshakes contain fixed status and a
bounded request identity, escape script-breaking text and use no-store responses.
Markdown uses Astro's processor with rehype-sanitize. Tests preserve headings,
formatting, links, image URLs and alt text while rejecting active HTML/protocols.
Raw HTML may be omitted by sanitization; Source remains authoritative.

The record route was inspected but remains pending broader route review. It
requires the exact stored revision and validates source. Rendering/getEntry
exceptions outside its existing catch can still become generic HTTP failures;
the host timeout handles those but does not provide immediate specific feedback.
Non-writing preview integration still uses a separate raw frame. Neither gap is
represented as completed consistency work.

## Verification

Shell: 11 tests across three files passed. Preview: six tests across three files.
These are source/DOM tests, not browser geometry, focus, theme or touch proof.
Requested in-app Browser remains unavailable; no alternate browser used.
Managed localhost:4311/content returned HTTP 200. No release or draft publication.
