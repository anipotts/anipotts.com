# Editorial media processing: held source preparation

This is an additive processing API under qualification. Existing uploads retain
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
its warmed-codec estimates reached about148MiB for WebP and167MiB for rotated
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
