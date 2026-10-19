# Editorial media processing: held source preparation

This describes isolated research commit a15335f5, not routes implemented in the
current522/524 source candidates or proven deployed on production. Keep the
prototype isolated: it has no qualified production resource bound. Existing uploads retain
10 MiB / 16-megapixel admission and existing media stays readable. The default
browser uploader is unchanged. The processing API is not a production receipt
or proof that every existing upload can be decoded safely.

## Owner and mutation boundary

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

## Runtime evidence and activation hold

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

## Recommended replacement, October 18

Prefer a private Images binding for decoding/normalization, retaining originals
and immutable derivative/provenance records in the existing stores. This is a
source proposal, not a configured binding or provider qualification.

The [current binding API](https://developers.cloudflare.com/images/optimization/binding/)
accepts raw streams without making originals public. Its documented input cap is
20 MB, above current upload admission. Local Vitest/Wrangler emulation supports
only a subset of transformations, so it cannot qualify production crop behavior.
The [Images Free plan](https://developers.cloudflare.com/images/pricing/) currently
allows 5,000 unique monthly transformations and rejects new transformations above
that cap without overage charges. This account's actual Images entitlement and
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
in-memory provenance. No production caller, binding, route, storage write,
migration or feature activation exists. The default uploader and browser crop
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

Source checkpoint `91ae3f95f0571580696c2e1d0d06b2e0099307cf` passed 27 focused
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
