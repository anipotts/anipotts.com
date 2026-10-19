# Editorial media processing: held source preparation

The current source on `codex/media-processing-foundation` is an inactive Images
adapter, bounded streaming/crop plan and atomic private-media commit primitive.
Runtime checkpoint `38a9a2709384c63a1f69973fb7f4e5341e6daf12` has focused and
full-workspace qualification below. No production RPC, route, Images binding or
provider activation connects this foundation. Existing upload admission remains
10 MiB/16 MP, browser crop policy and the 10 MiB whole-publication media budget
remain unchanged. Atomic commit source is implemented; live provenance storage,
provider behavior and recovery integration are unqualified.

The older WASM processing API below records isolated research commit `a15335f5`.
Its routes and smaller processing limits are historical, not active API or
upload policy. Its evidence remains useful for the resource/activation hold.

## Historical WASM/API owner and mutation boundary

Use the existing exact-owner Cloudflare Access session. The media namespace
retains its owner middleware. POST requests require the fixed Admin origin,
same-origin fetch metadata, and the current editorial CSRF cookie/header pair.
Read `/api/editorial/csrf` through the established owner transport; never print
credentials or put them in URLs. JSON remains the default mutation content type.
Only the explicit normalization operation accepts binary octet-stream input.
Private upload/crop authority and publication intent are separate decisions.

| Request                                                                 | Body                                               | Outcome                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/editorial/media?operation=normalize`                         | `application/octet-stream` image bytes             | Retain exact private original and canonical PNG derivative with an immutable relationship |
| `POST /api/editorial/media?operation=crop`                              | JSON `{ parentId, crop: { x, y, width, height } }` | Decode the retained parent and crop its actual pixels on the server                       |
| `GET /api/editorial/media?id=<media-id>`                                | None                                               | Exact stored bytes, owner-only; use this for stored preview                               |
| `GET /api/editorial/media?id=<media-id>&info=1`                         | None                                               | Metadata and up to twenty incoming relationship records                                   |
| `GET /api/editorial/media?id=<media-id>&info=1&after=<relationship-id>` | None                                               | Next relationship page; stop when `nextAfter` is null                                     |

Processing prototypes bound input to 5 MiB, 1,000,000 pixels and a 2,560-pixel
edge. These are processing limits, not a new default upload limit. Crop
coordinates are finite integers in the decoded display coordinate system,
contained within the parent, with positive width/height. The operation crops
without resizing or upscaling. Static JPEG, PNG and WebP are the initial codec
scope; the processing path rejects animation and malformed containers/pixels.

A success response contains `ok`, `media`, `original` and `provenance`.
`media.id` names the canonical PNG; preview that exact ID before selecting it.
IDs are immutable SHA-256 byte identities with a format suffix. A relationship
has its own ID and retains input/output dimensions, parent/derivative identity,
crop geometry, orientation policy and codec version. `originalId` is the exact
input retained by that operation; for a crop, it is the immediate parent.
Follow earlier incoming relationships for normalization ancestry. Different
originals or crops can produce the same derivative bytes; their relationship
records remain distinct. Repeating an identical operation has the same immutable
identities. A different operation is not an authorization to replace the earlier
one. Uploading or cropping does not publish a content record.

Use the existing media-reference helper when adding a reviewed derivative to a
private draft. Do not substitute the private Admin API URL into public content.
Saving, reviewing and publishing the record follow the ordinary editorial
workflow. The existing native CLI covers record authoring; binary processing
commands and browser crop integration are not claimed by this API contract.

## Historical WASM runtime evidence and activation hold

A real local workerd probe showed the stock PNG codec's memory alone reaching
about 146 MB at 16 MP. A worst-case 2 MP prototype exceeded 128 MiB before the
application. A 1 MP noisy PNG and 5 MiB padded JPEG sequence, retaining original,
derivative and storage chunks, produced a preliminary estimate around108MiB.
Calibration with separate8MiB JS and WASM allocations showed that this local
runtime's backing-store counter excludes WASM linear memory. Their measured
sum is therefore appropriate here, but end-of-operation snapshots do not
establish transient peaks or cloud compatibility.
A subsequent actual built Admin/SQLite-DO probe completed normalization,
orientation and stored-parent crop. With processing buffers deliberately held,
its final warmed-codec estimates reached148.80MiB for WebP and168.83MiB for rotated
JPEG at1MP. Garbage collection and enforced cloud limits were not qualified.
A safe peak-memory bound for the full application is not established.
A successful local response does not
prove the cloud memory ceiling.

Full built-Worker/DO packaging and functional tests pass in the isolated lane;
worst-case peak-memory and cloud resource qualification remain required
before activation. Wall time and profiler sampling span
are not Cloudflare charged CPU; the actual account allowance remains unqueried.
Preserving 16 MP processing needs a different qualified implementation or an
approved existing processing service. No billing, binding, CPU setting, feature
flag or default upload policy change is authorized by this document.

## Replacement proposal recorded October 18

Prefer a private Images binding for decoding/normalization, retaining originals
and immutable derivative/provenance records in the existing stores. This is a
source proposal, not a configured binding or provider qualification.

The [binding API reviewed October 18](https://developers.cloudflare.com/images/optimization/binding/)
accepts raw streams without making originals public. Its documented input cap is
20 MB, above current upload admission. Local Vitest/Wrangler emulation supports
only a subset of transformations, so it cannot qualify production crop behavior.
The [Images Free plan](https://developers.cloudflare.com/images/pricing/) reviewed
on October 18 allowed 5,000 unique monthly transformations and rejected new
transformations above that cap without overage charges. This account's actual Images entitlement and
billing mode have not been verified. Do not enable a paid plan or add the binding
as part of the dependency/admin release.

Before requesting activation, prepare a disabled adapter with synthetic fixtures
for malformed pixels, orientation, animation rejection, boundary dimensions,
timeout/cancellation, exact stored bytes and immutable parent/derivative identity.
Stream bounded output into storage; avoid decoding pixel buffers in Admin's
Worker. Keep private response cache controls and preserve existing media reads.
A production-compatible synthetic probe must demonstrate the full 10 MiB/16 MP
admission, charged CPU and memory, crop coordinates, provider failure behavior
and no partial successful metadata. Provider output and bytes must agree.

Activation needs exact approval for the Admin binding/provider setup and any
required additive provenance migration after that evidence is ready. Retain the
previous verified Admin deployment and original media for rollback. No existing
media should be rewritten, deleted or newly published by activation.

## Storage-free Images foundation, October 18

The source foundation on `codex/media-processing-foundation`, based on
`18329ff14`, is separate from the historical WASM/API prototype above. It adds
only an injected Images adapter, stream inspection, pure crop planning and
in-memory provenance at this initial checkpoint. The later atomic primitive is
described below; neither checkpoint adds a production caller, binding, route or
feature activation. The default uploader and browser crop
remain unchanged; original admission remains 10 MiB/16 MP, saved images remain
at most 10 MiB, and the existing whole-publication media budget remains 10 MiB.

`inspectOriginal` consumes a complete full-size provider PNG with incremental
native SHA-256 and PNG framing/CRC checks, then discards the bytes. Its transient
output bound is RGBA16-sized admitted dimensions plus bounded overhead, independent
of saved-media limits. `prepareCrop` reuses the existing approximately 2 MP/2560-edge
browser output policy and returns only a completed, at-most-10-MiB, actual 8-bit
RGB/RGBA PNG candidate. Fractional browser selection is explicitly quantized to
integer provider trim coordinates; exact Canvas sampling equivalence is not
claimed. Original bytes are unchanged. No partial successful candidate or
provenance is returned on overflow, late stream failure, cancellation or timeout.

Evidence is labelled `provider-transcode-completed`, not strict source validity.
The inspector does not inflate IDAT or validate decoded pixels. A provider may
repair malformed JPEGs, and `.info()` alone is not decode completion. This adapter
must not replace existing upload admission. Provenance records exact byte hashes,
application plan/quantization versions and provider identity; its encoder version
is explicitly unknown. It is not a persisted relationship or recovery record.

Initial source checkpoint `91ae3f95f0571580696c2e1d0d06b2e0099307cf` passed 27 focused
Node unit tests covering framing/CRC/hash boundaries, EOF and late errors,
limits, geometry, schema rejection, cancellation and deadlines. Strict source/test
typing and formatting also passed. The integration owner then ran
`test/editorial/media-processing-stream.test.ts` through the actual
`cloudflareTest`/workerd configuration with `remoteBindings: false`: all 3 tests
passed. That narrow native proof covers incremental hashing, PNG CRC/framing,
late stream failure and cancellation of a pending read. The local receipt is
`/private/tmp/anipotts-media-processing-native-qualification.log`; it is not a
portable or production receipt. Synthetic outputs do not qualify Images. Real provider decode, all EXIF
orientations, trim/resize ordering, actual 8-bit output, malformed-input behavior,
charged CPU, peak memory and cancellation remain held. A timeout cancels owned
streams and discards late output, but does not prove immediate termination of
provider work. No account setup, remote probe or paid usage was performed.

The independent review follow-up adds absolute monotonic-deadline checks after
CRC/copy/hash work and final candidate assembly, a validated intent snapshot
before provider awaits, and fixed 64 KiB retention blocks independent of fragment
count. Focused regressions include a valid ready stream past its deadline, intent
mutation during held provider work, and allocation bounds for a valid multi-MiB
PNG with tens of thousands of one-byte fragments. Qualified source checkpoint
`5692a966f2794e3adf3cfe42bb97a6d8571d177a` passed all 32 focused Node tests and
strict source/test typing. The integration owner repeated the actual
`cloudflareTest`/workerd suite with `remoteBindings: false` at that exact source:
all 3 native tests passed, with local receipt
`/private/tmp/anipotts-media-processing-fixed-native.log`. Independent review of
`5692a966` closed all three findings and reported no new blocker. This is narrow
source/stream evidence, not a provider or production qualification.
Cooperative event-turn checkpoints let
timers run during ready streams. [Deployed Workers clocks advance after I/O](https://developers.cloudflare.com/workers/runtime-apis/performance/),
so these checks do not establish CPU preemption or charged-resource limits.

This foundation is parked for a future integration candidate. It is not a
completed authoring feature and is excluded from the current release. Provider
setup/entitlement, real Images qualification and activation remain held. No
custody, backup integration or persisted provenance protocol was added at this
storage-free checkpoint. The subsequent atomic commit source is qualified below;
operational wiring and recovery support still need reviewed implementation and
evidence. No PR,
provider resource or production activation was created for this checkpoint.

## Atomic private-media persistence preparation, October 19

The unconnected `commitPreparedCrop` primitive snapshots original/output bytes
and strictly parses the existing candidate/provenance records before its first
storage await. Both encoded images retain 10 MiB/16 MP admission; crop output
must agree with the planned dimensions and actual 8-bit RGB/RGBA PNG framing.
The pure admission helper is extracted from existing `EditorialMediaStore.save`
without changing its checks, errors, byte IDs or stored metadata/chunk layout.
Neither admission nor persistence independently proves provider decoding.

One existing DO storage transaction checks immutable existing values and writes
missing original/derivative chunks, the provenance edge and request receipt.
Provider work and byte validation stay outside the retryable transaction.
`media-processing-provenance:v1:<derivativeId>:<provenanceId>` preserves separate
edges for shared outputs and permits self identity. Canonical UUID request keys
under `media-processing-request:v1:` bind a receipt to the canonical provenance
fingerprint. Identical retries verify and replay durable state without rewrites;
changed candidates under the same request reject. Corrupt existing metadata,
chunks, edges and receipts fail without repair. A lost acknowledgement can be
resolved by replaying the request; cancellation is not a promise to undo an
already committed transaction.

This source adds no production RPC, route, provider lookup, binding or activation.
It needs no D1 or DO-class migration; the new KV namespaces are an additive data
schema extension. Recovery deliberately continues rejecting these namespaces
until explicit format support preserves their records and references. No backup,
custody, public publication or provider qualification is implied. The existing
10 MiB whole-publication budget is unchanged.

Initial source checkpoint `8058a86dfd76c62d712f7f2ffcf8c64cebb263d6` passed 42
focused Node tests, including 10 primitive/admission tests, and 30 actual local
workerd tests across atomic persistence, existing media-store behavior and the
three stream cases. The local receipt is
`/private/tmp/anipotts-media-atomic-native-qualification.log`.

Owner review then removed redundant SHA-256 work from the retryable storage
callback. Hashing remains before the transaction; metadata, chunk count/keys,
chunk lengths and every stored byte are still checked inside it. At exact
refined source `68f40f336238c9d30aa5dbea6291b8665086453f`, all 10 focused atomic
Node tests and all 27 selected actual workerd tests for atomic persistence plus
existing media-store behavior passed. The local receipt is
`/private/tmp/anipotts-media-atomic-refined-native.log`. Strict primitive/native-test
typing passes using the existing generated synthetic binding declarations.
The actual SQLite cases cover rollback at five write points, concurrent/replayed
requests, lost acknowledgement, shared/self edges, caller mutation and corruption.
These are source/transaction proofs, not Images qualification or operational
recovery coverage. No provider, production data or publication operation ran.

At source checkpoint `38a9a2709384c63a1f69973fb7f4e5341e6daf12`, the Images
adapter and synthetic provider fixture use the runtime types generated by this
worktree's existing `editorial:types` command. They no longer import a second
Workers stream/type universe. `pnpm --filter @anipotts/admin typecheck:editorial`
regenerated the actual synthetic binding declarations and passed strict typing
for all editorial source and tests. Generated declarations remain uncommitted;
no provider binding or configuration was added.

The same checkpoint caps caller byte snapshots with the intrinsic typed-array
byte length before allocation, then copies native indexed bytes without invoking
caller iterators or forged length fields. All 44 focused Node tests passed,
including both new forged-input regressions. The owner-scheduled repeat at this exact source passed all 27 actual local
workerd cases for atomic persistence and existing media-store behavior, using
the shared heavy-slot wrapper with one test worker. The local receipt is
`/private/tmp/anipotts-media-bounded-snapshot-native.log`. Provider entitlement, actual Images behavior, activation,
recovery support and custody remain unqualified.

## Full source qualification, October 19

Full `pnpm validate` passed on exact clean head
`c70cff33f7a3677c0b43d3fd0d612964979d32d5`, using Node 24.19.0. Changes since
runtime checkpoint `38a9a270` were documentation only. The first attempt stopped
in `test:public-boundary`: the isolated worktree lacked the content importer's
`node_modules`, so generated content code could not resolve `zod`. That was a
qualification setup failure, not a completed validation. Its original receipt
remains `/private/tmp/anipotts-media-foundation-full-validation.log`.

Only the two verified dependency symlinks were unlinked; their shared targets
were preserved. `pnpm install --offline --frozen-lockfile --ignore-scripts`
completed in 5.9 seconds with no source or lockfile changes. Root, Admin and
content importer dependencies are now physical directories owned by this
worktree; content's `zod` resolves inside its own root dependency graph. The
install receipt is `/private/tmp/anipotts-media-foundation-isolated-install.log`.

The single validation retry passed CI invariants, formatting, build (6/6 tasks),
lint (4/4), typechecking (14/14) and tests (14/14). Turbo reused 5, 3, 13 and 13
cached tasks respectively. Reported suites include content 206, Admin DOM 2,405,
Astro 79, Worker 113 and built CSP 3 passed/1 skipped. These counts include cached
task receipts; they are not a claim that every task executed afresh. The retry
log spans about 200 seconds and is retained at
`/private/tmp/anipotts-media-foundation-full-validation-r2.log`.
`check-build-drift.mjs` passed afterward and the tracked tree remained clean.
These local logs are not portable CI or deployment receipts.

No separate browser or real-provider qualification, or production operation,
accompanied this full source check. Images entitlement, real decode/orientation/crop behavior,
charged resources, cancellation, persisted provenance activation, recovery
namespace support and custody remain held. Full source validation does not
establish an operational media-processing feature.

## October 19 released-main integration qualification

#539 is deployed to Admin at `cf7b757b`; exact provider/schema and eight Access
redirect probes pass. #542 is merged at `aa860b4b`; its
[release 39275594601](https://github.com/anipotts/anipotts.com/actions/runs/39275594601)
succeeded with all six runtime targets and Production skipped, no migration.
Both exact approvals and source/release receipts are in the existing queue.

Media full qualification at `08029df7108f50323acb597dcb794918893507c1`
passes all fourteen `pnpm validate` tasks: Admin 2,509 core / 79 Astro / 113
editorial workerd / three CSP checks plus one existing skip. Focused foundation
coverage remains 44 Node-environment and 27 actual workerd cases.
Logs: `/private/tmp/anipotts-media-main539-{install,validation}.log`.

The normal merge of #542 at `62c6117a5ec15d864d9808559f3941533f5746ec`
changes only the independently qualified unused CLI/config/lock cleanup and
documentation. All app, package, script, worker, Turbo, workflow, runtime config
and migration source bytes equal the full-qualified tree. A fresh offline frozen
install, complete CI invariants and formatting pass on this final combination.
Post-check drift is clean; nine sensitive changed paths pass static review;
the earlier full-built 344-file Admin bundle excludes local-owner markers.
Logs: `/private/tmp/anipotts-media-main542-{install,checks}.log`.

Keep #540 draft. Provider entitlement, actual decode/orientation/crop/resource
qualification, recovery integration and activation authority remain open.
Its proposed target remains Admin only; no production setup, route, binding or
migration is activated. Later checkpoint documentation preserves this source.
