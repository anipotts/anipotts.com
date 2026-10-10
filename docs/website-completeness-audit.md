# Website completeness audit

Assessment date: October 10, 2026. Baseline: GitHub main
`b1c2928c443f7f8677a82b092e01333ab95b5094`.

## Scope and authority

Ani requested a comprehensive assessment, fixes and live deployment. The current
scope is Content, Data and Observability with the existing Cloudflare Access
owner sign-in. Finance and a persistent personal agent remain future ideas.
Published wording stays unchanged. Coding-agent authoring support is software
scope; this assessment does not authorize publishing new prose.

The assessment covers this repository, accessible website chat history, GitHub
pull requests/checks/deployment records and the separate agents/labs repository
records. The cloud environment cannot inspect uncommitted Mac worktrees. Their
private drafts and canonical integration preview remain untouched.

## Demonstrated baseline

- Full `pnpm validate` passes in the configured cloud toolchain.
- The direct CMS reader and single-record durable publisher are implemented.
  Private save/history, source review, immutable publication intent, unpublish,
  retry/reconciliation and public version checks have substantial test coverage.
- GitHub deployment run
  [37575280101](https://github.com/anipotts/anipotts.com/actions/runs/37575280101)
  succeeded for main: public Worker, public release smoke, admin Worker,
  editorial release/owner boundary and state Worker. Newsletter, ingest and
  weekly-email targets were skipped. Generic admin boundary and read-only
  identity smoke were skipped; their absence must not be represented as proof.
- Active default-branch ruleset `21578155` requires PRs, strict required build
  and Security Review checks, resolved review threads, blocked deletion and
  blocked force pushes, with no bypass actors. Re-read it before each merge.
- Separate agents-repository freshness/archive checks passed in its recent
  history. This is not current HTTP or deployment proof for agents.anipotts.com.

Deployment receipts establish the recorded release, not the current behavior of
every live route. Direct live requests are blocked by this environment's current
network policy.

## Findings and completion conditions

| Area                  | Finding                                                                                                                                                                                                       | Completion evidence needed                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writing share images  | Bundled social cards could remain public when their writing record was absent from an empty/partial active CMS inventory. Fixed by gating solely on active published CMS writing.                             | PR521 exact-head checks, release receipt and live absent/visible card behavior. Ordinary unpublish already wrote a hidden active revision; it was not the absent-record bug.                                                       |
| Agent authoring       | Existing owner editorial APIs are present, but a clean native CLI and complete agent workflow documentation are missing at baseline.                                                                          | Owner-session client, bounded reads, CSRF/CAS writes, separate immutable review/publication, focused tests and authenticated live acceptance without changing existing prose.                                                      |
| Shared site settings  | Navigation/footer and shared identity/SEO defaults are code-owned at baseline, despite the approved editing contract. Per-record metadata editing does not provide shared shell editing.                      | Backwards-compatible CMS settings, actual admin editing, common public rendering and default-preservation tests.                                                                                                                   |
| Media                 | Signature checks do not establish valid decoded images or bound pixels; original/derived crop provenance is incomplete.                                                                                       | Container/pixel bounds are a useful improvement, but full server decode/re-encoding and durable crop provenance require a reviewed runtime-compatible implementation.                                                              |
| Data                  | Records/Sources and ops reader are enabled in source. Knowledge and Health flags are unset. Knowledge displays “Not built yet”; Health has no demonstrated complete weight/sleep/heart-rate/HRV collectors.   | Exact owner/source authorization, reader/collector availability, provenance and fresh real-source acceptance. New health credential issuance remains a separate auth action.                                                       |
| Recovery              | Dated inventory records a nightly content-D1 export, without demonstrated draft-history and R2-media coverage; external copy and restore-drill proof are incomplete. Browser recovery retains plaintext JSON. | Current backup inventory, protected destination/key setup, complete reference-checked export and isolated restore proof; pending-browser-input protection. Do not change System jobs or key custody under a software-only release. |
| Publication lifecycle | Multi-record atomic batches, scheduled activation and published slug changes are unsupported.                                                                                                                 | These were explicitly deferred by the later single-record milestone in direct-cms-publication.md. Broader delivery-contract targets remain open; source must continue to refuse partial or unreviewed effects.                     |
| Device acceptance     | Source/tests and deployment evidence do not close outstanding physical mobile keyboard, touch/safe-area and resume acceptance cases.                                                                          | Focused real-device acceptance at the released revision, preserving private drafts.                                                                                                                                                |
| Host cleanup          | Source and dated inventory map staging to the same production Worker/data. Wildcard/legacy hosts and old Vercel claims need a fresh provider inventory.                                                       | Read-only DNS/Worker/Access/Vercel verification followed by scoped retirement approval. A current Vercel project still lists apex/www domain claims; that alone does not establish DNS traffic routing.                            |

## Staging

`staging.anipotts.com` currently denotes another hostname for production, not an
isolated environment. Ani does not use it. An actual staging service would need
its own Worker and separate stores, and would be useful for pre-release software
testing. The current alias provides no such isolation. Prefer retirement after
fresh provider/link checks rather than introducing another unused workflow.

## Existing GitHub work

Fourteen PRs were open before this pass: ten draft infrastructure/documentation
branches and four dependency branches. Drafts intentionally fail the required
ready-release job; that is not a source failure. Three dependency branches have
actual failures (Node type compatibility, React tests and Astryx theme compilation).
Do not merge them solely to empty the queue or treat draft source as deployed.
The current queue must be reassessed against each exact head before integration.

GitHub reported six default-branch dependency alerts during branch push. A fresh
`pnpm audit --json` returned ten distinct advisories in twelve finding groups;
these counts come from different inventories and must not be equated. Six
compatible patch candidates were identified for root YAML, smol-toml, source-map-js,
AJV 6, Sharp and AI SDK provider utilities. Their inspected paths are build/test
tooling. Deployed editorial parsing already pins patched YAML 2.8.3.

KaTeX needs a parent-compatible upgrade rather than forcing its next major.
The http-cache-semantics and braces advisories provide no patched version;
their inspected uses are remote-image build caching and fixed lint-staged
patterns. Old esbuild belongs to Drizzle's legacy loader, with no development
server use found there. These are documented unresolved advisories, not claims
of complete dependency remediation or demonstrated deployed exploitation.

## Software checkpoints in this pass

- [PR521](https://github.com/anipotts/anipotts.com/pull/521) passed required
  exact-head checks and merged as `1ccc08da95b7cddd0f766bf86f436c56341eb5fc`.
  [Deploy38025022414](https://github.com/anipotts/anipotts.com/actions/runs/38025022414)
  passed exact release validation and awaits the configured Production reviewer.
  This is merged, not deployed or live-verified evidence.
- The owner [agent editorial workflow](agent-editorial-workflow.md) and native
  CLI now support private drafts/history, explicit reviewed publication and
  exact-operation reconciliation using existing human Access credentials.
  Nineteen synthetic transport/file tests pass and run in ready-PR CI and release
  validation. No production draft or prose
  was read or written during these tests.
- [Shared settings](editorial-shared-settings.md) use the existing home-record
  save/review/publication path. Compiled-Worker tests demonstrate propagation
  across home, work, writing detail and RSS, and restoration to existing defaults.
  Old readers accept the optional metadata but ignore these settings; deploy
  and verify the paired reader before publishing overrides.
- Media admission now checks containers and declared image/canvas/frame
  dimensions before storage. The existing byte bound remains. It still does
  not establish raster decode, complete compressed-payload validation,
  sanitized derivatives or original/crop provenance.

The remaining software checkpoint passed full integrated `pnpm validate` and
affected public/admin build, lint, typecheck and tests after the final CSS fixes.
The public suite passed 188 tests; the admin unit suite passed 2,203 tests and
its editorial Worker suite passed 98 tests. A task-owned browser exercised
long shared labels and persisted navigation state at 320, 390 and 1,440 pixels
against synthetic published data, with no page errors or horizontal overflow.
This used system Chromium 151; the repository's matching Playwright browser
download remains blocked. This is software and synthetic browser evidence, not
owner-session, physical-device or production acceptance. The checkpoint has
not been deployed. Software deployment never publishes settings or draft prose.

## Editorial work intentionally preserved

Prior interviews/case-study/article requests remain editorial work. Structured
AI/PGI case-study depth, factual attribution and supporting media need Ani's
review. Current published wording is preserved in this software pass. Git seed
content is not authoritative evidence of current CMS wording. Newsletter public
pages remain deliberately unpublished; retained delivery endpoints do not imply
a request to activate signup or send messages.

## Environment prerequisite

See [cloud website access](cloud-website-access.md). No production credentials,
DNS settings, Access policies or CMS sources were changed by this audit. Record
each released PR/head, main merge SHA, affected/skipped targets and live route
proof separately; checked, merged, deployed and verified are distinct states.
