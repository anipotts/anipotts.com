# Admin workspace: page and flow specification

Status: proposed information architecture for the selected first concept.
This document defines the design, not implemented routes or released behavior.
Source target: first displayed concept, Compact workspace, dark sidebar.
Image: /Users/anipotts/.codex/generated_images/01a0837d-8547-7e33-a34d-2c7ba78b8036/exec-5bee3894-097f-475a-a49f-c2febe609908.png

## Product decisions

Admin should make finding, editing, reviewing, and maintaining website content
feel like one continuous task. Keep Instrument Sans, Astryx theme tokens,
restrained blue actions, charcoal surfaces, and sentence-case interface labels.
Light mode uses the same architecture. Author text retains its chosen casing.

Separate Website navigation from Operations navigation. This is a navigation
boundary, not a new app, login, entitlement, or merged data source. Default to
Website. An Operations destination may be exposed only under its existing access
rules; do not fetch operational data just to render the Website shell.

## Website navigation

- Admin / workspace selector
- Search (visible trigger; Cmd/Ctrl+K outside text editors)
- Content
  - All content
  - Writing
  - Website pages
  - Projects
- Newsletter
- Footer: Live site; Appearance; Account / Log out

Content subitems are saved library views, not independently implemented catalogs.
Website pages includes Home, Work introduction, Writing introduction, Systems,
and the public Newsletter landing page. Newsletter in main navigation means
issue drafts and their review. Do not duplicate both under the same label.

No generic dashboard, placeholder Settings page, Help destination, Media sidebar
page, or permanent New article sidebar entry in the first iteration. New post is
an action on Writing and All content. Appearance and account actions are compact
menus. A Media picker is useful inside insertion; a full asset library requires
usage tracking, reusable inventory, and deletion semantics before it merits a page.

## Page inventory and decisions

| Surface                                      | Decision                                                           | Primary purpose                                               | Main action                                    |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| Root                                         | Keep redirect to Content                                           | Resume work without a dashboard detour                        | Open a record                                  |
| All content                                  | Keep; unify inventory                                              | Find every editable website record                            | New post                                       |
| Writing                                      | Keep as filtered library                                           | Find private and published articles                           | New post                                       |
| Website pages                                | Add explicit filtered view                                         | Edit fixed site sections                                      | Open a page                                    |
| Projects                                     | Rename navigation from Work; preserve routes                       | Maintain public project records                               | Open a project                                 |
| New post                                     | Keep creation route, remove sidebar entry                          | Create a private record with stable identity                  | Create draft                                   |
| Article editor                               | Keep dedicated record page                                         | Write title, subtitle, body                                   | Review changes                                 |
| Page/project editor                          | Keep same shell, use schema-specific fields                        | Maintain structured copy, links and media                     | Review changes                                 |
| Preview                                      | Record mode                                                        | Inspect actual draft rendering                                | Back to editor                                 |
| Review changes                               | Record mode                                                        | Understand destination and exact diff                         | Approve and publish                            |
| Version history                              | Record panel                                                       | Compare and restore private revisions                         | Restore as draft                               |
| Source                                       | Advanced record mode                                               | Preserve/edit unsupported Markdown and HTML                   | Back to editor                                 |
| Properties                                   | Inspector/disclosure                                               | Tags, content type, dates, stable URL and intended visibility | Inline edit                                    |
| Publication status                           | Record detail panel                                                | See Prepare, Checks, Deploy, Live and recovery                | Retry when appropriate                         |
| Newsletter library                           | Keep separate                                                      | Find issue drafts                                             | Open issue                                     |
| Newsletter issue                             | Keep review-only detail                                            | Read issue, claims, sources and notes                         | Return to library                              |
| Old D1 content Drafts/Review/Preview/History | Remove from Website navigation; retain diagnostic access initially | Inspect legacy operational records                            | Read-only inspection where available           |
| Carousels                                    | Exclude from Website navigation                                    | Creator/export workflow                                       | Revisit in a separate content-production scope |

Keep existing record URLs and source identifiers. Proposed view query names and
new mode URLs must be mapped against current routes during implementation. Use
record-scoped modes (for example ?view=preview) rather than global Preview or
History destinations. Invalid modes should return to Edit. Filters/search/sort
should be URL state and restored when navigating back. Never redirect an old
D1 record to a Git record unless an explicit identity mapping exists.

## Desktop layout

At 1280px and above: 200px persistent sidebar, compact 52px contextual header,
flexible main region. Optional Properties inspector is 256px. The writing column
is at most 720px; with the inspector open it may shrink to approximately 600px.
At narrower widths, Properties becomes a drawer instead of squeezing prose.
The library uses one table, subtle separators, approximately 48px rows and 12–16px
cell padding. Title is the flexible column; status and update metadata are compact.

Editor header: Writing/back, save status, Preview, Review changes, More.
Do not duplicate global navigation above this. Title is a borderless editable
heading, subtitle is compact and auto-growing, body is an open document surface.
Properties is closed by default; make its trigger discoverable in the contextual
bar or More. Opening it is an explicit choice, not the default form-heavy view
shown in the first rough board. Never show a raw slug instead of the subtitle.

Use a single document scroll. The sidebar can scroll independently only if its
navigation exceeds the viewport. An inspector may scroll internally when long.
The document retains scroll, selection, undo and focus when returning from a mode.

## Tablet and mobile layout

- 768–1279px: collapsed navigation rail or menu according to available space;
  keep the reading column comfortable. Properties is a drawer, not a third column.
- Below 768px: compact Admin/header menu and search; navigation opens as a drawer.
- Library rows show title and one secondary line with status/date. Section and
  secondary actions remain available without horizontal table scrolling.
- Editor uses 16px side gutters, wrapped title, and a single compact sticky action
  row. Review remains the primary action; Preview is secondary. Never render the
  same actions at both the top and bottom.
- Properties and history become full-height sheets with a clear Back/Close action.
- Link editing is a selection popover when it fits, with viewport collision handling;
  use a compact sheet when the keyboard/viewport cannot fit it. Image crop needs a
  larger dialog/sheet; do not cram it into a link-sized popover.
- Touch controls are at least 44px; keyboard focus is visible. Avoid trapping users
  between multiple nested sheets. Close the topmost overlay first.

## Record flows

### Find and edit

Content/filtered view -> open record -> type immediately -> quiet Saving status ->
server acknowledgment -> Saved. Search and filters survive the return trip.
Cmd/Ctrl+K edits links while text editing; outside it opens scoped content search.
A failed inventory request shows a retry state, never an empty collection.

### New writing

Writing -> New post -> enter title -> Create draft -> focus document body.
Create a stable record ID/URL once. Title edits update the heading, breadcrumb,
browser title and inventory display without silently renaming the URL. Never
create a public article merely by saving a private draft.

### Preview and approval

Edit -> flush buffered text and save -> Preview -> return to previous caret/scroll.
Review changes -> flush/save -> destination plus change count -> inspect unified
word diff -> Approve and publish -> real publication stages -> verified Live state.
On wide screens offer optional split Before/After; use unified diff by default to
avoid duplicating long paragraphs. URL, image, alt text and formatting changes
must be represented, not only visible words. No additional approval dialog after
the explicit review action. Failure retains the draft and exposes one recovery path.
Local preview cannot publish; it must accurately explain the local/production
boundary at the action point. Do not suggest automatic draft transfer exists.

### Revisions, source and recovery

More -> Version history -> select revision -> compare -> Restore as draft.
Restoring creates a new private revision; it never rewrites published history.
More -> Source uses the same draft and saves; unsupported content never silently
converts through the rich editor. Download flushes local buffers first. Import
validates the record contract and rejects overwriting typing that occurred during
file reading. Reopening recovers account/origin/record-scoped local edits and
reconciles revisions; conflicts offer Keep my version and Use saved version.

### Visibility, drafts and removal

Distinguish three concepts in the UI: currently live state, private unsent edits,
and intended visibility after publication. Show a published article with private
edits as Published plus Changes pending, not simply Draft. A visibility edit is
part of the explicit publication review, including when it hides an existing page.
Discard draft changes must not masquerade as Delete article or Unpublish.
A Trash view can be added when inventory can enumerate recoverable discarded
records; current discard/restore endpoints alone do not establish that full flow.
No permanent deletion or new bulk publication controls in this design.

### Media

Caret -> paste/drop/insert -> upload private original -> edit alt/crop if needed ->
insert at the preserved caret. Selected image -> contextual Replace/Crop/Alt/Remove.
Replacement keeps its position. Crop saves a new private asset and preserves the
original. Display images proportionally, capped around 240px in the editor, with
full-size viewing. Do not apply the office photo's wide ratio to every image.
Cancellation must prevent late upload results from changing the document.

### Newsletter

Newsletter -> select issue -> review body -> optionally inspect Claims, Sources,
and Notes -> back to list. Desktop can use list/detail panes; mobile uses full-page
reader navigation. Current newsletter issue routes are review-only. Do not show
New newsletter, Send, Schedule send or subscriber management until those are
separately specified, authorized and implemented. Public newsletter landing-page
copy is edited through Website pages.

## Operations structure: later navigation consolidation

Keep operational routes and their authorization intact while refining Website.
Proposed groups: Inbox; Work (Now, Projects, History, Handoffs); Knowledge
(including Locations); System (Fleet, Repositories, Deployments, Proof); Personal
(Life, Health, Aesthetics). Keep Health's existing sensitive-data boundary and
status-only behavior. These are proposed navigation groupings, not permission to
combine APIs or expose sensitive records. Audit usage and backing sources before
merging pages. In particular, operational Projects is not public website Projects,
and deployment history is not article revision history.

## Acceptance and rollout

First implement shell and library navigation; then editor/properties/overlays;
then record modes, newsletter review, and consistent empty/loading/error states.
Test real typing, focus, back/forward, search, recovery, conflicts and cancellation
on desktop, tablet and mobile. Check light/dark/reduced motion, overflow and touch
sizes. Preserve live publication safeguards and private content. Review the
refined visual against this specification before implementation. No route removal,
new backend capability, auth change, content publication or deployment is effected
by this document.
