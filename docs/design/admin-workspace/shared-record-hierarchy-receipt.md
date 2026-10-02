# Shared page and record hierarchy

## Reconciliation after the October 1 release

The original verification below describes the historical PR tree. Reconciliation
with current main retains only Data, Knowledge and Observability headers, optional
record details and responsive fact alignment. All Content editor, library, review,
project-section and publication changes are superseded by the shipped release.
The current change does not alter Content or publication behavior. Fresh checks
and browser acceptance are required for the reconciled tree.

## Local implementation

The Writing and Projects libraries expose a labelled primary creation action in
`WorkspacePage`. Content editors, Data records (Life), and Observability entries
use the same record header for identity, navigation, status, and contextual actions.

`RecordDetails` keeps essential evidence visible and places populated optional
attributes behind **All details**. Empty optional attributes do not add a disclosure.
Content review fields use the same disclosure. Data keeps provenance,
classification, observed time, and history visible. Observability keeps state,
last success, freshness warnings, last run, and exit evidence visible. Its Open
alert action is primary; the runbook remains secondary.

This is presentation work. Existing authoring, review, permission, routing,
publication, and history contracts remain in force.

## Verification

- `pnpm check:changed --working-tree` passed on Node 24.19.0: formatting,
  route parity, fixture boundary, admin build, lint/typecheck, 1,915 admin tests
  (1,800 component/unit, 42 Astro, 73 worker), and 151 content tests.
- Local browser review used the managed preview at `http://localhost:4311/`.
  Content, Data, and Observability had no document horizontal overflow at
  320, 390, 768, 792, 1280, and 1440 pixels. The content editor was also
  inspected at 320 pixels.
- Before/after captures used the same route, light theme, and 1440 by 844
  viewport for the content library and both record panels. Optional Data
  details no longer push History below the first desktop viewport.
- Keyboard disclosure was verified for Data and Observability, including
  Data under reduced motion. Essential facts remained visible. Data's panel
  and standalone heading behavior, dark theme contrast, and full record name
  tooltip were checked. Browser emulation and appearance were restored.
- Data and Observability browser proof used synthetic fixtures. No live personal
  records were read, no draft was modified, and no production action occurred.

Screenshots and command output are task-local under ignored
`.local/hierarchy-proof/` in the isolated `admin-record-hierarchy` worktree.

## Release state

Local implementation and checks are complete. Ani's visual and exact-head PR
review is pending. This change is not merged or deployed. The managed preview
remains available for that review.
