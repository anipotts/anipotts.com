# Browser recovery compatibility, R3a

The R3a sections below retain the plaintext compatibility baseline. The
**Consumer integration** section records the new local
`codex/browser-recovery-unlock` implementation, based on `e43d9557b`. It is not
the deployed #531 behavior or part of the frozen #538 candidate. Full validation,
actual browser acceptance and release evidence remain with the integration owner.

This increment implements the browser boundary of the Quiet Precision recovery
contract. Production private drafts remain authoritative. It does not implement
encryption, backup guarantees, a cloud replica, publication, or transfer.

## Formats and ownership

- Existing `editorial-recovery:v1:[account,kind,id]` values are legacy snapshots.
  They remain readable. V2 writers never update or remove these keys during
  editing, acknowledgment, or migration.
- `editorial-recovery:v2:[account,kind,id]` contains
  `{format:"anipotts.browser-recovery",version:2,kind,payload,legacyRaw,logoutGeneration}`.
  `kind` is `draft` or `new-writing`; `payload:null` is an acknowledgment marker.
  `legacyRaw` is the exact legacy string seen at adoption. Null means absent.
  `logoutGeneration` captures the existing persisted logout signal, including null.
- Draft payloads retain exact source, saved baseline, revision, and any pending
  save source/revision/request ID. Creation retains title, slug, custom-slug flag
  and the matching pending creation request. Recovery never assigns a new retry
  identity to an existing pending operation.
- Storage is origin scoped and keyed only by the server-provided owner scope.
  Unscoped legacy sessionStorage is neither read nor deleted.
- Source and pending-source limits are 512 KiB each, measured as UTF-8 bytes.
  Creation title/slug recovery limits are 10,000 UTF-8 bytes each. Envelope input
  has a bounded pre-parse size to reject oversized opaque values safely.

## Mixed tabs and unsupported data

V1 reading remains supported through the planned 30-day mixed-version window;
this change does not schedule its removal. Old tabs can continue writing v1. V2
never pretends to lock those writers: a changed legacy string produces an explicit
choice, including when an older tab authors new text after a v2 acknowledgment.
An unchanged legacy string behind the acknowledgment marker cannot resurrect a
previously saved draft.

New tabs serialize v2 writes with a same-origin Web Lock (two-second wait limit) and compare both stored
strings against their last observation while holding that lock. A stale writer
refuses to overwrite newer recovery, including when acknowledging a save. Normal
editing and server saves still work when Web Locks/storage is unavailable, but the
UI explains that recovery cannot be guaranteed and warns before leaving with
unsaved input. There is no unsafe fallback to uncoordinated writes.

Missing, malformed, unsupported, oversized, unavailable, signed-out and changed recovery are
separate outcomes. Unsupported envelope fields or versions are opaque and never
silently rewritten. The user can download exact stored strings and a separately
labeled current tab copy in a private JSON bundle. The current copy includes the
latest flushed local input and any pending operation identity; downloading never
flushes a server save or retries that operation. If storage cannot be read, the
bundle marks `storedStatus: "unavailable"` and still includes the current copy.
Download checks the existing document session before and after collecting copies.
If persisted logout or session admission cannot be verified, the form locks and
does not emit a plaintext current-copy download. A recovery-record read failure
alone can still be labeled unavailable while the admitted session remains valid.
`currentCopy.key` is null when no owner-scoped storage key was available. Stored
entries remain opaque; the bundle is for manual recovery, with no automatic import,
save or publication. A divergent legacy/current pair offers read-only previews and explicit
recovery choices. Choosing a supported copy archives the displaced v2 envelope
before writing; original v1 data remains. Browser archives are bounded to three
copies to limit origin storage use; they are not durable revision history.
If another tab changes either copy while the choice is open, selection refuses
and preserves those values. Save/download current edits before reopening.

## Editor behavior

A recovered draft is shown without a server save or publication. Autosave pauses
until the explicit **Save recovered edits** action. Restoring a review, preview or
history deep link does not prepare or flush a recovered revision automatically. Other explicit save/preview/
review/navigation actions retain their existing private-save behavior. The pending
request is retried with its exact identity, even if the source already matches the
server after a lost acknowledgment. Explicit choices retain the original base
revision so server divergence uses the existing conflict workflow.

Merely mounting or synchronizing the hidden source editor does not emit an authored
change. This prevents CodeMirror's internal newline normalization from changing a
recovered CRLF request. Source edits use the source's CRLF/LF convention; untouched
source, including Unicode and mixed line endings, is retained exactly.

Creating an article still requires **Create draft**. Recovery does not submit it.
A successful save/create writes a v2 acknowledgment marker rather than removing
legacy data. Unknown/corrupt browser recovery does not overwrite the server draft.

## Privacy and next gates

These values and downloads are **plaintext private recovery**, not encrypted backups.
Existing explicit logout still clears editorial recovery in both namespaces,
including local archives, and closes queued channels before they can repopulate
storage. An old v1 tab cannot delete keys it does not know, but it already writes
the durable logout signal. Every new envelope captures that generation: a later
reader refuses to reopen or retry a copy from before logout even if it was closed
and missed the browser event. Those legacy-logout remnants remain opaque and
exportable only after the owner-authorized form opens again; they cannot be
replaced by ordinary writes. This is replay prevention, not encryption at rest.
The generation is also checked inside each write lock. Ordinary authentication
failure does not change the logout signal or clear recovery. Full owner-
scoped encrypted recovery, session lock/BFCache handling, device-loss recovery,
portable restore, and disaster RPO/RTO proof remain separate gated increments.
Do not represent this change as satisfying those guarantees.

No credentials, provider configuration, private DO data, publication engine or
production resources are changed. No persisted operation IDs from #344 are
reinterpreted; its reconciliation controls must be retained during integration.

## Acceptance

Tests use synthetic storage and DOM fixtures. They cover exact CRLF/Unicode/pending
identity, UTF-8 limits, no server write during recovery, equal-source lost response,
legacy and current divergence, old writes after acknowledgment, concurrent new
writers, unsupported byte preservation/export, quota/lock denial, and closed
channels after logout, and old-tab logout while the new tab is closed. Real browser permission denial and owner visual acceptance
remain release checks; the DOM tests do not claim to emulate provider recovery.

## Opt-in v3 encryption foundation, 2026-10-18 checkpoint

Ani accepted the local recovery key-file/manual-unlock tradeoff on 2026-10-18.
`apps/admin/src/lib/browser-recovery-encryption.ts` implements the bounded engine
for that design. This checkpoint does not import it into an editor, activate v3
writes, create a user key file, migrate storage, change logout behavior or alter
Access. Existing v1/v2 values and downloads remain plaintext as described above.

The adapter seam is:

- `createBrowserRecoveryKeyFile()` returns sensitive version-one key-file text
  using a random 256-bit key. It writes no file or browser storage. Setup must
  require deliberate download, re-import and a successful synthetic round trip
  before claiming that the owner has kept the key.
- One `BrowserRecoveryVault` belongs to a document. `unlock(keyFile)` validates
  the key's SHA-256 identifier and imports a non-extractable native Web Crypto
  handle. Its public `state` reveals only lock reason or key ID. `lock()` drops
  handles and invalidates pending results; `lock("key-lost")` preserves a distinct
  lost-key outcome. No automatic key replacement or persistent unlock exists.
- `encrypt(exactString, context)` and `decrypt(envelope, context)` preserve exact
  strings, including corrupt predecessor JSON, CRLF and lone UTF-16 surrogates.
  They perform no acknowledgment, save, publication, export, storage or deletion.
  The future adapter must serialize the entire validated current recovery payload
  plus opaque predecessor strings before protection. After decryption it must
  run the existing payload validators before offering an explicit recovery choice.
- `inspectBrowserRecoveryEnvelope()` returns bounded, frozen header metadata
  without requiring a key. Inspection does not authenticate that metadata; only
  successful decryption authenticates it. Unsupported, corrupt and legacy strings
  stay opaque in the adapter and must remain exportable without rewriting.

Version-three envelopes authenticate a fixed-order canonical header containing
format/version, algorithm, key ID, exact origin, server-issued owner scope,
record kind/ID and logout generation. Header identifiers remain visible; authored
payload strings are encrypted. AES-256-GCM uses fresh random 96-bit nonces and
128-bit tags. A document refuses a repeated nonce for the same key even after
re-import. At 65,536 reserved nonces across its vault lifetime it refuses further
encryption with `key-usage-limit`; no nonce set is silently reset. Cross-document
uniqueness relies on the browser's cryptographic randomness, with no persisted
counter or user-supplied nonce. Randomness and GCM follow the
[Web Crypto recommendation](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/).

The key file and envelopes use compact JSON emitted by this codec. Parsing rejects
duplicate fields, reformatted/noncanonical JSON, unknown versions/fields,
noncanonical base64url and invalid lengths. The key file is bounded to 1 KiB;
JSON-encoded plaintext is bounded to 2 MiB plus 64 KiB, with corresponding
ciphertext/envelope ceilings. JSON escaping counts toward that budget, so an
oversized legacy string remains opaque rather than being truncated to fit.
Wrong key IDs, wrong/damaged authenticated ciphertext, missing/lost keys,
context mismatch, unavailable cryptography and stale async results are explicit
errors with no plaintext fallback. Temporary mutable key/input/decrypted byte
buffers are cleared where owned; JavaScript strings and native internals cannot
be guaranteed to be erased. This does not protect an already unlocked document
against same-origin script compromise.

The future form/storage adapter still owns authenticated document admission,
session-event handling, local capture before key disposal, lifecycle/record Web
Locks, compare-and-swap and persisted logout checks before and after every await.
The engine's context argument does not establish server identity or authorize a
write. Keep existing generations and acknowledgment tombstones; encrypted copies
cannot justify deleting plaintext predecessors without explicit proven migration.
Downloads must protect current input before including it in a ciphertext bundle.
Explicit logout must extend existing cleanup to the new namespace without changing
its purge meaning. Re-authentication followed by owner key import is required
after reload/expiry; no key, decrypted source or unlock credential is broadcast
between tabs or stored alongside ciphertext.

Focused tests exercise actual Node Web Crypto rather than mocked ciphers. They
cover native non-extractability, exact-byte/string recovery, header/IV/tag and
wrong-key failures, key-file and size validation, repeated nonces, stale concurrent
unlock/encryption/decryption, and opaque input preservation. These checks do not
establish browser key-download custody, storage races, expiry flushing, BFCache,
two-tab logout, encrypted downloads or recovery UI acceptance. Those require the
next integration and real-browser gate before activation.

## Consumer integration

The local consumer branch wires the native engine through
`browser-recovery-session.ts`, `encrypted-browser-recovery.ts` and
`browser-recovery-bundle.ts`. The retained v1/v2 reader/writer tests cover
compatibility; normal HomeEditor/NewWriting recovery now uses the asynchronous
v3 adapter. The production entrypoint inventory found both forms mounted only
by EditorialApp, with owner scope supplied by EditorialLayout from the existing
server-defined Access owner. RecoveryUnlock gates both render paths before
form initialization. Library navigation remains available. Missing scope does
not enable authoring or select a browser-supplied identity.

Setup controls stay disabled until hydration installs handlers. Setup generates
a key-file download, then requires re-import of that exact key ID and a native
encryption/decryption challenge before mounting authoring. Ordinary unlock uses
the saved file and the same challenge. File reads and imports have per-selection,
mounted-document and admission guards; a later selection, unmount or session lock
invalidates pending work. Generation has synchronous duplicate-click protection.
Raw key-file text and File objects are not component state. The file input clears
on selection, and download object URLs are revoked after use or on unlock/unmount.
There is no persisted device key, authentication change or application test bypass.

One v3 storage value is keyed by owner, record kind/ID and key ID. Its encrypted
bundle contains an authenticated manifest and ordered encrypted chunks; chunks
are inside that value, not independent storage keys. The manifest binds chunk
hashes and the exact UTF-16 length; bounded chunk framing preserves opaque strings
and allows exports larger than one envelope. Bounds are 32 MiB of input UTF-8
and 64 MiB of serialized bundle. A full storage origin can still reject additive
recovery writes. This is reported without removing predecessors or falling back
to plaintext. Encrypted current-copy export remains independent of successful
record storage reads and writes within its own stated bounds.

Channels capture the immutable current payload before queuing. They bind an
immutable per-unlock capability and key ID as well as origin, verified owner,
record and logout generation. Reload, key change, same-key re-import or drain
timeout cannot re-admit an old channel. Shared lifecycle and record Web Locks
cover read/decrypt and write/encrypt. Exact current v1/v2/v3 strings, capability,
logout intent and generation are checked after asynchronous work before commit.
A compare-and-swap loss preserves competing candidates. Explicit choices archive
the displaced ciphertext, with the existing three-copy archive bound.

Migration is additive. V1/v2 strings and archives are not rewritten or removed.
V3 records authenticate predecessor hashes, including acknowledgment tombstones,
so unchanged older copies cannot resurrect a saved edit. An older tab changing
plaintext produces a comparison. Unsupported or corrupt values remain exact and
exportable. Creating a new key is explicit and uses a separate key-ID namespace;
it does not decrypt or replace copies that need an unavailable earlier key.
The UI discloses retained plaintext and foreign key identities. This branch
does not claim that every existing browser value is encrypted.

The document recovery session owns synchronous capture registrations independently
of form unmount. Auth expiry immediately stops authoring/network admission and
captures buffered input, then permits only that capability's final local seal
for at most 1.5 seconds before dropping key handles. An explicit logout or
pagehide drops handles immediately. Continuous encryption, the existing unload
warning and explicit navigation safeguards reduce exposure; pagehide cannot
promise that a last asynchronous write completed. BFCache/auth re-entry retains
the existing full-document fence and requires a real authenticated navigation,
followed by key import. No key or decrypted copy is broadcast to other tabs.

BrowserRecoveryNotice and recovery safety actions export the captured current
payload, retry identity and all record-scoped opaque stored copies inside an
encrypted bundle, without saving or acknowledging an operation. After key loss,
the explicit opaque export copies only owner-scoped v3 entries unchanged,
including unknown/corrupt bytes; it adds no key/current input and excludes v1/v2
plaintext. It does not attest the contents of arbitrary opaque stored values.
Explicit authoring exports remain separate: the menu and named history revision
actions are labeled plaintext Markdown source downloads and retain `.md`
portability. They are not recovery guarantees or plaintext persistence fallbacks.
Both export paths check document admission before download.

Explicit logout extends its existing intent latch, exclusive lifecycle barrier,
canonical record locking, exact-byte removal and failure reporting to v3 values
and archives. It clears recovery rather than silently retaining encrypted copies.
Fresh-generation replacements keep their existing preservation rule. Cleanup does
not need or recover an encryption key and does not mutate server-saved drafts.

Focused checks use explicit test-owned native key/session fixtures and preserve
the legacy compatibility suites. The separate owner browser acceptance must
qualify setup/download/re-import, hydration, pending work cancellation, wrong and
lost keys, encrypted current export, actual reload/expiry, BFCache and two-tab
logout/CAS. Existing local journey suites must import synthetic key files through
the real hydrated file input, using the test-only
`test/support/browser-recovery-key.ts` helper where appropriate. Full checks and
the owner browser matrix are not claimed by this branch documentation.

## October 19 owner qualification

Source `dadc2475b8bea8b49cd7f779abb44452cd06ffb7` is preserved in PR #539,
stacked on the frozen #538 candidate. Source review found no remaining blocker
in the scoped protocol and entrypoint review. Stale channel reuse across same-
or different-key imports and expired final work is fenced by per-unlock capability
identity. A populated storage origin no longer changes the first client markup:
inventory waits for hydration. The regression fails against the original code.

Full source validation at `4f99e746` passed all workspace tasks, including2,399
Admin core,79 Astro,98 native workerd and3 CSP cases with one intentional CSP skip.
At `e23ade9a`,32 native browser cases pass, including actual key-file download,
re-import, wrong/lost keys, expiry capture and encrypted retention. After test-only
selector/redirect corrections, four additional Chromium/WebKit lifecycle cases
pass at `dadc2475`: independently locked child documents, same-key native import,
competing input/CAS preservation, trusted native cross-tab storage logout events,
pagehide and history return. Task-owned child windows are closed and verified in
finally blocks. No API mutations reach a provider or production origin.

These are local source/synthetic runtime results. Final frozen-head checks are
refreshed before review. They do not establish physical Files-app custody, a
particular BFCache hit, authenticated live owner expiry/save, production deployment,
or operational snapshot/backup key custody. The canonical review preview remains
on #538 while it awaits review; #539 is not merged or deployed.
