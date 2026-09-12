# Publication and private storage services audit

Snapshot: 2026-09-13. Read every line of the 32 pending source/test files listed below. This audit does not mutate services, storage, auth, credentials, provider policies, or public content. Findings were reported to the integration owner before proposing implementation. No completion of provider or browser verification is claimed.

## Findings and concrete limitations

### F1: old conflict retry can lose its idempotent response

`draft-store.ts:445` inserts a conflict using the request ID as a primary key. `save_requests` receipts are pruned to 100 per record at line 486; `conflicts` is not pruned. If a conflicting save receipt is evicted and its original request is retried after 100 newer requests, revision conflict remains true but the second plain INSERT targets the existing conflict ID. SQLite therefore raises a duplicate-key error rather than returning the retained conflict receipt. This is a source-derived edge case, not an observed production incident. Existing tests verify recent retries, losing-source retention and 105 successful revisions, but do not combine receipt eviction with old conflict retries. Preserve the original conflicting payload when fixing; do not silently replace it or purge user data. A focused real SQLite regression test should precede the fix.

### F2: three provider response readers omit the normal streaming size bound

`github.ts:728` (`existingPR`), `:836` (`returnedSha`), and `:925` (`branchHead`) call `response.json()` directly. Most other provider reads pass through the 2 MiB streaming `responseJson` reader. All destinations are fixed GitHub endpoints, requests have timeouts and redirects are manual, so this is not an arbitrary-host or credential disclosure finding. It is an inconsistent resource bound if the provider returns oversized JSON. Existing tests cover malformed and substituted fields but not oversized bodies on these three branches. Reuse the bounded decoder if approved; keep current expected-status and reconciliation semantics.

### F3: long provider stages can outlast the durable lease

`publication-jobs.ts:38` fixes a 60-second lease. Settlement rejects results after expiry. A stage includes multiple sequential GitHub calls, each with a 15-second timeout, plus a complete inventory preflight and sometimes media reads. There is no lease extension or partial checkpoint inside that stage. Thus a slow but individually successful sequence taking more than 60 seconds cannot settle its checkpoint; a subsequent attempt repeats the stage. Deterministic writes and lease checks protect consistency, but sustained slow-provider or large-inventory forward progress is not proven. Existing tests cover expired-lease reclamation and stale result rejection, not a stage that consistently exceeds its lease. This is a latency/scaling limitation, not evidence of publication duplication or a mandate to weaken leases. A clock-controlled stage-duration regression and explicit stage budget/checkpoint design are appropriate follow-up.

### Retention scope

Revisions and save retry receipts are bounded to 100 per record. Conflict source snapshots and immutable publication receipts have no pruning path in this class. Discard is soft and recoverable within 30 days; no automatic delete runs when the window ends. Inventory enumeration returns all current writing draft snapshots without pagination, so long-term growth remains a scaling concern. No retention or purge change is authorized by this audit.

## Reviewed safeguards

- **Private drafts:** canonical record-derived paths, source size bounds, expected-revision transactions, payload-hashed operation IDs, preserved malformed intermediate text, explicit rebase, soft discard/restore, and losing-conflict source retention. Base changes after verified publication update only the matching base; later source typing remains intact.
- **Frozen publication:** immutable source/revision/record receipt; duplicate clicks and new IDs for the same revision resolve to one publication. Existing receipts can be reconciled after subsequent editing without switching their bytes. Schema-invalid, discarded, stale, or identical-to-base new freezes are rejected. Status/receipt reads remain record scoped.
- **Coordinator:** pre-armed recovery alarm before external I/O; first unfinished operation blocks overtaking, including when held; version/lease comparisons reject stale settlements; explicit retry preserves checkpoints; cancellation remains limited to pre-deploy phases and a racing merge continues to deployment verification. Sanitized checkpoint keys contain references, not tokens or source.
- **Preflight:** one inspected Git head and tree, exact path/blob/mode comparison, safe missing-file handling, complete bounded canonical inventory, four concurrent source reads, schema/reference validation, and release readiness before Git object disclosure. No write capability is present in the preflight input type.
- **Media and signing:** referenced immutable images must have exactly one matching attachment, bounded count/total bytes, canonical base64, and matching SHA-256. Manifest binds operation ID, revision, exact parent and file hashes. Signing failures are generic; no raw credentials/body is in manifest. Signed source/media/manifest enter one Git tree, with deterministic timestamps and parents for ambiguous retries.
- **GitHub adapter:** fixed repository and operation branch prefix; no force update or reopening of closed publications; exact branch/PR/repository/head identity checks and lost-response reconciliation; installation grants restricted to one expected repository and exact required permissions; short-lived signed JWT and bounded token response; generic failure codes preserve rate-limit delay.
- **Protection and release:** active no-bypass provider rules plus strict required checks from expected app IDs; latest check attempt must succeed, not skipped/neutral. Merge pins expected head and uses native protected squash/auto-merge. A behind/dirty frozen head blocks. Deployment observation requires the exact push workflow and successful Deploy www job. Live verification checks ancestry, exact Git source blob, expected route status, image MIME/digest and stable release identity before live completion.
- **Known proof limit:** route verification checks expected HTTP status, not semantic DOM text or layout. Exact source/release identity is necessary evidence but does not replace browser QA of a renderer.

## Tests read and their coverage

| Test group                         | Evidence read                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft store and home API           | Real Durable Object SQLite; eviction persistence, concurrent saves, retained conflicts, request reuse, bounded history, path isolation, explicit rebase, disclosure/CSRF gates, private responses, discard/restore.               |
| Publication receipt/jobs/alarm     | Real SQLite immutable snapshot, duplicate freeze, no-change rejection, record-scoped retry/cancel, preserved newer edits, eviction/alarm recovery, lease reclaim, serialized queue, backoff, required stage ordering.             |
| GitHub app/checks/protection       | JWT verification and grant bounds, generic failures, strict app-bound latest checks, complete ruleset/bypass proof including GraphQL fallback. Provider responses are mocked.                                                     |
| GitHub snapshot/content/PR/adapter | Immutable-head traversal, missing vs truncated inventory, symlink/identity rejection, BOM/Unicode byte preservation, SHA/size validation, real Workers Request construction, lost branch/commit/PR/close response reconciliation. |
| GitHub release                     | Expected head in native merge input, blocked stale head, check revalidation, auto-merge reconciliation, exact deployment target receipt. Some protection methods are mocked independently of their dedicated tests.               |
| Preflight/prepare                  | Complete repository fixture source validation and reference consistency, overlapping file changes, fixed parent and path, lifecycle checkpoints, release hold, deploy/verify gates.                                               |
| Signature/media                    | Actual signing and real CI signature verifier unit test; Workers signing/tree integration; immutable image digest binding, missing/duplicate/substituted attachments, private media API and chunked storage.                      |
| Live release                       | Mocked health and Git source/ancestry, public change and stale renderer holds, exact route status, stable health identity, exact image MIME/digest.                                                                               |

The integration owner supplied a recent full editorial suite result of **89 passed**. This audit inspected test source but did not independently rerun that suite because no service logic changed. That supplied result is not new runtime or live-provider proof. The three edge cases above are not covered by that result and were not exercised against production. API middleware/auth source has its separate audit; this document does not count those files again.

## Exact reviewed snapshot

All files below are **reviewed-retained**: inspected at these hashes, with no edits by this audit. Findings remain explicit rather than being represented as fixed.

| File                                                      | SHA-256                                                            | Disposition       |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| `apps/admin/src/editorial/draft-store.ts`                 | `0151aeef4f7508e4400d770e0578433edf9c16758f24cbc7210a1f907b4f5ea5` | reviewed-retained |
| `apps/admin/src/editorial/github-app.ts`                  | `98f05be097feb28657a7750214714c152dd6eed2a8952e711c459d37a140fe7f` | reviewed-retained |
| `apps/admin/src/editorial/github.ts`                      | `0d067b9f97e793998a48013cc3421a02f01b1e2a545e89860fcd1e52a2fc6fb5` | reviewed-retained |
| `apps/admin/src/editorial/prepare-publication.ts`         | `e8b4c151d64bae8ee7df826236fe8a71278ba2b211aec4f1a567d069c30db7b1` | reviewed-retained |
| `apps/admin/src/editorial/publication-alarm.ts`           | `b5ba5cefc3cf49490f51441e2f8b0e5d71b213e6509694e5f1d85237418b407b` | reviewed-retained |
| `apps/admin/src/editorial/publication-jobs.ts`            | `faa721e16e94a8db3bd9412f36d890749d0190c05f60a1ac420bce2c88a9170c` | reviewed-retained |
| `apps/admin/src/editorial/publication-media.test.ts`      | `eb5f4e16eef139487c10c3c3c988c2dbf57afe4c8ab686f2d28b94d555a85ae3` | reviewed-retained |
| `apps/admin/src/editorial/publication-media.ts`           | `17bb6def5d1952ec8d8b277b63d148a23bb27603b4c28a881133f2914440037b` | reviewed-retained |
| `apps/admin/src/editorial/publication-preflight.ts`       | `31cf125b66d92e9f0706d70eb234ab065c52f359b107d241c8d4916b6faf9cc6` | reviewed-retained |
| `apps/admin/src/editorial/publication-signature.test.ts`  | `a87dff14e4f0c1ce40874f5e6a51b3d9cc39ee058323bb6eab32f78825c7e53d` | reviewed-retained |
| `apps/admin/src/editorial/publication-signature.ts`       | `3b6827b1809ae4924624eed18c55140a4a95665eaf102a575dbf91fbc6bb1d5f` | reviewed-retained |
| `apps/admin/src/editorial/publication-stage.ts`           | `3100c7e1a288080847a685e6f91d713bd62def2745392ac37857cd74154cd2a3` | reviewed-retained |
| `apps/admin/src/editorial/publication.ts`                 | `758179033b5582c73b9e46908f52eab729763256944ccb2f54c9009b96ef5161` | reviewed-retained |
| `apps/admin/src/editorial/release.ts`                     | `d3050d041e02dc44502be459de3bb4592e7bd74e606d420cd82d0d26ae4cb0dd` | reviewed-retained |
| `apps/admin/test/editorial/draft-store.test.ts`           | `b1cd03c76423b6ef7afc775dd23bd432cce98d4550e05cadb488abbcc7b5013d` | reviewed-retained |
| `apps/admin/test/editorial/github-app.test.ts`            | `63b744fe42454f85e577590b281d08b977055094d5b3d1504cc975c1e0f61043` | reviewed-retained |
| `apps/admin/test/editorial/github-checks.test.ts`         | `568e07c5cb8e12ec5b48e1344a8dc2d4886aa86854931c96755a8d05c11a9436` | reviewed-retained |
| `apps/admin/test/editorial/github-content.test.ts`        | `e488ea72a21c8620f1260daf4555a8d63d15e491fa93ff3b9572ba3934ebee3a` | reviewed-retained |
| `apps/admin/test/editorial/github-pr-status.test.ts`      | `43ceed7a7d38c05de25d89513ae8e99dff3dfaf48f386e87a96e7a1a3c9d44b7` | reviewed-retained |
| `apps/admin/test/editorial/github-protection.test.ts`     | `d1a6f81ca576ad613a77a3c124ac221394f9aeee2048f2142ae8a57a8233a7db` | reviewed-retained |
| `apps/admin/test/editorial/github-release.test.ts`        | `c8ec52d66e248d392af9c8526851e6b2d7da0e3b429ca96f59ebd58b15c09aaf` | reviewed-retained |
| `apps/admin/test/editorial/github-snapshot.test.ts`       | `30074e8ad15cef44b11dd21149c564ac03a135f98a1f50962634463e2a8be261` | reviewed-retained |
| `apps/admin/test/editorial/github.test.ts`                | `0b28629d2cace78d747231a09ddd33ef94ad7908ceac294535f6ab289144e650` | reviewed-retained |
| `apps/admin/test/editorial/home-api.test.ts`              | `807fbbd55851358717830f91d7b237234b8ef3adf62da85f53a244dd74a70c39` | reviewed-retained |
| `apps/admin/test/editorial/media-store.test.ts`           | `1e192e7d04f781283adc69348e3277a5eb8b14c6756072831221b73d92557a1c` | reviewed-retained |
| `apps/admin/test/editorial/prepare-publication.test.ts`   | `7516aa49eb28aa0fba1c5b138e665033a7ffb5467c08ad5cf7083e89e706494f` | reviewed-retained |
| `apps/admin/test/editorial/publication-alarm.test.ts`     | `a83ad960756c9801ebe39e549e8c141fe0be83f76d4d83b21e6b9c8d5f4e7aae` | reviewed-retained |
| `apps/admin/test/editorial/publication-jobs.test.ts`      | `b46b8914b3d327164d2468430c2745f6b0b26f0f8ae9f76d32ea6087307f0cce` | reviewed-retained |
| `apps/admin/test/editorial/publication-preflight.test.ts` | `31d9cdb02807d261223db24f321bf2727da963e5989dca7d44333d16f07cc579` | reviewed-retained |
| `apps/admin/test/editorial/publication-signature.test.ts` | `c1c3d4610d70af473effbce4467b18760af3f6efbd86e31e4fd8e4beefbe9025` | reviewed-retained |
| `apps/admin/test/editorial/publication.test.ts`           | `72cd8042f0d4ca09a3f78f7adaf51a8f5947b1e63f500744b1a3d54bbb928d14` | reviewed-retained |
| `apps/admin/test/editorial/release.test.ts`               | `ee9ff6052807a74000c50c578785bb49d09769a3b9a0879f2ed47b62071f1a30` | reviewed-retained |
