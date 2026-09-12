# Life integration source audit

2026-09-12. All twelve files below were read fully, including the newly added supporting-view regression. Read the feature handoff `life-integration.md`; inspected the existing knowledge read contract only to establish its availability signal. No real personal records, network credentials, owner capability or transport were read or activated.

## Resolved findings

1. Health ignored `readAdminKnowledge.available`, reducing failed reads to an empty summary list. The route now passes the actual availability signal. LifeSupportingView renders a distinct unavailable message rather than an empty result. The new synthetic render regression covers both branches. Existing summaries and source details remain escaped; no diagnoses or mutation actions were added.
2. Record get accepted a response at the wrong requested body offset. It now requires exact requested offset (zero for the initial read), and null or a forward safe integer continuation within the existing ten-million request bound.
3. Body append accepted NaN continuations because numeric ordering comparisons with NaN are false. A synthetic direct Node reproduction returned acceptedNaNContinuation=true; a mismatched requested offset also returned ready before correction. Append now validates both current and next continuation offsets as finite safe nonnegative bounded integers before changing any text. Regressions cover NaN, infinity, negative, fractional, over-limit and mismatched offsets. Revision/record identity and source cursor semantics remain intact, including non-UTF-16 source offsets.

## Contracts and boundaries

- `lifeReadPath` allowlists read methods and entity kinds, encodes query values, bounds queries to 2048 characters, list pages to 30, activity to 100, body reads to 32000 and numeric cursors to ten million. Record identifiers cannot traverse paths. Unknown sections are rejected before capability dispatch.
- `readPersonalContext` is transport-neutral. Without an injected trusted transport it returns disconnected and performs no network read. Five-second deadline aborts even a stalled transport; provider exceptions and error envelopes return generic failure messages. Decoded response size is capped at one MiB; the transport contract separately requires streaming byte enforcement before decode. No actual streaming transport is installed by these routes.
- Preview enforces lookup mode, 3000-token budget, seven-day window, bounded token count, explicit matching consumer scope and selected/omitted arrays. This is response validation, not authorization; an owner website network capability remains separately unapproved/unconnected per the handoff.
- LifeReadSession deduplicates same-reader identical concurrent requests and rejects older generations after new reads or invalidation. List/detail instances remain separate. Appended body remains capped at one MiB and retains current record provenance while updating only body continuation fields.
- `/life` and allowed dynamic sections call the disconnected adapter without a transport or client reader. They set private/no-store and use the shared AdminLayout. They do not prove connected Personal Wiki integration. Invalid sections and dynamic overview return 404. Explicit Health and Aesthetics routes preserve legacy supporting surfaces.
- Health uses the existing authorized knowledge summary source with domain Life and a four-item limit; it does not activate the PersonalContext adapter. Aesthetics is an unconnected placeholder with no source read. Its “No style references yet” copy is placeholder presentation rather than verified source emptiness; revise when an actual source is integrated.
- LifeSupportingView preserves source locator, freshness and visibility fields in a disclosure. No raw body HTML, database writes, publication, telemetry enrollment or editorial duplication is introduced.

## Verification and remaining acceptance

Focused tests cover the adapter, request continuity, sections, supporting view, existing explorer/workspace interactions and activity. Node 24.19.0 Vitest completed with 34 tests passing in seven files. Formatting is limited to the changed files. No build/install was run under shared disk constraints.

Remaining: Browser rendering and keyboard checks for the new health unavailable state; authorized owner-network capability and denial/expiry/private-source acceptance; real connected records and source continuity on desktop/phone. Decoded schema validation intentionally retains opaque record/provenance metadata; it does not replace transport access controls or source classification enforcement. No integration, release or production-data acceptance is claimed from this source audit.

## Full-read hashes

Paths relative to `apps/admin/src`.

| File                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `data/personal-context.ts`                    | `d0554290f4341bfd995826b2349b2bb56cca9b34944d8e224a1ac07092dc395b` |
| `data/personal-context.test.ts`               | `bcaff0855d1f0a18a1ab567d559eb05459b24df35659d42f0788bb4a3929a74e` |
| `lib/life-read-session.ts`                    | `8cd3624ee8d1ba9f2db0fdd9e512ea574b5ede204698894f322122bbe21ded95` |
| `lib/life-read-session.test.ts`               | `0da6c517aa9a378dbb175ebc3feedcd1372be314e1a9a9203bb6a3ee9218cace` |
| `lib/life-sections.ts`                        | `deb83f79d84b518f05d8fdf2d63e0344f47ed28978b8392476ace16f5b8904fe` |
| `lib/life-sections.test.ts`                   | `fb16ce8409e320d61708b82f5c0ca235f0a3d78ce13e18b8f7b37c924e59cbb4` |
| `pages/life/[section].astro`                  | `cb59de84b7d469ee03ea1a78a0fafa9efd94f931fd3093705c5d823c6ff89790` |
| `pages/life/index.astro`                      | `66ea679ca37d0c07f41e1b8e5da6304129919da98e06f0cc22a2a73ade291685` |
| `pages/life/health.astro`                     | `a67d7fea9880edb57cf39b2b245cf1d3bcfdddb2491fff4401ec746e2c3b3103` |
| `pages/life/aesthetics.astro`                 | `81c17a6f5d588cbda2cd2dd201ef40648f8fbccdb73ca93dd64d059725bd9058` |
| `components/life/LifeSupportingView.tsx`      | `f9401baa0ed6a64230fe54cf1fc8ec6adee6005086e8b6f5f70e60c6082287c1` |
| `components/life/LifeSupportingView.test.tsx` | `b1acc32f7236b2981af9f14b37abaa67dcd234453a06c2bc4130f75078af7f47` |
