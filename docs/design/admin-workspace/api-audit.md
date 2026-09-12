# Admin API and authorization boundary audit

Audited 2026-09-12 against the current uncommitted workspace. This is a code review receipt, not provider/live proof. Only this document was written by the audit task. No account, credential, content, relay, MCP or provider action was executed.

## Scope and disposition

All **11 files** under `apps/admin/src/pages/api` and `middleware.ts` were read in full. The directly relevant authorization, editorial dispatch, runtime and media helpers below were also read in full. `reviewed-retained` means the existing behavior was examined and is retained in this UI change; it does not mean every transitive dependency or runtime condition is verified. `compatibility` marks older D1 content endpoints whose removal is not authorized by a navigation redesign. `updated` identifies existing task changes inspected, not edits made by this audit.

The shared query loader and inbox aggregation were inspected only at their failure/provenance boundaries, not audited in full. Their remaining implementation belongs in the broader dependency coverage ledger. No claim of whole-repository security completion is made.

## Route and helper coverage

Paths are relative to `apps/admin/src`. SHA-256 fingerprints identify the exact reviewed file bytes and must be refreshed if later implementation changes them.

| File                                         | SHA-256                                                            | Disposition       | Code evidence                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/api/admin/content/draft-operation.ts` | `cc1bdcc335cd9463a180eab6683a5a15a9b3c7f9db37a83eefaff379ad0e899a` | compatibility     | POST native mutation capability draft:save before JSON handling; 415/503/400 errors; private response. Retains D1 operation writer, not Git editor.                                                                                                                              |
| `pages/api/admin/content/editor.ts`          | `13bde5a87712051b53b6a44e24356fa8142be2b7a782602edc79c3bdc62b20a5` | compatibility     | POST dispatches save_draft/content:publish through native capability, fresh step-up and CSRF; actor derived from principal. Retains D1 publication semantics, not exposed as Git-editor equivalent.                                                                              |
| `pages/api/admin/control-plane.ts`           | `79383af26cf95eccd49beee83e24a7a2459ae9b6656632597eb31b8e1e464147` | reviewed-retained | GET principal/read-only Access with explicit available=false ->503; POST requires control:execute and only fixed round-trip relay submission. Actual request-size bound remains incomplete; F2.                                                                                  |
| `pages/api/admin/inbox.ts`                   | `25d58203d22009de56e90c8096c2d04f17bcb5adf245f593135aa9fbafa7add2` | reviewed-retained | GET depends on middleware and returns read-model mode/provenance; POST action:stage native guard plus existing schema writer. No Website fetch added.                                                                                                                            |
| `pages/api/admin/knowledge.ts`               | `eac2ca8093b5c7a0763a7dc0bdb3750395aa889652de359de4e6a8e9fa189911` | reviewed-retained | GET middleware-protected operational knowledge; allowlisted domain and bounded result/context budget. Detail missing/failure conflation needs F1 fix.                                                                                                                            |
| `pages/api/admin/projections.ts`             | `bc15e55b2128d4e3d317f2cdc1d13492a1e973421763ecb70d8763870bab5209` | reviewed-retained | GET middleware-protected operational snapshot; DEV fixture import isolated; production preserves source_mode/errors; response no-store.                                                                                                                                          |
| `pages/api/admin/runtime-feed.ts`            | `1ddca884614a15209d14777b461e757c3a28ea5f674c482391b027fd21a5c236` | reviewed-retained | GET middleware-protected runtime response; dependency disables production filesystem feed. No operational data added to Website.                                                                                                                                                 |
| `pages/api/editorial/[action].ts`            | `fc5ba2360d672ff3ab9b06891280c07f8fffdb2a922ea18346be79a60b75a9ad` | reviewed-retained | ALL delegates authenticated namespace to homeEditorApi; production runtime gate; explicit503 on configuration/storage failure; DEV has no publisher argument.                                                                                                                    |
| `pages/api/editorial/media.ts`               | `0b072a83497ad0ac136cd5adca49ef63ec60015234abc515bbefcbe1249058dc` | reviewed-retained | ALL delegates owner namespace to private media API, unavailable bindings/storage503; no public upload route.                                                                                                                                                                     |
| `pages/api/health.ts`                        | `92545ca3092a459d220803ab4ae11e9dc4e68d04934861715e0b353036780e70` | reviewed-retained | Public GET exposes only app/target/release/schema metadata, no private records. This response alone does not prove authentication or deployment interaction health.                                                                                                              |
| `pages/api/mcp.ts`                           | `fe8a55ba4f4d03fe5d29473c141d16469089a1bfc00ea027ff8759c6f422138a` | reviewed-retained | Public-path middleware exemption is followed by explicit bearer mcp:read check in BOTH methods. JSON-RPC remains snapshot-backed read-only; malformed JSON400. No browser session accepted in place of bearer.                                                                   |
| `middleware.ts`                              | `73d7f90508a4fd01f87d6af5c14656cdc72b0eb0cd6aaa900fca15c4a92643f3` | reviewed-retained | Website/editorial/preview owner assertion branch precedes retained Operations session branch; DEV owner bypass requires explicit preview flag and approved origin. Operations Access is GET/HEAD viewer-only. Native sessions remain separate. Preview sandbox/no-store applied. |
| `lib/access-identity.ts`                     | `9b2e654dcfd3b5d676ecda0c8483bcc831b4d9ac41af02e312645b49f22c8d50` | updated           | Only diff extracts the identical fixed owner constant. Signature issuer/audience/RS256/expiry/iat/email/app-type checks retained; spoofed headers/service identities fail closed.                                                                                                |
| `lib/editorial-owner.ts`                     | `282e937ae6a3e6f78b8681f1169538a2b47bceacf58caee6933806deab77213f` | updated           | Single existing fixed owner constant moved into standalone module for presentation/recovery typing; no new identity or account policy.                                                                                                                                           |
| `lib/admin-access-policy.ts`                 | `cd5fa6b0b69bd917ee30aec3e323e1050829a4c65dc1515b9b45bead5d567e4a` | reviewed-retained | Explicit public-path and DEV read-only approved-origin allowlists. Historical auth API names in allowlist are not evidence of currently implemented handlers.                                                                                                                    |
| `lib/admin-auth.ts`                          | `333b296669e5f8c21ae96fbdcedb6ce05fbcfb178c2479851d3786e99009f9b0` | reviewed-retained | Session expiry/active-user query; session-bound CSRF; exact origin; role capability and fresh step-up; restricted recovery sessions. Legacy migration retained. No auth policy diff.                                                                                             |
| `lib/admin-machine-tokens.ts`                | `d2139edc32466d6820e41cd0077f39556ae1801fff9768f0ad90a523097273c0` | reviewed-retained | Bearer parsed strictly; stored hash, expiry, revocation and mcp:read scope checked. Creation/rotation/revocation require identity:manage. Account disable/token revocation coupling is not established by this audit; reserved follow-up, F3.                                    |
| `lib/editorial-server.ts`                    | `f5b71343c0da0ca927dab8cd9ad77c49d357231a609936cfcb6726306e7e3c64` | reviewed-retained | Runtime configuration must be valid; fixed production Durable Object name; no client-provided repository, identity or target.                                                                                                                                                    |
| `lib/editorial-security.ts`                  | `7b62c6fb142509639b0fc258e2f6b434af5501480dff54275ce0613102ef2eb5` | reviewed-retained | Private headers on errors/success, secure strict host CSRF cookie, duplicate-cookie rejection, exact origin and Sec-Fetch-Site, bounded streaming JSON actual bytes/UTF8.                                                                                                        |
| `lib/editorial-home-api.ts`                  | `2d477525a270dd4b125eb7a3814702eb0a7ab0c4316df37a1282174e485b9faf` | updated           | Only current diff adds owner recoveryScope to authenticated record response. Validated identities/server-owned Git base, revision/idempotency and explicit publication disclosure/publisher gates remain. Local wrapper provides no publisher.                                   |
| `lib/editorial-media-api.ts`                 | `48c849c430819b75c9853fe2929f56e7560b5b899c7811d4a54e36e12a613f83` | reviewed-retained | Private GET/POST, CSRF and bounded streaming JSON, canonical base64; unsupported methods405. Content type/identity validated by immutable store.                                                                                                                                 |
| `editorial/runtime.ts`                       | `9b2076068ab2a65487ed8bc156879775cfaf812428fb1b7e3f95886c4c6f3add` | reviewed-retained | Deployment-owned enabled flags and valid app bindings required; publishing additionally requires signing key and exact release SHA. No runtime key values read in this audit.                                                                                                    |
| `editorial/media-store.ts`                   | `c607774289008bcb32d6ac840f69f126e462e6272981ca45a10709c7d1792dce` | reviewed-retained | 10MB supported raster inputs; SHA256 immutable identity; atomic metadata/chunks; read validates ID/chunk length/hash. No delete or public mutation.                                                                                                                              |
| `data/knowledge.ts`                          | `310693b54d8c355efb03439d58f801218881a5c52f98deac6e8cdeac84bbdc30` | reviewed-retained | DEV fixture only; production shared projection. List includes source_mode/errors, but detail drops read errors before null lookup (F1).                                                                                                                                          |
| `data/runtime.ts`                            | `88e3ac32cb1c261fb3b657136014ca996f66ebed2cc4ddff76dd4cccfb9d3169` | reviewed-retained | Production immediately returns disabled overlay; DEV reads fixed local path with explicit error response. No runtime payload read during audit.                                                                                                                                  |
| `data/control-plane.ts`                      | `d2bfe817e08308b7d4a98d01dcd6f5a216e63887777fa8f38e7f093f55a1aa5e` | reviewed-retained | Fixed device/capability, five-minute expiry, reason validation; missing/failing relay explicit unavailable error; no arbitrary command/target selection.                                                                                                                         |

## Findings and next actions

### F1: Knowledge lookup converts unavailable data into a missing record

`pages/api/admin/knowledge.ts:19-27` returns 404 when `readAdminKnowledgeCard` is null. `data/knowledge.ts:39-40` discards snapshot errors/source mode before that lookup. The shared `packages/lib/src/admin-control/queries.ts:383-420` explicitly returns empty rows plus error metadata when D1 is absent or the table read fails. Therefore a provider failure becomes “unknown knowledge card,” which violates the redesign's unavailable-versus-empty requirement.

Recommended focused fix: retain status/provenance through detail lookup; return private/no-store 503 on unavailable knowledge storage and reserve 404 for a completed successful lookup. Test successful card, genuine missing card, missing DB, and rejected knowledge query separately. No authentication change is needed. Not fixed in this read-only audit.

### F2: Operational mutation request-size guards do not bound streamed bodies

`pages/api/admin/control-plane.ts` checks only a supplied Content-Length before `request.json()`. An absent or inaccurate header bypasses that bound. The compatibility D1 mutation handlers and MCP POST also parse JSON without an actual byte ceiling. Existing capabilities limit who can invoke those operations; this is not an unauthenticated write bypass. Editorial mutations already use the stronger bounded reader.

Recommended follow-up: use a narrowly scoped bounded JSON reader with per-operation limits, preserving existing native guards and error semantics. Include absent/inaccurate Content-Length tests. Do not expand compatibility endpoints or introduce operations into Website merely to exercise this. No code change was made.

### F3: Machine-token and account disable coupling remains unproven

`admin-machine-tokens.ts` verifies token expiry/revocation/scope without joining the account's active status. `revokeAllUserAccess` in `admin-auth.ts` revokes sessions and passkeys, not machine tokens. The audit did not establish whether another existing account-management path revokes all machine tokens. Do not claim account disable invalidates every bearer token based solely on this code. Changing token authorization or recovery semantics is a separate reserved auth decision, outside this UI change.

### Compatibility reachability

Middleware covers legacy `/content/*` pages under editorial owner authentication while native `/api/admin/content/*` writes retain native session/step-up capability requirements. Those are separate data and authority models. Removing legacy links from Website does not authorize deleting records, aliasing those APIs to Git publishing, or restoring removed auth routes. Several historical public auth API names remain allowlisted although no matching file exists in the current 11-route API inventory. A public allowlist entry alone is not an implemented endpoint.

## Test evidence

Executed targeted existing suites during this audit:

```sh
pnpm --filter @anipotts/admin exec vitest run \
  src/lib/admin-auth.test.ts \
  src/lib/admin-access-policy.test.ts \
  src/lib/access-identity.test.ts \
  src/lib/editorial-security.test.ts \
  src/data/control-plane.test.ts
```

Result: **5 files, 90 tests passed**. Local log: `/private/tmp/admin-api-audit-tests.log` (01:17 local). Read assertions establish exact-origin/session CSRF, capability policy, expiry/step-up, host cookie, signed Access identity and viewer-only retained reads, approved preview origins, private errors, actual-byte JSON limits, and bounded relay command construction/unavailable responses. These tests exercise helpers; they are not a full Astro middleware-plus-route integration proof.

Existing integration suites identified for release verification, not rerun by this audit:

- `test/editorial/home-api.test.ts`: reviewed-base rebase, disclosure/CSRF, frozen revisions/status isolation, path identity, invalid intermediate private source and conflicts, recoverable discard/restore.
- `test/editorial/writing-create.test.ts`: stable creation retry identity/collision, existing published path rejection.
- `test/editorial/media-store.test.ts`: private upload/read headers, original chunk retention/immutable retry, active format and oversized rejection.
- `src/lib/admin-auth-security.test.ts`: device/recovery and retired route policy; not proof that unavailable auth routes were restored.

No direct route test was found for the knowledge detail failure distinction or complete MCP bearer endpoint lifecycle in this bounded search. These remain explicit evidence gaps, not passed checks. Live authenticated and unauthenticated routes, expired sessions, private caching, native provider protections and deployed UI behavior still require the root task's release/browser QA.

## Diff boundary

At audit time no file under `pages/api` and no `middleware.ts` behavior changed in the task diff. The inspected auth-adjacent differences were the same-value owner constant extraction and the authenticated record response's `recoveryScope` addition. No new auth scheme, operational endpoint, public-content mutation, or credential changes were introduced by those differences.

## F1 implementation follow-up

The subsequent focused change now returns 503 for unavailable knowledge storage,
404 only after a successful absent lookup, and renders a recovery banner in the
knowledge page. Four data/route tests pass; Astro check passes. Original hashes
above remain the before-fix audit snapshot for the two affected knowledge files;
the final integration ledger must record their updated hashes after review.
F2/F3 remain separate recorded limitations; no authorization change was made.
