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
