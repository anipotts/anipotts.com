# Editorial inventory and utility audit

Snapshot: 2026-09-13, before the follow-up fixes listed below. This is a source review of the named files, not a blanket completion claim. Hash changes require review refresh. No source, auth, API, recovery, operational, or provider mutations were performed in this audit.

## Findings

- **F1, confirmed:** `projectEditorialInventory` selects only `summary`. Actual project metadata uses `card_copy`, `subtitle`, and `description`; fixed pages use `hero_summary`, homepage `sections.intro.subheading`, and newsletter landing `deck`. Their summaries are missing from catalog/search, including private revisions. Fix with one browser-safe per-record summary helper shared by server projection and acknowledged client metadata.
- **F2, investigated, retained:** newsletter configuration inherits its schema's literal `status: draft`. Root confirmed there is no public newsletter landing route, only subscription APIs. Git-backed storage is not proof of publication. Preserve the current status; changing it to published would be an unsupported presentation claim.
- **F3, confirmed:** `editorialFields` creates newsletter control labels with `key.replaceAll`, leaving lowercase labels including `cta label`. Capitalize static labels explicitly; no authored values need change.

## Evidence and retained behavior

Inventory collects only Astro public page/project/writing collections. One shared projection feeds catalog and palette, preserving published provenance and private revision separately. Current snapshot reads are bounded to four concurrent non-writing reads; writing enumeration and individual read failures set unavailable while preserving successes. No operational search endpoint is connected to editorial inventory. Titles/summary metadata are serialized, not body/source. Latest draft revisions deduplicate; discarded snapshots and invalid identities are excluded.

Changed-field labels validate normalized schema metadata; dates compare as ISO values, object keys are canonicalized, and body comparison requires Astro body availability. Unsupported or incomplete comparison stays generic. Private-only drafts receive no list-all-fields noise. Search events accept bounded metadata only, ignore stale revisions and preserve stable URLs and publication status; changedFields is intentionally invalidated until server projection is refreshed.

Library URL helpers allow known groups/filter/sort values, cap search to 512 characters, retain safe theme parameters, and encode only local library return context. The broader sign-in return helper permits only same-origin content/newsletter paths and rejects normalized traversal outside those paths. These serve different scopes intentionally.

New-writing source uses JSON quoting inside YAML, starts private/draft, and leaves ID generation separate from title changes. Slug generation normalizes Latin diacritics, bounds length to 120 and validates against record identity schema; titles without Latin letters require a manual slug. This is a known supported fallback, not automatic transliteration. Durable creation tests cover idempotency, collision refusal, and no publication job creation.

Writing review retains unknown metadata and removed fields, alongside raw body changes; title/summary have separate controls. It deliberately exposes source representation changes for review rather than using the inventory's compact semantic labels. Source-content compatibility exports read generated public projection only and remain used by the retained content-editor compatibility path; they do not feed the new editorial inventory.

Date provenance is build-time Git/local metadata (`virtual:editorial-updates`), supplemented by acknowledged private timestamps. Supplemental source review of `scripts/dev/editorial-updates.mjs` confirmed no runtime Git executable in the deployed worker. The plugin has not been changed or counted as admin-file completion here. No browser rendering or actual network timing was tested in this bounded audit.

## Tests

Ran six focused Vitest files at 02:38:57: inventory projection, inventory events, library URL state, editorial return path, writing review, source-content. **44 tests passed.** Read the durable writing-create integration test source; did not rerun that Cloudflare suite in this audit. `editorial-content` and server loader have no direct mocked integration test in this reviewed set; projection/storage partial failures are unit covered. Do not infer full server-layout or browser correctness from these checks.

## Reviewed file snapshot

`reviewed-retained` means source inspected and retained at this hash. `updated` means reviewed implementation introduced by this workstream, not released. `finding` identifies a planned narrow fix; it does not claim completion.

| File                                                        | SHA-256                                                            | Disposition       |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| `apps/admin/src/lib/editorial-content.ts`                   | `e4eff311ca5b6ae62484c954c39370f33a244c494019a3986dd26d7291d41d2d` | reviewed-retained |
| `apps/admin/src/lib/editorial-fields.ts`                    | `5a14d38795d3938bb8af90d36f416edd52d119d2dc00944cc40594d5a1b95f43` | finding           |
| `apps/admin/src/lib/writing-draft.ts`                       | `654e40411ba81745030d639da12114ff28bfe3704509cb88e65b8d70b3504e0c` | reviewed-retained |
| `apps/admin/src/lib/writing-inventory.ts`                   | `c0c71ff05df3728de1ccc6924fdc10ef142fcf22acff19c8163373211284fb8a` | updated           |
| `apps/admin/src/lib/writing-review.ts`                      | `56d8c3b78346cd3f8e53e9f5c88d3aabe9e8fa587bd82c522927f489f62dfd0c` | reviewed-retained |
| `apps/admin/src/lib/writing-review.test.ts`                 | `ecc3fae4d30fd0bcb16d15206fd8ca77f4b6e95849bb676939e82d5614bfc32e` | reviewed-retained |
| `apps/admin/src/lib/editorial-return-path.ts`               | `5ee062434aceccc9b5c79fc7864b175d45656009fea068c3468bfd4632483f21` | reviewed-retained |
| `apps/admin/src/lib/editorial-return-path.test.ts`          | `0b1d9653fbad535c17b100ff5831d11a7e7f927066d83573b45aada5500049a9` | reviewed-retained |
| `apps/admin/src/lib/editorial-inventory-projection.ts`      | `c66c1a9bf1a4cd73727389caf63d873861f460569753b35e640f417178b21c8f` | finding           |
| `apps/admin/src/lib/editorial-inventory-projection.test.ts` | `01919e17496867bd4f4ba80ca1c2b11978d4ce36a19ed7507dc82250ad4a6b69` | updated           |
| `apps/admin/src/lib/editorial-inventory-server.ts`          | `74e05919e1f85073e430d1cf5cb935001c39cf32c12bc73b3d8efb46a7ed1b4e` | updated           |
| `apps/admin/src/lib/editorial-inventory-events.ts`          | `80087c0e596c5d177487d97c59694b95a88243437626ba90e8cd350f3649be69` | updated           |
| `apps/admin/src/lib/editorial-inventory-events.test.ts`     | `c67176b359ae0503d8b8efbf58a70f2770681b659b6ed34b291facefb2afa842` | updated           |
| `apps/admin/src/lib/content-library-state.ts`               | `178525df1c327a338f3642f39db3455a27f5acfd1723f3d745ebfc98abd445ee` | updated           |
| `apps/admin/src/lib/content-library-state.test.ts`          | `c04c5b403e3975043ab33987963ee5d563e27d4bd383f31a2d59cc1283ad34e1` | updated           |
| `apps/admin/src/data/source-content.ts`                     | `81944ba8e1e5b42444b7a068b037f325d675b090a5d5753da4e5724798f4806c` | reviewed-retained |
| `apps/admin/src/data/source-content.test.ts`                | `c0ab0ab1e076aa7f935c96311cee33c9dfcab9c0839615f070c0b426ff678047` | reviewed-retained |
| `apps/admin/src/editorial-updates.d.ts`                     | `75a635d0060a9028a84eabad9cc6619eee8ad8655a8a3ba1a949035c1551dd54` | reviewed-retained |
| `apps/admin/test/editorial/writing-create.test.ts`          | `33591f3e3f799c4ff0a97bb9a7389bf83cb0c1919cc67598e02c0b39afc55e4f` | reviewed-retained |

## Verified follow-up fixes

F1 and F3 are implemented locally. `editorialRecordSummary(record, data)` is browser-safe and shared by server inventory and root-owned acknowledged editor metadata. Writing uses summary; projects prefer card copy, then subtitle, then description; home uses intro subheading; newsletter configuration uses deck; other fixed pages prefer hero summary then description. Explicit empty text remains empty. Source values, status, and routes are untouched. Newsletter field labels now use explicit sentence case with CTA retained as an acronym.

At 02:40:56 the expanded eight-file unit run passed **48 tests**, including per-record summaries, malformed metadata, intentional empty text, shared catalog/search values, and unchanged newsletter draft status. No browser or deployment claim is made.

The following current hashes supersede earlier rows for changed files:

| File                                                        | SHA-256                                                            | Disposition |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | ----------- |
| `apps/admin/src/lib/editorial-inventory-projection.ts`      | `eda735b2d22f19e9380fac48e00c2906e1a402b84ade79afbb7bb34dd7d08297` | updated     |
| `apps/admin/src/lib/editorial-inventory-projection.test.ts` | `59b1339a556d7466c92fd0faab81a663ed535a9cd8739247408df2f7747a327f` | updated     |
| `apps/admin/src/lib/editorial-record-summary.ts`            | `7fc0cb259bb216b12fcb3fd785fc1544e0f0008177e67171b9194a9a6eed7c80` | updated     |
| `apps/admin/src/lib/editorial-record-summary.test.ts`       | `9bf3043699ee1417bbc91933c03e77730317348a6676ca9542ec0c01769443ae` | updated     |
| `apps/admin/src/lib/editorial-fields.ts`                    | `63eb7247ff74129759fed7430cdd4042f4e31ae8ac55307d7102bbb27e333e59` | updated     |
| `apps/admin/src/lib/editorial-fields.test.ts`               | `0af347b2bc8c8f872c96468f82b71adfa0fc68ec2df6affac90089e73e55d7fc` | updated     |
