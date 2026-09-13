# Browser recovery compatibility, R3a

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
silently rewritten. The user can download exact stored strings in a private JSON
bundle. A divergent legacy/current pair offers read-only previews and explicit
recovery choices. Choosing a supported copy archives the displaced v2 envelope
before writing; original v1 data remains. No automatic archive cleanup is added.
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
