# Operational data compatibility audit

Audited 2026-09-12 in the shared workspace. This is a source and synthetic-test audit, not a provider, live telemetry, media render, deployment, or content-approval receipt. No private provider requests, instrumentation, content mutations, or authentication changes were made. Existing operational sources remain compatibility boundaries; future observability belongs to the successor task.

## Scope and method

Read all TypeScript files below completely, including the tests and fixture. Parsed the complete carousel JSON, inspected its root contract and all post/slide editorial fields, and recursively checked every file-metadata record and duplicated platform output/freshness structure. Repetitive metadata was checked structurally rather than individually visually inspected. The source asset files themselves were not opened or checked on disk. A manifest `exists` flag is historical evidence only.

`data/content` and legacy editor files belong to another audit. `control-plane.ts` and `admin-search.test.ts` already had separate coverage and are not claimed again here. The control-plane test is included because its ledger entry remained pending.

## Source disposition

| File                                                                   | SHA-256                                                            | Disposition       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| `apps/admin/src/data/activation-graph.test.ts`                         | `8a92d5e3147b1069b01ee9fdc55bc34855823a9a3862ce8fcee812bd59bf5eb4` | reviewed-retained |
| `apps/admin/src/data/activation-graph.ts`                              | `f6557250b0e8e2d5ba9b982b9bea4327ba940407d2c36050851acdd4e311353b` | reviewed-retained |
| `apps/admin/src/data/admin-search.ts`                                  | `b82e22debf8ba5e09a368026372d7c3bbbf7cf56fd8a85dfb372f48e01a54c9e` | reviewed-retained |
| `apps/admin/src/data/carousels.ts`                                     | `2a416694e6bcccf2b297eb29b674efaf758fac478a31f57be27617da325b339e` | reviewed-retained |
| `apps/admin/src/data/control-plane.test.ts`                            | `4f57dd0f9ea08112ab64ab168090cd952bb982d19f56653943b69271186a33dc` | reviewed-retained |
| `apps/admin/src/data/dev-operator-work.ts`                             | `1d5e34cc24541076b4daaaf1f3e84a3cd5df8d277a35bea5af0e0f3dd359e495` | reviewed-retained |
| `apps/admin/src/data/inbox.test-fixtures.ts`                           | `c2654dc1ae2d330bfc1230f41db9137ff80e822222ee142ebdc00c3865b9ad35` | reviewed-retained |
| `apps/admin/src/data/inbox.test.ts`                                    | `2ce9ecd5a98d0e88e520c9d6ab81fb1d4126d432ee5aacafb7c5c6f125347dba` | reviewed-retained |
| `apps/admin/src/data/inbox.ts`                                         | `e5a6abd59645f2bb83ae2fcf11d673e745686ff10534d45daa00f5644021b122` | reviewed-retained |
| `apps/admin/src/data/newsletter.ts`                                    | `d155bc42390aaf62917f6fa3a856f3b876c948f8a5d4509562ffd3dc3c746e2a` | reviewed-retained |
| `apps/admin/src/data/operator-work-view.ts`                            | `0b736cd9965b04b4548cde2b99bb58ad94795a1e2e2e1655ed1c91d62667956f` | reviewed-retained |
| `apps/admin/src/data/operator-work.test.ts`                            | `54832abb95f3c0d7e51a60edc55bd1d8dfb4e8a34a3c0ca8e6274790f11402a5` | reviewed-retained |
| `apps/admin/src/data/operator-work.ts`                                 | `d24b901a5ce9301f3ab0a81c477550ec167d8cf24694c3c875cbd975daead23a` | reviewed-retained |
| `apps/admin/src/data/proof.ts`                                         | `4c38aff2594b3f20abb559b38872863f41ae982692f08917acf44cc34c898eea` | reviewed-retained |
| `apps/admin/src/data/semantic-reference.test.ts`                       | `4320d6c0c9c91f915d7d339c5dde62a34f3b29693fdce94d8fd73ed39ab0cf47` | updated           |
| `apps/admin/src/data/semantic-reference.ts`                            | `4938ea870a8d45910734eca2ff4c2469305efd571941a8f2908997e42a31c576` | updated           |
| `apps/admin/src/data/static/carousels/durable_agent_workflows_v2.json` | `a8c55de94991f7b70bff024cb64f4c8210331efce00475b3b6c3e4795fd6f952` | reviewed-retained |

## Availability and provenance

- `admin-search.ts` is a pure AND-substring matcher over supplied entries. Empty query returns the first 12 entries; matches cap at 24 in source order. It does not fetch, authorize, validate, or establish freshness of its sources. UI callers remain responsible for supplying authorized results.
- `operator-work.ts` keeps runtime, operator, lifecycle, and freshness states separate. Its production projection is explicitly disconnected with empty collections and a closed replacement gate. Empty disconnected output does not establish absence of real activity. Its validator checks ID and attention-reference collisions, task-lineage existence, and collapsed loose sources, not complete runtime schema or temporal validity.
- `dev-operator-work.ts` is an explicit historical fixture. No fixture was promoted into live telemetry. `operator-work-view.ts` substitutes display copy for three known owners; this is presentation text, not a newly observed next action.
- `inbox.ts` combines existing control, proof, content-operation, page-content, and runtime projections. Development uses the declared fixture; production requests the existing D1-backed snapshot. Source references distinguish unknown, stale, unchecked, and verified. Static proof/newsletter entries use unchecked source time; carousel references retain their manifest date. Action ranking is a suggestion, not authorization. No send or external mutation is introduced.
- `activation-graph.ts` derives lanes and layers from those projections. Live work is current only within the declared freshness window and never for fixture/disconnected mode. The trajectory layer explicitly remains unnormalized. Lanes intentionally overlap, so totals are not unique-obligation counts.
- `semantic-reference.ts` models authority, provenance, sensitivity, confidence, retrieval policy, and destinations. Stale or missing values remain inspectable rather than becoming active provider links. Google Calendar links require canonical provider references; inferred deadlines retain inference provenance. Timestamp validation uses `Date.parse`, so an accepted timestamp is not proof of fresh observation.
- `newsletter.ts` and `proof.ts` are compatibility reexports from shared content data. They do not add provider reads or convert newsletter draft state into send authority.
- `carousels.ts` reads a tracked static manifest through a TypeScript assertion. The snapshot describes four posts, 24 slides, and 48 platform projections. All 293 recursive file-metadata entries declare existence; all 48 platform projections declare non-stale output, and duplicated output/freshness structures match. These statements describe the manifest only. Local-editor URLs and historical boundaries in that document are data, not instructions or proof of a currently available workflow.

## Findings and disposition

### Fixed: internal link control-character normalization

`isSafeInternalHref` rejected literal protocol-relative links and backslashes but accepted tabs, newlines, and carriage returns between the first two slashes. Browser URL normalization strips these characters: a string shaped as slash, newline, slash, external host resolves externally. A new interaction-independent regression first failed against the original helper, with the URL constructor proving the external origin. The helper now rejects ASCII control characters including DEL before destination construction. Ordinary local paths, encoded query parameters, and anchors remain accepted. No provider allowlist or authentication behavior changed.

### Retained for successor: Needs Ani status information loss

`inbox.ts` normalizes `needs_ani` to `review required` and `needs ani` to `action required`. `activation-graph.ts` recognizes Needs Ani through approve/decide actions, Ani ownership, or the original status wording. A review item owned by another task can therefore lose its Needs Ani classification after normalization. Preserve a typed attention requirement independently of display status in future work; test the real inbox-to-graph seam. No dashboard semantics were changed in this audit.

### Retained limitations for future source integration

- `buildGraphNodes` supplies stale state when constructing linked operator-task references. The semantic helper labels stale operator provenance as fixture. This is conservative for current fixtures but cannot correctly distinguish future stale live observations. Keep source method independent from freshness before connecting a live replacement.
- Carousel readiness is total platform slots minus stale slots. Missing platform output defaults to non-stale and could therefore count as ready under an incomplete future manifest. The current checked manifest contains every output, so this is a latent contract weakness rather than a demonstrated missing current export. Future readiness must require an existing output plus freshness evidence.
- Inbox deduplication and time ordering compare timestamp strings. This is correct for consistent normalized ISO timestamps, not arbitrary time-zone representations. Source loaders should own normalization before future heterogeneous integrations.
- The inbox overall mode is based on selected loader errors; some proof failures are filtered through string matching. Overall readiness is not a complete health proof for every contributing source. Per-reference provenance remains meaningful and should stay visible.
- Hardcoded operator display copy can obscure changed upstream goals or next actions if reused with live data. Replace only when future authoritative sources are available, retaining original source facts.

## Tests and limits

Ran the focused Vitest command for `semantic-reference.test.ts`, `activation-graph.test.ts`, `inbox.test.ts`, `operator-work.test.ts`, and `control-plane.test.ts`: **5 files, 29 tests passed**, local start 02:54:21. Before the fix, the added control-character regression failed as expected (1 failed, 13 passed in semantic references).

Existing coverage maps as follows:

- Semantic references: inspectable stale/missing values, canonical provider destinations, inferred deadline provenance, required absence evidence, explicit task/person references, unsafe routes, and the new browser-normalization regression.
- Activation graph: layers, foreground selection, overlapping blocked/Needs Ani states, waiting, stale fixture, and unchecked source distinctions. It does not test normalization through the actual inbox loader.
- Inbox: deterministic risk/action ordering and deduplication. It does not exercise all loader failure combinations or connected providers.
- Operator work: immutable fixture digest, lane derivation, lineage and duplicate-reference constraints. It does not establish live operator parity.
- Control plane: bounded request target/expiry, unavailable relay, and generic failure response. This is synthetic service behavior, not a successful production relay operation.

No browser or visual asset QA is claimed by this document. No full build rerun was necessary for the one Boolean guard; root owns integration checks and deployed verification. No source rewrites were made for the retained findings.
