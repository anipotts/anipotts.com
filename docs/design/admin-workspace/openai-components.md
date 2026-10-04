# OpenAI-first admin components

## contract

Content -> Writing is the first migrated workflow. The development catalog at
`/content/dev-catalog?fixture=openai` demonstrates the same synthetic article as
a table row, details, editable fields and a real ChatKit widget. It is not a
production route. The existing workspace kit remains the component entrypoint;
unmigrated routes retain their existing Astryx behavior.

OpenAI's published visual defaults guide the pilot, except corner geometry:
Ani explicitly requested the existing tighter Astryx shapes on September 29.
Shared controls use non-pill variants and the scoped radius mapping; ChatKit
uses its closest supported theme setting. Do not reintroduce pill buttons when
migrating another workspace. The implementation uses `@openai/apps-sdk-ui` 0.2.2, ChatKit React 1.6.1 and Tailwind
4.3.3. Package versions are recorded in the lockfile. Apps SDK UI is a separate
React library, not ChatKit's internal renderer.

References: [OpenAI UI guidance](https://developers.openai.com/plugins/concepts/ui-guidelines),
[ChatKit themes](https://developers.openai.com/api/docs/guides/chatkit-themes), and
[custom ChatKit integrations](https://developers.openai.com/api/docs/guides/custom-chatkit).

## coverage

| surface                                      | classification                  | ownership                                                                     |
| -------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| buttons, fields, selects, menus and tooltips | reuse actual OpenAI primitives  | shared adapters preserve legacy callers outside the pilot                     |
| markdown and code blocks                     | reuse actual OpenAI primitives  | supported SDK rendering and safe link handling                                |
| status messages                              | compose OpenAI primitives       | application controllers supply state and evidence                             |
| tables, rows and details                     | compose shared admin components | semantic table, controlled state, responsive rows and existing record formats |
| rich-text and source editors                 | retain engines                  | Tiptap and CodeMirror keep selection, undo, source and recovery semantics     |
| conversation card                            | actual ChatKit                  | hosted UI, local development fixture transport, no inference                  |
| application shell and navigation             | retain existing behavior        | opt-in scope, existing route and focus contracts                              |

There is no standalone data-table or rich-text-editor export in the installed
Apps SDK UI catalog. Their application behavior belongs to the workspace kit.
Do not label composed admin components as native OpenAI components.

## boundaries and state

`AdminUIProvider` opts a surface into scoped SDK styles and supplies its theme.
The build scopes the SDK/Tailwind foundation, including reset and token rules,
to the OpenAI boundary. Portalled OpenAI content carries the same boundary and
theme. Legacy pages retain their existing reset and tokens. ChatKit receives
supported theme options; its hosted frame is not restyled through private DOM.

Save acknowledgements, local recovery, private persistence and publication are
different facts. Keep the save controller's revision/destination evidence and
the existing cross-tab inventory relay. A ticking timestamp is not a live
connection. This milestone adds no cross-device synchronization transport.

The catalog owns synthetic state and a locked, read-only ChatKit thread. Its
custom fetch responds only to supported fixture requests and never forwards
unknown requests. OpenAI hosts ChatKit's script/frame, so rendering requires
network access to those assets; it does not require a model call. Only the
synthetic fixture reaches that frame. Failure to load the frame is displayed.

Catalog scenarios are explicitly simulated. Writing acceptance uses the
repository's loopback-only local owner development mode and local stores.
No model credentials, new private-reader access, production content mutation,
publication, provider change or additional API allowance is part of this work.

## remaining migration sequence

### information hierarchy

Ani's September 29 screenshot feedback defines the next migrations' content
standard: a row should answer what happened, where, by whom, and what needs
attention without opening a generic daily record. Visual consistency alone is
not acceptance. Keep useful domain facts prominent and repetitive provenance,
raw keys and routine explanation behind an accessible disclosure.

| category                          | facts to prioritize when the source supplies them                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| development activity              | repo, PR/change title, branch/worktree, Codex or Claude attribution, checks, change summary and diff link  |
| browsing                          | meaningful page title, domain, visit/session context and time, rather than a repeated Browsing label       |
| people and messages               | person/conversation, sender, useful excerpt, time, unread/action state and related record                  |
| notifications                     | originating app, concrete event, affected object, urgency and available action                             |
| quantities and structured records | labelled values, units, totals and relationships; never truncated JSON rendered as a pile of chips         |
| observability                     | affected host/service, concrete metric and threshold, last result, freshness and actionable failure detail |

Use aligned compact values on desktop and prioritize the most useful facts in
mobile rows. Secondary facts remain reachable by expanding a row or opening
details. Avoid duplicate dates, source labels and large vertical gaps between
simple label/value pairs. Preserve uncertainty and provenance, but do not make
routine metadata the dominant content.

Agent attribution, worktree names and diffs require source evidence. A GitHub
username alone does not identify the acting agent. Record missing upstream
fields as data-contract gaps rather than inventing them or adding inference
calls. Use synthetic examples in the catalog; the supplied personal screenshots
and their private values are not fixtures or committed assets.

| next surface               | reuse                                                 | acceptance before opting in                                             |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Content projects and pages | fields, editor controls, save status and record lists | structured field round trips, homepage ordering and preview parity      |
| Data records and sources   | tables, rows, detail panels and notices               | session expiry, provenance, paging, search and read-only boundaries     |
| Knowledge and Health       | text, metadata, filters and status                    | existing reader gates and sensitive-data boundaries                     |
| Observability              | tables, status, dates and activity                    | observed timestamps, stale data, unavailable sources and event ordering |
| remaining shell surfaces   | controls, menus and tokens                            | keyboard navigation, overlay placement and theme persistence            |

New workspace UI should use the shared kit. Extend it once when a capability is
missing rather than building page-specific variants. Opt-in of a remaining
workspace requires its behavior checks; this milestone is not blanket
authorization to migrate or expose its data.

## acceptance

Compare light/dark renders at 390, 768 and 1440 pixels. Exercise table controls,
record navigation, metadata edits, rich/source round trips, undo, acknowledged
save and reload, failed save, conflict and expired session. Verify cross-tab
updates reject stale revisions. Smoke-test unmigrated Content, Data and
Observability, including overlays and overflow. The fixture-boundary check
must find no catalog sentinel or development domain key in production bundles.

Record concrete commands, results, screenshots and remaining limitations in
the implementation PR. A build alone does not prove the rendered workflow.
