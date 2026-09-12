# Diff and exact-review audit

Reviewed 2026-09-12. Complete source review covers the six files below. HomeEditor was inspected only at review-capture and publish matching integration points; its whole-file audit remains separate.

- textDiff preserves token punctuation, whitespace and Unicode and reconstructs each side by filtering added or removed parts. Common prefix/suffix are retained. Large replacements bypass the quadratic matrix at one million cells. Updated pure insertion/deletion cases to bypass the matrix as well: their result is exact without allocating one typed-array row per deleted token. Two large-side reconstruction cases were added.
- compactDiff only shortens equal context. Added and removed text remains complete; Full context is available when trimming occurred. Full source diff is independently selectable.
- ReviewChanges uses Astryx disclosures with destination/change counts visible in the trigger. Each changed field renders escaped text with semantic ins/del markup. Rich changes compare non-text inline structures so simultaneous wording edits cannot hide changed link or image destinations. Source fallback remains available for metadata/unsupported formatting. No HTML, image or link from the diff executes.
- captureReviewedDraft requires acknowledged saved state, no failure/conflict and a positive safe revision. matchesReviewedDraft requires both exact source and exact revision; identical text at a newer revision is not accepted as the old review. Capture returns an independent primitive snapshot.
- Inspected integration awaits ensureDraft before capture, rejects stale navigation/controller requests, checks the same snapshot after another flush and again immediately before publish dispatch. No publication was performed. These checks do not replace server revision/approval protections.

Twenty focused diff/review tests passed (`/private/tmp/admin-review-audit-tests.log`). Cases cover Unicode/punctuation, links, images, formatting, large replacements and insertions/deletions, compact-context fidelity, saved state, changed revisions and independent review snapshots. Render tests do not prove disclosure keyboard behavior, mobile geometry, color contrast or live exact-revision publication handling. Those remain Browser and release gates.

| Source                                                    | SHA-256                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/lib/text-diff.ts`                         | `af0ea2f9b74dce6a557f8fafb018c707e3cecdfffdeebce73587954373332710` |
| `apps/admin/src/lib/text-diff.test.ts`                    | `b33afce5d00500571b279cfd6418ed5d73872c7447be57edfaf559238ff701d5` |
| `apps/admin/src/lib/reviewed-draft.ts`                    | `b29085d11b8ff1a6c605bfabfa44ed91717a1e6fc20daf2cfdd97b4a88f20ad9` |
| `apps/admin/src/lib/reviewed-draft.test.ts`               | `dd6b9eb371f6f9e2a2200ae0bfd08e5ccfe8be1a00cc094fbec644b5f23edb61` |
| `apps/admin/src/components/astryx/ReviewChanges.tsx`      | `4ad3b6b27241a9c22bdaeca443adabd69c55c090369bb3be745ff7047389bbb7` |
| `apps/admin/src/components/astryx/ReviewChanges.test.tsx` | `4fe745c30dfb232bc3ca0c34dc2e6d2911c39dbe3754359eb0ac651821e8e054` |
