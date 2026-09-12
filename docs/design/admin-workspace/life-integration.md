# Life integration increment

Life owns `/life`, `/life/people`, `/life/projects`, `/life/places`,
`/life/timeline`, `/life/sources`, and `/life/preview`. Website owns the shared
Content/Operations/Life shell, navigation, themes, authentication and integration.
The current wrapper is AdminLayout by agreement with that owner.

The feature uses Astryx Layout (960-wide capped column), TabList with overflow,
List rows, Token status, MetadataList and Collapsible evidence. The landing page
preserves links to Health, Aesthetics, legacy Knowledge and legacy Locations.
It stops interpreting a missing legacy D1/inbox result as personal well-being or
absence of decisions. Existing provider routes and stored data are preserved.

## Read boundary

`data/personal-context.ts` is transport-neutral and disconnected by default.
It supports bounded search, record get, timeline, preview, sources, status and
activity reads. No HTTP client, listener, credential lookup, DB binding or owner
authentication is installed. A supplied transport is a trusted implementation
dependency, never request-controlled configuration or proof of approval.

Preview requires explicit matching context scope, lookup mode, 3,000-token
budget and seven-day window. The existing loopback HTTP preview is agent scope.
Local owner stdio authorization does not authorize a website network route.
Provider failures, invalid responses and disconnected access remain distinct
from successful empty results. Raw provider exceptions are not returned.

Source bodies render as escaped text. Effective and observed dates, date
precision, current witnesses, classifications, temporal states, corrections,
revision and omission metadata remain inspectable in the presentation component.
Routes set private/no-store. Private payloads must never enter editorial drafts,
Operations D1, public Git, request logs or telemetry.

## Remaining implementation and acceptance

- Connect the shared Content shell through the integration owner.
- Verify interactive search, record selection, revision-safe body continuation
  and source-cursor pagination in the managed browser. These controls now accept
  an injected read capability, with no capability installed by default. Query
  text stays in component memory rather than URLs or persistent browser storage.
- Complete reconnectable activity against a synthetic read transport.
- Prepare and approve the exact authenticated owner network capability, including
  principal, host, browser origin, session expiry, private transport and denial
  tests. Keep deployment disconnected until that separate approval is recorded.
- Validate desktop/mobile, keyboard, themes and reduced motion in the managed
  preview, then complete private Mac/phone and independent agent acceptance.
- Full consolidation remains active: source reconciliation/enrollment, recovery
  schedules, production readiness, coordinated cutover, legacy dispositions and
  24-hour operation are not completed by these routes.

Follow-up validation: twenty adapter, request continuity, section dispatch and
React response fixture tests passed with existing tooling under Node 24.19.0.
The isolated tests use source-identical files and a bundled component fixture.
Both Astro routes compiled without diagnostics at the initial increment.
Full dependency-ready checks belong to the integration checkout; these focused
checks are not build or browser proof. Route dispatch now validates the section
before reading and selects its correct method instead of using status globally.
