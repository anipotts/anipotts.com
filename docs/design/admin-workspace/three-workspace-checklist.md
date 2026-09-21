# Admin frontend refinement checklist

## September 21 current review

Current preference: compact controls, spacious writing. Expanded and collapsed
sidebar controls share the same vertical rhythm. Frequent actions should be
visible and immediate; overflow is for occasional tools. Menus must not add
animation delay. This section supersedes historical coordination and status
claims below. Website owns product integration; System owns source connectivity.

This is a source-backed inventory, not a claim that every route was browser-tested
or that local changes are deployed. Current implementation branch is
`codex/cms-editor-publisher`, PR #418.

| Surface          | Current evidence                                                                                                              | Remaining acceptance or implementation                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared shell     | Shared row heights and gaps; one-click themes; section headings visually hidden                                               | Verify collapsed/expanded geometry across workspaces, touch widths, zoom and both themes                                                                                                   |
| Editor actions   | Properties/history direct; preview/publish explicit; overflow retains occasional tools                                        | Review header density on phone and tablet; audit dropdowns by action frequency rather than replacing every select                                                                          |
| Writing          | Persistent formatting, autosizing opening note, title/subtitle/body and private saves                                         | IME, rich paste, undo, mobile keyboard, suspension, multiple tabs, zoom and screen reader                                                                                                  |
| Properties       | Direct-mode visibility controls now explain and disable unsupported scheduling/unpublishing; review blocks unsupported states | Browser acceptance of direct-mode states; backend capabilities remain unchanged                                                                                                            |
| Review/history   | Exact diff and retained versions exist                                                                                        | Read-only history comparison implemented and browser-tested; Direct text-field Edit and context expansion implemented; older-history pagination tested; physical-device acceptance remains |
| Projects/pages   | Project metadata, tags, links/order, story/technical add/reorder/remove and private creation implemented locally              | Creation/reopening tested locally; roadmap and story media controls now implemented; homepage writing selections now have structured controls; shared navigation/footer remain             |
| Media            | Project logo/preview uploads, alt/caption/fit and current-source mutations integrated; pending media holds navigation         | Upload/crop browser persistence, reuse picker, reference/history visibility and recovery acceptance                                                                                        |
| Libraries        | Responsive tables and attached footer exist                                                                                   | Batch selection/review remains missing; verify long content and all empty/error states                                                                                                     |
| Preview/recovery | Revision-bound preview and recovery/conflict flows exist                                                                      | Owner acceptance of source-heavy recovery, slow/aborted responses and stale tabs                                                                                                           |
| Observability    | Shared inventory/detail UI exists; route supplies no live capability                                                          | Attach verified observations; publishing/backups/integrations need explicit source coverage                                                                                                |
| Data             | Life UI/read adapters exist; no connected transport                                                                           | Data naming applied; adjacent record detail, original-preserving corrections/new records and document workflow                                                                             |
| Legacy routes    | Old content review/drafts/operations and static operational projections remain                                                | Trace consumers and unique data, then redirect/retire redundant surfaces; remove stale release guidance                                                                                    |

Active user-requested goal: finish the admin as one
coherent Content / Observability / Data app. Use compact shared controls and
spacious writing areas; make frequent actions direct and immediate. Resolve the
functional gaps above in dependency order, preserving drafts, source provenance
and publication review. Validate every retained route and its loading, empty,
error, unavailable and successful states across phone/tablet/desktop, themes,
keyboard and zoom. Retire verified redundant routes rather than redesigning them.
Report local implementation, tests, owner review, merge, deployment and live proof
separately. Connected capability and recovery are acceptance requirements, not
assumptions inferred from a polished screen.

### System reader contract integration, September 21

Inspected System's `memory/personal_context/admin_reader.py` and synthetic tests
through its existing mini SSH connection. `OwnerDataReader` returns
`personal_context_data_v1` envelopes with `response_observed_at` and `data` for
status/sources/search/get. Website now supports that envelope only through an
explicit owner transport protocol setting. Unknown versions and unsupported
methods fail closed; missing canonical storage is unavailable, not healthy-empty.
Response observation time remains distinct from fetch time and source change time.
The overview uses source counts rather than inventing ingestion/wiki capability.

Source pagination now uses bounded limit/offset requests with forward-only
continuation validation and the shared Previous/Next controls.
No transport has been attached or endpoint/access grant activated. HTTP mapping,
session revocation and device acceptance remain integration work. The separate
`personal_context_observability_v1` envelope is now accepted only for agent-scoped
activity reads with the existing strict metadata allowlist and cursor checks.
Source readiness remains a gate. System's refreshed handoff records an ActivityReader
fix rejecting absent, corrupt or replaced storage, with a required future HTTP 503
and no-store response. This is source-level evidence, not installed runtime proof.
Website also handles the documented get data:null envelope as record-not-found,
separate from unavailable or malformed responses. System's
handoff reports source changes merged but not installed in its active runtime.
Website acknowledged receipt and requested exact route fixtures in that existing
handoff. This is contract compatibility evidence, not live connected acceptance.

### HTTP reader integration checkpoint, September 21

System's refreshed handoff provides source HTTP mapping and live Tailscale node/filter
observations, but the real verifier, full device-approval evidence and activation
remain gated. Website provides a bounded JSON response decoder without opening a
connection: owner get HTTP404 is not-found, other404 unavailable, 401/403 denied,
400 invalid, and503 unavailable. Provider error bodies never reach the UI. Eight
HTTP tests cover these mappings, body limits and login HTML rejection; together
with adapter/UI tests, 39 focused checks pass. No endpoint or grant was enabled.

At 5fadc3695 the complete admin test command passed 1,119 unit/component tests,
17 Astro tests and145 isolated Worker tests. Exact-head CI and owner review remain
required. History now exposes retained older revisions with failed-page retry;
reviewed text fields support direct edit/focus navigation. Structured project/page
review includes metadata, media, roadmap, section removal and unfamiliar fields.
Browser proof used synthetic local drafts only.

### Integration checkpoint, September 21

At 7e75beac5, the full admin command passed 1,110 unit/component tests, 17 Astro
tests and 145 isolated editorial Worker tests. This does not prove live provider
state. Subsequent source-editor extraction passed production build, generated
theme checks and Astro typecheck. The initial HomeEditor chunk fell from 405.37
KB gzip to 232.70 KB gzip; the 173.11 KB source-mode chunk loads on demand.
Browser inspection verified source opens and stays mounted when returning to the
editor, without changing the synthetic draft. A focused error-boundary test
proves a failed optional tool does not unmount the surrounding draft editor.
Current PR checks must be refreshed on the exact head before merging; owner
review, deployment and live verification are still outstanding.

### Observability and Data mobile acceptance, September 21

The local disconnected Observability view fits document width exactly at 320,
390 and768 pixels. At320px, opening Local Mac moves focus to its detail heading;
closing detail returns focus to the Local Mac control. The mobile table presents
status within the machine row and its footer remains attached. The Data overview
and Sources unavailable view also fit at320px, with canonical-source unavailability
visible rather than an empty collection. These checks use disconnected local
routes, not live telemetry or private records. Physical mobile, connected fixture,
zoom and remaining workspace geometry checks are still outstanding.

### Responsive project and sidebar acceptance, September 21

On the synthetic local project, measured document width equals viewport width
at 320, 390, 768 and 1280 pixels. No main button, input or combobox extends past
the viewport. Inspected dark 320px and light 390px editor headers and formatting
controls; light field boundaries remain visible. This is project-route evidence,
not an all-route or physical mobile keyboard claim.

At 1280px, Content expanded and collapsed sidebar icons have identical x/y
positions. Search and all navigation rows are 36px tall with 2px intervening
gaps. Search starts at y84 and Overview at y122 in both modes. Restored expanded
sidebar, system theme and normal viewport after acceptance. Other workspace
geometry, zoom and keyboard acceptance remain outstanding.

### Local roadmap acceptance, September 21

Project roadmap text, planned/in-progress/done status, ordering and removal now
use the existing published schema. Five section mutation tests pass, including
comment and unrelated-source preservation. Browser acceptance on the synthetic
local project proved item creation, text/status editing, autosave and reload
persistence. No public content was changed. Full responsive acceptance remains.

### Local project media acceptance, September 21

Synthetic private fixture: `qa-project-media-20260921`, title
`QA project media acceptance`, on the existing port 4755 local preview.
Browser acceptance demonstrated project creation, PNG upload, alt/caption edits,
16:9 crop (240 × 135), acknowledged save, reload with metadata and image retained,
then explicit preview-reference removal and reload with the reference absent.
The fixture remains private and local; no publication or production mutation ran.
Original image objects and revision history were not deleted. Removal controls
are disabled during image processing. Component/helper tests cover retained
sibling content and pending-state removal protection. Provider recovery and
production media access still require their own acceptance.

### Story media acceptance, September 21

Story sections reuse image upload/crop, alt, caption, fit and removal controls.
A section fingerprint rejects stale asynchronous edits; pending uploads are
aggregated across media instances and block section mutation/navigation. Sixteen
scoped section/media tests pass. Admin typechecking passed after integration.

On the synthetic local fixture, browser checks proved adding an empty section
keeps removal available, and removal clears validation and restores the Publish
action. Story image upload, 16:9 crop (240 by 135), alt/caption saving and reload
persistence passed. Removing the image retained the story heading and paragraph.
No publication or production data changed. Multi-upload browser races and real
provider/media recovery remain separate acceptance.

## Historical September 12 plan

The following is retained as design history. Its task ownership and completion
claims require fresh verification; it is not the current operating inventory.

# Approved Content / Operations / Life redesign

Status: in progress. This is Ani's September 12 approved refinement of the
implementation plan and flows, not evidence of completion. Root website task is
shared integration owner. Reference: attached
`codex-clipboard-141dfc59-8029-48e3-b286-6528783aa968.png`.
Mockup rows and statuses are illustrative. Preserve all private/manual drafts.

## Coordination

- Website: `01a0837d-8547-7e33-a34d-2c7ba78b8036`, shared shell, navigation,
  theme, access boundary integration, release, Content.
- Operations observability: `01a0947c-982e-7b21-abb8-254f1ce5cc7f`, feature data
  and connection evidence. Handoff: observability-handoff.md.
- Personal Wiki: `01a0947e-4a8d-7383-88aa-cceb5357b36d`, actual private records,
  read adapter, consolidation and exact owner-capability proposal. Handoff:
  life-integration.md. No private records copied into this repo.

Current task summaries and handoffs inspected before integrating. Successors
retain feature ownership. No new auth or private transport is implicitly approved
by shell changes. Approved access proposals must identify the exact boundary.

## Requirement and evidence checklist

Unchecked means incomplete or not verified at the required scope. Existing narrow
checks do not close broader acceptance. coverage.json remains the per-file audit.

| ID  | Requirement                                                               | Implementation / remaining work                                              | Required evidence                                                           |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| S1  | Admin primary, ani potts secondary everywhere                             | Content and current Operations updated; shared shell consolidation pending   | All workspace screenshots and accessible names                              |
| S2  | Compact Content / Operations / Life switcher under admin                  | Replace two-workspace identity menu with shared explicit selector            | Selection, current state, focus, all destination routes                     |
| S3  | Desktop sidebar with persisted expand/collapse                            | Content exists; unify ownership and preference across shells                 | Reload and cross-workspace behavior                                         |
| S4  | Expanded inset panel, only upper-left rounded; collapse flush             | Content exists; apply to shared shell                                        | Expanded/collapsed light/dark screenshots                                   |
| S5  | Tablet rail plus expandable navigation                                    | Content exists; shared shell pending                                         | Tablet widths, expanded rail, overflow                                      |
| S6  | Mobile header, workspace selector, drawer; no global search               | Content partial; remove old Operations bottom-nav/menu duplication           | Mobile touch, Escape, focus restoration                                     |
| S7  | Centered desktop command palette                                          | Existing component, preserve scoped injected sources                         | Center geometry, keyboard, Escape, editor Cmd/Ctrl+K                        |
| S8  | Useful workspace navigation state without data mixing                     | Design allowlisted per-workspace route state; no Life query/body persistence | URL allowlist, return state, unsaved editor protection                      |
| V1  | Astryx, Instrument Sans, tokens, Phosphor consistency                     | Retain catalog and native frame; whole-file audits pending                   | Component docs, source audit, screenshot comparison                         |
| V2  | Blue Content, muted teal Operations, soft violet Life                     | Now approved; implement theme-owned navigation accents                       | Light/dark contrast, neutral documents, unchanged semantic status           |
| V3  | Faint sidebar tint, neutral document surfaces                             | Shared theme/frame pending                                                   | Reference comparison                                                        |
| V4  | Light/dark/system, reduced motion                                         | Unify current separate theme mechanisms                                      | Preference persistence, system changes, motion test                         |
| V5  | Minimal copy, sentence case; preserve authored text                       | Copy cleanup underway, no authored recasing                                  | Route copy audit and draft comparison                                       |
| C1  | Overview, Writing, Pages, Projects, Newsletter                            | Content nav implemented                                                      | Reachable routes, filters, stable order                                     |
| C2  | Resume recent record and relative edit time directly                      | Current recent strip implemented                                             | Reload and saved-title discovery                                            |
| C3  | Library/editor/properties/history/preview/review/publication consistent   | Foundation and follow-ups; whole flow pending                                | Real recoverable draft dogfood                                              |
| C4  | Immediate typing, private autosave, fallback, images, revision safeguards | Existing changes/tests; end-to-end acceptance pending                        | No input loss, IME, races, offline, two tabs, image lifecycle, exact review |
| O1  | Machines and Loops simple foundation                                      | Integrated Machines/Loops/Activity with unknown starting inventory           | Real connected data and useful last contact                                 |
| O2  | Reuse actual authorized connections                                       | Feature read adapter currently unconfigured; runtime audit assigned          | Provider/capability map; no invented connected/running states               |
| O3  | Distinct connection/freshness/running/idle states                         | Projection partial, real mapping pending                                     | Witnessed success/stale/unavailable/idle cases                              |
| O4  | Contextual supported disconnect/reconnect/archive/delete                  | Read retry only; action contracts in handoff                                 | Capability-gated actions, exact effects, no test service mutations          |
| O5  | Disconnect telemetry does not stop machine/loop                           | Required invariant, no disconnect capability yet                             | Contract and simulated failure/action tests                                 |
| O6  | Advanced observability under progressive disclosure                       | More menu implemented                                                        | Keyboard selection and responsive discovery                                 |
| L1  | Actual Personal Wiki records and agreed navigation/read adapter           | Feature chain integrated, transport not activated                            | Authorized owner adapter and private acceptance                             |
| L2  | Provenance, uncertainty, dates, corrections, source boundaries            | Feature presentation and metadata tests                                      | Real authorized record review without disclosure                            |
| L3  | No copies into editorial/public Git/telemetry                             | No private transport or data copied                                          | Access and data-flow audit, denial and redaction tests                      |
| L4  | Preserve private access controls                                          | Existing editor login is not private-owner authorization                     | Exact owner-network decision, expiry/denial tests                           |
| Q1  | Browser desktop/tablet/mobile visual comparison                           | Requested Browser unavailable in current tool/skill catalog                  | Supported in-app Browser runtime and retained screenshots                   |
| Q2  | Sidebar/dropdown/drawer/theme/keyboard/touch/reduced-motion/overflow      | Source/DOM partial                                                           | Actual Browser interaction matrix                                           |
| Q3  | Loading/empty/unavailable/error/duplicate actions                         | Scoped tests increasing; full-route scope pending                            | Tests and browser exercises preserving existing data                        |
| Q4  | Editing/recovery/navigation/search/preview/review                         | Foundation tests; browser pending                                            | Recoverable drafts, no accidental publication/leakage                       |
| R1  | Affected tests/types/build/format/repository checks                       | Narrow integration checks only at current head                               | Full affected check log with terminal result                                |
| R2  | Protected exact-head PR/merge                                             | Not started                                                                  | Live protections and required checks on exact head                          |
| R3  | Admin-only deployment classification                                      | Not started                                                                  | Target classification and unrelated targets skipped                         |
| R4  | Critical live interactions                                                | Not started                                                                  | Authenticated live Browser evidence, release SHA and run                    |
| R5  | Main reconciliation and safe orphan cleanup                               | Deferred until integrated/released                                           | Owner/dirty/unique-commit inventory, no private-file loss                   |
| R6  | Managed localhost:4311 stays running                                      | Running; prior HTTP proof only                                               | Intended final checkout served, normal viewport                             |

## Action semantics

Reconnect retries an already authorized read/connection, never changes credentials.
Disconnect stops only specified future collection/read delivery, retains history,
and does not stop the host or underlying loop. Archive changes reversible listing
visibility while preserving data and connection state. Delete is separate,
identifies exactly what configuration/data it affects, and follows native controls.
Do not render unsupported actions as functional controls. Do not mutate actual
connections/services to demonstrate UI behavior.

## Privacy and state

Share shell layout and navigation metadata, not record stores or authorization.
Content search uses server-supplied editorial inventory only. Operations uses its
existing authorized sources. Life search requires its separate private capability.
Workspace navigation persistence may retain allowlisted route/view preferences;
never persist Life search text, source bodies, credentials or unrestricted URLs.

### Data record navigation acceptance, September 21

The real LifeWorkspace now keeps list and detail adjacent on desktop. At widths
up to 768px, an open record replaces the visible list without unmounting its
query/page state. Back to records restores the originating control; opening a
record focuses its detail region. A selected row remains identifiable.

The development-only catalog `?fixture=data` supplies synthetic in-memory records
and ready/unavailable/denied outcomes to the real components. It opens no private
connection and persists nothing. Browser acceptance proved 320px without horizontal
overflow, focus restoration, 1280px adjacent columns, and removal of records after
an access-expired result. Earlier 390px acceptance is retained. These checks do not
prove a connected reader or physical-device access.

Verification: 35 focused Data explorer/workspace tests; admin Astro and editorial
typechecks passed. Tests cover pending cancellation, retained query/page, stable
focus, capability replacement and denied/disconnected selection cleanup.

System's latest verifier proposal requires a separate design choice and exact
activation approval: existing owner Access login plus a named Tailscale device,
short in-memory read delegation, pinned source verifier and measured expiry/
revocation. No signing key, issuance route, network grant or reader service was
activated by this UI checkpoint. System owns the pending questions and concrete
provider/device approval packet in its existing consolidation handoff.

### Homepage writing selection and creation recovery, September 21

The home editor now provides published-article selection, positional remove and
reorder controls. Picker addresses come from the public baseline, never a private
slug edit. Existing unresolved selections remain visible; malformed arrays are
preserved and require repair rather than being silently replaced. The existing
public display limit is shown explicitly. Normal private autosave and reviewed
publication remain unchanged.

Verified: 24 focused tests cover component selection, public slug projection,
actual editor autosave preserving unrelated content, and malformed source. Admin
typechecks pass. Read-only browser inspection at320px proved no horizontal overflow
and grouped row actions; no homepage draft was edited or published. Shared
navigation/footer still lack a CMS-owned record and require a separate contract.

Draft creation now describes an ambiguous network/parser result as unconfirmed,
not definitely absent. Raw transport errors are hidden. Nine creation tests pass,
including retained input and unchanged request identity across retries.

### Retained legacy Content truthfulness, September 21

The drafts/review/operations routes still read the historical shared-D1 content
store, not the current editorial DO and publication database. They now say so
and link to current Content. Drafts no longer substitutes seeded templates when
no operations are returned. Missing/failed reads show unknown counts rather
than zero; operations no longer recommends passkey enrollment or claims the
current publisher uses that historical path. Existing records and routes remain.

Browser inspection proved the local drafts read-failed state contains no sample
draft controls, shows unavailable counts, and links to Content. Astro check passes.
These legacy routes still use the older diagnostic shell; retirement remains
pending consumer and unique-record reconciliation. Source consumers include the
old admin route registry and operation view links in content-editor.ts, so a blind
redirect would lose diagnostic context.

### Writing interaction and concurrent-tab acceptance, September 21

Created only the synthetic local article `qa-writing-interactions-20260921`.
Browser proof: HTML paste preserved bold, a safe HTTPS link, list structure and
Unicode; Undo removed the paste and Redo restored it. Saved preview revision4
showed the subtitle, opening note and body. Reload retained the same text.
At320px, document width remained320 in dark/system and light themes; formatting
controls wrapped and editor boundaries remained visible. Escape dismissed
Document actions and returned focus to its trigger. Original System theme and
normal viewport were restored.

Two open tabs then saved competing opening notes. The stale tab correctly
retained its draft and reported a conflict. This exposed a UI gap: normal
revision conflicts showed only the server source while preview was open. The
comparison now always shows Your retained draft alongside the saved source.
Browser proof after the fix showed both exact versions; Keep my version saved
revision6 and Retry preview displayed that revision. No public publication was
attempted. Synthetic history is retained, not deleted.

The focused recovery suite covers both sources after a review-triggered conflict;
the browser check covers the preview-triggered conflict. Physical
IME composition, actual mobile keyboard/suspension, screen-reader and zoom
acceptance are still outstanding; Unicode paste is not IME proof.
