# Admin design playground

Open `playground.html` in a browser. The file is fully offline and self-contained; it does not need a server, install, API key, or build. It is a design prototype, not an installed Astryx application or a production acceptance result.

Ani strongly prefers **Quiet Precision** (September 13, 2026). It remains the
default and is the visual baseline for implementation across all three
workspaces. Other presets remain optional comparisons. Detailed interactions and
rendered acceptance are tracked in [the plan](plan.md).

## Included views

- Content: Overview, Writing, Pages, Projects, Newsletter, Editor, Review, Publication.
- Operations: Machines and Loops, each with an evidence/detail view.
- Life: Recent, People, Projects, Knowledge, Places, Timeline, Sources. Each record owns its context, provenance, uncertainty, related records, and source details. Recent and Knowledge are explicitly proposed read projections requiring a capability, not an implemented integration.
- Catalog: shared components, evidence states, interactions, and architecture.

Use the left controls to switch pages, appearance, viewport, row density, expanded/52px rail, and split/unified diff. Three presets provide coherent starting points. The decision prompt updates immediately and can be copied for implementation. Workspace navigation state is retained in memory; search queries are cleared between workspaces and no browser history or storage is used.

Open search with the sidebar button or Command/Ctrl K. Type, clear, use arrow keys, press Enter, and close with Escape. The panel and search input row retain a fixed height. Mobile navigation uses a drawer and omits global search. Keyboard focus is muted but visible, the palette/drawer/workspace menu constrain keyboard focus, and reduced motion disables entry and shell transitions.

## Evidence and custody

All names, records, timestamps, hashes, and connection states are fictional fixtures. None is a claim about Ani's actual data or services. Changing a fixture is immediate and manual. No simulated success timer, staged publication animation, automatic polling, or network API is used. Publish, refresh, external-site, and logout examples explain their intended behavior without executing it. Example editor fields are read-only.

Draft save state and public live state are separate components. The proposed live receipt identifies the reviewed revision, public revision, public route, discovery checks, and last actual verification. A successful save cannot imply publication. An accepted request without verification remains unknown.

Instrument Sans and the approved AP Structural wordmark font are embedded from installed local assets. All 43 generic icon definitions are regular-weight paths extracted from installed `@phosphor-icons/react@2.1.10`. Production should implement these patterns with the installed Astryx catalog and shared theme tokens; this HTML does not import or claim to run those components.

## Local checks

- JavaScript parses with `node --check`.
- JSDOM smoke validation renders 21 page views across six fixture states, seven publication states, and six draft-save states.
- It also exercises three presets, three appearances, three device controls, scoped menu navigation, line-based diffs, palette query/clear/empty results, machine and Life record details, and the Knowledge capability label.
- No external dependencies, `fetch`, XMLHttpRequest, WebSocket, interval polling, or runtime JavaScript errors were found by the smoke check.
- Browser visual QA is separate; container widths, actual font appearance, clipping, focus geometry, and touch affordances must be checked in Browser before adopting a direction.

Owned artifact files: `playground.html` and this README. No application code, dependencies, server processes, Git commits, or production resources were changed by this playground task.
