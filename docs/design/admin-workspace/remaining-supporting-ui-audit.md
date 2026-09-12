# Remaining supporting UI audit

Audit date: 2026-09-12. The 15 selected files below were read completely. The additional existing ControlPlaneReceipt test and read contract were inspected for the bounded correction. No private record payloads or service mutations were exercised. Hashes capture this audit state; concurrent integration changes require rechecking affected evidence.

## Resolved findings

- `OperatorWorkTable` linked inbox actions used `/?item=…`, whose root route now redirects to Content. They now use `/inbox?item=…`, preserving encoded reference values. This component is active at `/work`; direct Browser menu navigation remains to verify.
- `ControlPlaneReceipt` inferred `idle` without a recorded command and `proof pending` without journal evidence. Its fallback now distinguishes unavailable relay reads from unknown command state and says no command/proof is recorded. Existing command states and acknowledged proof remain unchanged. A focused source regression prevents the absent-observation inference returning. This read-only receipt is active through AdminHome at `/inbox`.

## Open findings

- **SUP-1: telemetry read failure versus machine disconnection.** `ObservabilityWorkspace` catches every refresh failure and sets status `disconnected` (line 115 at audit time). Its stateLabel consequently labels every machine Disconnected and the banner says Telemetry connection lost. An initial failed reconnect, expired authorization, invalid payload or unavailable endpoint establishes failed observation, not a measured machine disconnection. The Operations owner should preserve that distinction using the existing read contract. Reported to integration owner; not changed here.
- **SUP-2: retained diagnostic presentation.** ActivationGraph, AdminTable, ControlPlaneReceipt, SemanticInspector and SemanticReference retain legacy custom HTML/styles and explanatory terminology. They remain reachable through `/inbox`, `/repos`, `/system`, `/fleet`, and `/knowledge`; they are not evidence that the approved Astryx presentation covers those routes. Their migration or deliberate compatibility classification remains integration work. Control-plane labels also retain lowercase legacy copy.
- **SUP-3: Life formatting remains diagnostic.** Life activity renders raw observation timestamps; record lists expose source identifiers and temporal enum strings; source status tokens preserve raw values. These preserve evidence but need a deliberate compact display mapping and relative Timestamp presentation with exact dates retained, without rewriting source records or hiding uncertainty. Life Overview currently exposes ingestion/wiki metadata and activity plus links, rather than the mockup's Recent records. Actual adapter capability must determine any Recent implementation.

## Invariants reviewed

- Operator work distinguishes verified lane state from last-verified stale observations. It uses provider marks and semantic inspection references; no command or publishing action is added. Desktop and mobile representations share state helpers.
- SemanticReference delegates destination eligibility to the existing semantic descriptor. SemanticInspector only exposes verified direct internal/provider destinations, escapes record values through Astro, opens a native modal dialog, handles Escape/backdrop closing and restores the connected opener. Its metadata retains authority, provenance, confidence, sensitivity and temporal evidence. This review does not independently validate upstream descriptor or access-policy enforcement.
- Observability reads are same-origin, credentialed, no-store and reject redirects, have a five-second timeout and a 262144-byte stream cap, parse the contracted snapshot, synchronously suppress duplicate refresh and abort on unmount. Unconfigured initial state does not begin background reads. Missing last-contact evidence stays Unknown; advanced traces/metrics/coverage/incidents remain disclosed views. No disconnect/delete/service-control mutation exists in this component.
- Life readers are injected rather than derived from URL input. The explorer keeps ready lists during refresh, uses separate sequenced list/detail sessions, validates pagination, closes/invalidate detail requests on navigation and prevents late requests reopening closed details. Record body continuation delegates same-record/revision/offset checks to appendLifeBody. Source text is escaped by React; metadata retains provenance, uncertainty, dates, classifications and revision context. Evidence is disclosed as JSON within the already-authorized record surface, not exported elsewhere.
- Life activity polls sequentially with retained cursor, bounded retry backoff and cleanup. It validates exact checkpoint fields, nonzero trace IDs, enum states, timezones, safe counts, ascending cursors, unchanged replay identity and a maximum 100-entry window. Private extra checkpoint fields are rejected. A failed read retains earlier observations while identifying the read as unavailable; it does not invent a healthy machine.
- `observability.css` contains only a retired-styles comment and no active overrides.

## Verification and limits

Node 24.19.0 focused Vitest run passed **26 tests in five files**: ObservabilityWorkspace, LifeExplorer, LifeWorkspace, life-activity, and ControlPlaneReceipt. The existing test environments emitted two jsdom canvas-not-implemented notices; all assertions passed. Life fixtures are synthetic. Checks cover disconnected/unconfigured/empty distinctions, duplicate refresh, failure payload suppression, keyboard tabs, paging recovery, contiguous body reads, closed-detail response races, replay validation, activity resumption and poll cleanup. The receipt regression is a source guard, not an Astro browser-render test.

Prettier formatted the receipt and its test; git diff --check passed before final documentation. No build or install was run due to shared disk constraints. No deployment or live integration proof is claimed.

Outstanding Browser checks include actual responsive geometry, scroll, native dialog focus restoration, pointer menus, updated inbox navigation, exact machine/read status semantics, keyboard navigation and authorization-state transitions with recoverable data. Source reading and passing synthetic tests do not close those requirements.

## Full-read hashes

Paths are relative to `apps/admin/src`.

| File                                                | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `components/ActivationGraph.astro`                  | `f1c99be7c540b030a207c6abeb5f1ea4485d6d79d758fef35177a49f0cbc7e2f` |
| `components/AdminTable.astro`                       | `dcc731b561c4a34e4059d02c925be490d816310500036994cf1deffc5bc45db8` |
| `components/ControlPlaneReceipt.astro`              | `028ce0fdd9f898dea0bff5c1f184c7834a6b1f932fe7dd3abb298aca0752147e` |
| `components/SemanticInspector.astro`                | `205e10d02867c735c585e4b123d66e3ef3d8ae36e92caf01c4fb9e443c96c2d1` |
| `components/SemanticReference.astro`                | `2a5fb899f572a78d289fb5b09a59952fa4835e2f15596d7880a1b6235ec585c6` |
| `components/astryx/OperatorWorkTable.tsx`           | `6947d8d16aca1bfabc0ff46c830e37615d60ab5042bf1452c868f0acb89b2939` |
| `components/astryx/ObservabilityWorkspace.tsx`      | `96e018a3ac9edc0e99ffd03076824732f2887f08760b5423113df1f3837ba11e` |
| `components/astryx/ObservabilityWorkspace.test.tsx` | `e08021a41790c21af11c65a7c3d2e0a9f1dc7a754da4906e179c749d9364afa2` |
| `components/astryx/observability.css`               | `ee2e49b3603f91c32b77bfa5cee3d4fb34fa05f41f1b355addc9f0cac67f76d6` |
| `components/life/LifeActivityView.tsx`              | `60e6428c393cfb097e815b82e50ecb6e894b6d6be809b043f7ca1707bb03ec08` |
| `components/life/LifeWorkspace.tsx`                 | `0d3971309a0917828d2a0302a55378c67b58bf4ae98593daf02fa2c16c3af3dc` |
| `components/life/LifeExplorer.test.tsx`             | `19c5e95b7b66248d99b680ecf01b927c03656ba7a5f58ea70fadf3945ed843ab` |
| `components/life/LifeWorkspace.test.tsx`            | `939e81439119fcc03451a91702365404a3b4c6eb0d661850c29b39fcd119bd92` |
| `lib/life-activity.ts`                              | `41c1cb078ea522cf5f1e96460fdaa50e470a57480cfa8b5452ac7e26ae3b66c3` |
| `lib/life-activity.test.ts`                         | `da03b0f29e4ca9d3b0fbcd601cebf4d2698c3a9290dd59302dcca86b95f41f96` |
