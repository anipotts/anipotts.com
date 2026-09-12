# Admin workspace implementation plan

Current approved refinement: [Content / Operations / Life checklist](three-workspace-checklist.md).
Its September 12 user decisions supersede conflicting earlier navigation/branding
proposals below. Completion evidence remains separately tracked.

Status: proposed implementation plan. No implementation or release is authorized
by this document itself. It translates Ani's selected first generated board and
subsequent page/flow decisions into a concrete delivery sequence.

Companion: [page and flow specification](flows.md).
Visual target: **Compact workspace**, the first image displayed, dark sidebar.
Source image: `/Users/anipotts/.codex/generated_images/01a0837d-8547-7e33-a34d-2c7ba78b8036/exec-5bee3894-097f-475a-a49f-c2febe609908.png`.

## 1. Outcome and scope

The result is one coherent Website workspace for finding content, editing private
drafts, previewing, reviewing differences and tracking approved publication.
Operations remains reachable under its existing authorization, with its own
navigation. It is not loaded into the Website workspace's data model.

Keep the selected board's charcoal palette, blue emphasis, narrow persistent
sidebar and compact hierarchy. Correct its speculative details: no generic
Settings/Help pages, no newsletter creation/sending controls, no external citation
URL presented as the publication destination, no slug in place of a subtitle,
no permanently open Properties form, and no duplicate mobile actions.

Existing Instrument Sans, Astryx tokens and Phosphor icons remain authoritative.
Sentence case applies to interface copy. Never recase authored content or change
stored enum/route/identifier values to achieve presentation consistency.

No database migration, new authentication scheme, credential change, newsletter
sending, public content publication, permanent deletion, or unrelated worker
release is included. Media/Trash libraries and bulk publishing remain deferred.

## 2. Baseline before editing

1. Capture current branch, base SHA, changed files and the managed preview owner.
   The current work includes uncommitted document-editor, recovery, overlay and
   capitalization changes. Preserve these; do not rebuild from an older main.
2. Preserve user-authored local/server drafts through the existing private draft
   interfaces. Never stage `docs/writing-drafts/` or production draft payloads.
3. Record existing checks separately from new behavior. A prior passing test run
   is not proof of the new shell or restored browser interactions.
4. Reproduce title typing, overlay open/apply/dismiss, Preview/back and current
   library discovery. Document blockers instead of assuming the old browser-tool
   failure or an old browser session still describes current availability.
5. Record route/auth boundaries, active feature capabilities and current provider
   release gates. Do not remove old pages during this baseline step.

Deliverable: baseline receipt and updated QA checklist with a clean distinction
between implemented, tested locally, browser-verified and deployed.

## 3. Final navigation and route contract

### Website sidebar

Admin/workspace selector; Search; Content group (All content, Writing, Website
pages, Projects); Newsletter. Footer: Live site, Appearance, Account/Log out.
Use one shared navigation definition for sidebar, mobile drawer and search
navigation results. A menu may expose an existing authorized Operations entry;
selection must not transfer or broaden authorization.

| Destination      | URL decision                 | Behavior                                                          |
| ---------------- | ---------------------------- | ----------------------------------------------------------------- |
| Default          | `/` -> `/content`            | Preserve the existing redirect and query                          |
| All content      | `/content` or `?group=pages` | Existing `pages` query continues to mean the combined inventory   |
| Writing          | `/content?group=writing`     | Same library, filtered to writing                                 |
| Website pages    | `/content?group=website`     | New allowlisted view for fixed page records only                  |
| Projects         | `/content?group=work`        | User label Projects; retain the existing query                    |
| Systems bookmark | `/content?group=systems`     | Keep valid; not a standalone primary navigation item              |
| New post         | `/content/new`               | Explicit action from All content/Writing, not sidebar destination |
| Record           | `/content/{collection}/{id}` | Preserve all current record identities and routes                 |
| Newsletter list  | `/newsletter`                | Issue drafts, separate from public landing-page copy              |
| Newsletter issue | `/newsletter/{slug}`         | Existing review-only issue route                                  |
| Operations Inbox | `/inbox`                     | Do not use `/`, which currently redirects to Content              |

Record URL state: `view=edit|preview|review|source`, with Edit the default. Optional
`panel=properties|history|publication` chooses one record panel. Do not stack
Properties and History panels. A modal media interaction temporarily takes focus
above that panel without creating another persistent navigation destination.

Library URL state: `q`, `status`, `sort`, and the existing `group` query. Use an
allowlist, deterministic defaults and stable tie-breaking by record identity.
Invalid values fall back predictably; do not silently drop unrelated recognized
parameters such as theme. Keep filters across browser Back/Forward. A return
location is an allowlisted local library URL, never arbitrary external input.

Editor mode transitions should use history without remounting the draft controller.
Direct links must load the record before entering a mode; missing/invalid modes
fall back to Edit. Browser Back must return through meaningful mode changes,
without a history entry for every keystroke or filter character.

Old D1 `/content/drafts`, `/content/review`, `/content/preview`,
`/content/operations`, and `/content/edit/*` are not the Git editor's equivalents.
Remove their Website navigation entries, retain existing routes and permissions
initially, and label legacy diagnostic links clearly in Operations. Never create
redirects between these models without a verified record-identity mapping.
Carousels remains outside Website navigation; no record deletion accompanies this.

## 4. Layout contract

| Element     | Desktop, at least 1280px                                            | Tablet, 768–1279px                   | Mobile, below 768px                                           |
| ----------- | ------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| Navigation  | 200px sidebar                                                       | 64px rail with labeled tooltips      | Header menu opens labeled drawer                              |
| Context bar | 52px minimum, one row when it fits                                  | Same hierarchy, compact spacing      | One sticky toolbar, naturally taller if needed                |
| Library     | Table with 48px minimum rows, 12–16px cell padding                  | Drop optional metadata columns first | List rows; title plus status/date; no horizontal table scroll |
| Writing     | Centered max 720px, 24–32px gutters                                 | Centered comfortable width           | 16px gutters, full-width flowing document                     |
| Properties  | Optional 256px inspector only when at least 600px remains for prose | Drawer                               | Full-height sheet                                             |
| History     | Record-side panel                                                   | Drawer                               | Full-height sheet                                             |
| Newsletter  | List/detail when the reader can remain comfortable                  | Separate list and reader as needed   | Full-page reader with Back                                    |
| Review      | Unified prose diff; optional split view if both columns fit         | Unified diff                         | Unified diff and one approval action                          |

Breakpoints are behavior defaults, not permission to squeeze content. Measure the
actual available width after navigation and inspector. When space is insufficient,
promote the inspector to a drawer instead of shrinking the document below its floor.

Use the base surface and dividers instead of wrapping every region in a card.
Desktop actions are at least 36px; touch targets at least 44px. Long titles wrap,
URLs break safely, menus respect viewport bounds. One primary scroll for the
record; internal scrolling only for long navigation or inspector content.

Dark mode follows the selected board; light mode preserves exactly the same
hierarchy. Respect an existing saved theme; do not force dark mode over it.

## 5. Component architecture

Refactor by responsibility while preserving stable draft ownership:

| Component/pattern         | Responsibility                                                        | Existing integration                                            |
| ------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `EditorialWorkspaceShell` | Astryx AppShell, SideNav, workspace navigation, mobile drawer, footer | Extract from `EditorialApp.tsx`; use installed SideNav APIs     |
| `ContentLibrary`          | URL filters, table/list rendering, empty/error/loading states         | Extract current Catalog; reuse inventory types where practical  |
| `RecordWorkspace`         | Record loading, mode/panel navigation and stable draft controller     | Decompose `HomeEditor.tsx` incrementally                        |
| `RecordActionBar`         | Back, quiet save status, Preview, Review changes, Properties, More    | Reuse Toolbar, Button, Tooltip and MoreMenu                     |
| `WritingDocument`         | Title, subtitle, body; no save/network ownership                      | Reuse DocumentTitle, RichTextField, ArticleBody                 |
| `StructuredRecordEditor`  | Schema-specific page/project fields                                   | Reuse editorialFields, Field, FieldStatus, FormLayout           |
| `RecordInspector`         | Properties and validation                                             | Reuse ArticleSettings and date controls                         |
| `RecordHistory`           | Revision selection, compare, restore                                  | Extract existing history behavior; reuse Timestamp/MetadataList |
| `RecordReview`            | Exact source/revision, destination and diff                           | Reuse ReviewChanges and PublicationProgress                     |
| `NewsletterWorkspace`     | Library/reader with optional evidence panels                          | Preserve current newsletter collection/review sources           |
| Shared feedback           | Skeleton, Spinner, Banner, EmptyState, Toast                          | Reuse existing AdminFeedback patterns                           |

Names describe intended ownership, not a requirement to introduce a component for
every wrapper. Keep the controller stable as views change. Avoid creating a second
Tiptap instance, a second autosave controller or competing shortcut listeners.

## 6. Inventory and backend presentation

The current Content route joins published inventory with private writing records,
but skips a private record when the published route already exists. That hides
private title/update changes for existing published articles. Fix this at the
server presentation boundary rather than adding client requests for each row.

Build an inventory projection keyed by `{collection, id}` containing:

- stable href and identity;
- latest editable title/summary, with safe fallback for invalid partial drafts;
- published state and published update provenance;
- private revision/update time and whether actual changes are pending;
- intended visibility from the private draft, when available;
- record capabilities such as editable, review-only, previewable and creatable.

Overlay private draft metadata onto the matching published record without losing
its live status. Derive Changes pending from revision/source comparison, not merely
the presence of a draft. One row represents one record. Do not infer Scheduled
means a verified automatic scheduler exists. Do not display client-derived
optimistic state as confirmed publication.

Use bounded storage reads/list APIs; avoid downloading every historical revision
or media blob for a list. If existing interfaces lack summaries, add a narrowly
scoped authorized server projection over existing storage without changing the
source contract. Keep existing response fields compatible and test new fields.

Feed catalog and command search from the same projection so a saved title is
findable consistently. Refresh/invalidate summaries on confirmed saves and record
creation; preserve rows during background refresh. A partial private-storage
failure must show a warning with recovery and must not make known records vanish.

The Website shell must never call operational knowledge, inbox or personal-data
endpoints. Newsletter search can use its already-authorized issue inventory;
operational search remains scoped to its existing sources.

## 7. Detailed editing behavior

### Creation and ordinary editing

New post opens the existing creation flow with Title first and suggested URL under
an optional advanced disclosure. Create once using its stable request identity,
then open the record and focus the document. No automatic public publication.
Existing titles never regenerate record IDs. Unfinished creation recovery must
be brought under the same account/environment/logout policy as existing records;
current `editorial:new-writing` session storage is a separate path to reconcile.

Typing is immediately local. Full Markdown serialization/validation runs at save
boundaries, not on every body keystroke. Idle save delay is approximately 600ms,
with a three-second maximum during continuous input. Keep one request in flight,
coalesce newer input, and prevent old responses from replacing newer text.
Maintain request identity for ambiguous failures; distinguish definitive rejected
payloads so correction cannot retry an invalid payload forever.

Flush before Preview, Review, Download, and record navigation. Do not block visual
typing on network response. Normal successful navigation should need no dialog.
If changes cannot be safely saved/recovered, retain the editor and offer a clear
retry or explicit leave action. Never report Saved before acknowledgment.

### Panels, shortcuts and focus

Cmd/Ctrl+K opens links while editing text; otherwise global search. Slash insertion
works in the body. Formatting appears at selection with a keyboard-accessible
alternative. Link URL editing uses a compact Astryx popover; Enter applies unless
IME composition is active. Escape dismisses the topmost overlay, respecting IME.
Outside clicks must not steal focus from another input. Keep the selected range
while applying/removing links, and restore focus without unexpected scroll jumps.

Properties uses current schema fields and intended visibility. Close to recover
writing space without a separate save step. Field validation links to the exact
input and opens Properties when necessary to reveal the problem.

### Media

Paste/drop/picker stores the private original. Keep a selection bookmark mapped
through editor transactions until asynchronous upload completes. Validate before
upload, guard duplicate submissions, and invalidate pending callbacks on cancel,
replacement or unmount. Late responses cannot insert or replace an image after
cancellation. Crop writes a new immutable private asset, preserves the original,
and exposes alt text and proportional/full-size preview. Selected-image actions
stay local to the image. Never silently replace the first image in the document.

### Preview, review and restoration

Preview uses the actual saved draft and renderer inside the existing sandbox.
Keep the editor mounted so returning preserves caret, scroll and undo. Card
preview is optional. Handle missing/stale/error preview responses explicitly.

Review captures a confirmed source and revision. Editing while entering or leaving
review invalidates only that review snapshot; a late save must not force the user
back into a view they abandoned. Show the actual anipotts.com destination, changed
field count, word-level diff and URL/media/metadata differences. Unified view is
the default; side-by-side is optional on wide screens. Approval binds to the exact
reviewed revision. Preserve existing conflict and publication checks.

Version history distinguishes private revision dates from published updates.
Restore as draft creates a new revision, never modifies the old one. Synchronously
clear/drain buffered editor state before import, restore or Use saved version,
including equal-value replacements and rich-editor unmount into Source fallback.
Unsupported Markdown/HTML must round-trip through Source without conversion loss.

## 8. Newsletter and Operations

Newsletter list/detail exposes existing title, status, body, claims, sources and
notes. Secondary evidence is collapsible; the issue remains readable without
opening every section. Do not introduce New issue, Send, scheduling, or audience
controls. Use an actual available preview image only; never invent an issue cover.

Operations first receives only navigation organization and consistent chrome:
Inbox; Work (Now, Projects, History, Handoffs); Knowledge/Locations; System
(Fleet, Repositories, Deployments, Proof); Personal (Life, Health, Aesthetics).
Existing routes, API calls and access checks remain. Where grouping alone would
misrepresent a source, retain a clearly named separate link. Full operational page
mergers require a separate source/usage audit; they are not hidden in this redesign.

## 9. Shared states and accessibility

| Situation               | Required behavior                                                     |
| ----------------------- | --------------------------------------------------------------------- |
| Initial load            | Layout-matched Skeleton with accessible announcement                  |
| Background refresh      | Keep content visible; quiet status, no skeleton replacement           |
| Explicit pending action | Button loading, duplicate guard, restore on failure                   |
| Autosave                | Inline Unsaved/Saving/Saved or Saved locally, as appropriate          |
| Persistent failure      | One Banner with relevant retry/recovery; preserve text                |
| No records              | Context-specific EmptyState and valid next action                     |
| No filter matches       | Clear filters, retaining the underlying inventory                     |
| Session expiry          | Retain scoped recovery, offer session restoration, no secret exposure |
| Revision conflict       | Compare, Keep my version, Use saved version; no silent overwrite      |
| Import/restore success  | Brief accessible Toast; no autosave toast spam                        |
| Publication             | Existing real phases and errors, never invented percentages           |

Use semantic headings, labels, focus order, aria-current navigation and selected
states. Desktop and mobile renderings must not create duplicate focusable controls.
Reduced motion suppresses decorative loading/transition motion. Drawers restore
focus; Escape closes the topmost surface. Do not rely on color alone for status or
diffs. Scope dark/light styles under the editorial theme to avoid public leakage.

## 10. Implementation sequence and exit criteria

| Phase                                | Work                                                                             | Exit criterion                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A. Baseline and refined visual       | Current-state receipts; revise selected board against this specification         | Desktop/mobile editor and library references contain only real controls and agreed layout       |
| B. Inventory and navigation model    | Typed sidebar/route map, published/private summary join, URL filter state        | Saved private titles discoverable; known bookmarks preserved; no operational fetches in Website |
| C. Shell and library                 | Responsive SideNav/drawer, shared Content views, search and row actions          | All navigation/Back/filters work at 390/834/1440px without overflow                             |
| D. Stable record workspace           | Extract controller/action bar, URL modes, Properties/History panels              | Typing/undo/caret survive view changes; no duplicate save/shortcut owners                       |
| E. Editor interactions               | Selection overlay, media lifecycle, Source, recovery and validation              | Adversarial save/media/import/restore tests pass without input loss                             |
| F. Review and publication UI         | Exact-revision review, unified diff, truthful stages, preview errors             | Stale review cannot publish; local environment cannot publish; draft remains private during QA  |
| G. Newsletter and navigation cleanup | Review-only issue layout, Operations grouping, legacy links removed from Website | Every visible link has a valid authorized destination; no new unsupported actions               |
| H. Review and release                | Full diff review, browser matrix, exact-head PR, admin-only deploy               | Verified live admin behavior and release receipt; local preview remains running                 |

Keep each phase reviewable. Use focused commits; prefer one cohesive admin release
when intermediate phases would expose incomplete navigation or conflicting editor
ownership. Stop introducing features once acceptance criteria pass.

## 11. Test and QA matrix

Automated behavior tests:

- Published/private inventory join, no duplicates, malformed-draft fallback,
  filters/sort/query parsing, saved-title search, partial backend failures.
- Title click/type/delete/selection replacement; buffered equal-prop reset;
  buffer cleanup during unmount, import race and download immediately after typing.
- Save coalescing, three-second max wait, ambiguous retry identity, invalid payload
  correction, late responses, cross-tab conflicts and logout recovery cleanup.
- Creation idempotency/slug collision; no title-driven URL rename after creation.
- View navigation during slow save, stale review rejection, preview revision match.
- Media selection mapping, cancellation/unmount, duplicate upload, alt/crop/original
  preservation and unsupported Markdown round-trips.
- Auth boundaries and explicit local publication block, retained legacy route parity.

Browser matrix: 1440x1024 desktop, 834x1194 tablet, 390x844 mobile, plus a narrow
320px overflow check; light/dark; reduced motion; keyboard-only and touch-sized
controls. Test actual Enter/Escape/Tab, browser Back/Forward, open/reload/navigation,
selection, undo, paste/drop and composition with the best available real IME path.
Synthetic events do not establish native IME proof. Record limitations explicitly.

Network/state cases: slow response, offline then online, server validation error,
expired session, two tabs editing the same revision, unavailable inventory and
failed media upload. Recoverable private fixtures only; do not publish test content.
Measure typing under throttled networking and React renders: body input must not
cause unrelated shell/catalog rerenders or await serialization/network work.

Capture before/after and responsive screenshots, console errors, focus restoration,
overflow and image readability. Visually compare the refined target with the actual
implementation; generated mockups are not acceptance evidence themselves.

## 12. Release and completion

Run current repository-required formatting, route/security invariants, affected
build/type checks and tests (`pnpm check:changed`; full `pnpm validate` when shared
scope requires it). Repeat checks after consequential changes. Keep private draft
artifacts and screenshots containing unnecessary sensitive records out of the PR.

Prepare a same-repository PR with scope, validation, UI screenshots and explicit
remaining limitations. Re-read current action rules, inspect provider protections,
and require checks on its exact current head. Inspect release classification before
merge; shared lockfile changes must not release unrelated workers. Deploy only the
affected admin target through the protected lane. Record PR, merge/release SHA,
workflow run, actual target and skipped-target results. No safeguard bypasses.

Verify authenticated live Content, editor, preview/review, newsletter navigation,
capitalization and responsive overlays using recoverable private drafts. Do not
publish Ani's writing as a UI test. If verification fails, use the previous verified
admin deployment through the permitted rollback lane; do not rewrite Git history.

Completion requires local and live evidence, preserved content, truthful capability
labels, stable URLs, no broken links, and an explicit list of any remaining limits.
Leave the managed localhost:4311 preview running and restore the browser's normal
viewport. If browser/provider access is unavailable, finish reviewable local work
and report the exact blocked release gate rather than marking the project complete.
