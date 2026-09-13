# Source identity and icon audit

Reviewed 2026-09-12 from the tracked foundation and follow-up source. No provider assets or identity semantics changed.

- SourceMark uses localized Codex, ChatGPT and Claude image assets; GitHub and handoff use explicit text fallback. Accessible provider labels are present, image/glyph decoration is aria-hidden, and no provider identity is inferred from state. This component is informational, not an icon-only action. Four existing render tests cover localized marks and GitHub fallback. Pixel quality and compact rendering remain browser gates.
- admin-icons centralizes typed navigation, operational projection, graph layer, Inbox category and semantic-reference mappings from Phosphor. Repository glyphs identify the repository destination; SourceMark separately represents providers. Callers own button labels, tooltips, hit targets and state text; this mapping alone does not prove those controls accessible.
- SourceMark.test verifies rendered image presence, labels and fallback strings only. It does not prove asset authenticity, image loading, contrast or actual browser geometry. Asset custody is separately recorded in configuration-assets-audit.md.

| Source                                          | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `apps/admin/src/components/SourceMark.tsx`      | `a3791b3d5a70894330a676d0733eddc64982783828501083ebb48856689a366b` |
| `apps/admin/src/components/SourceMark.test.tsx` | `efcc19a9a4a8e32084e3a3e443dad51a1410bd5759e2cb578bfec54fc58896ea` |
| `apps/admin/src/components/admin-icons.tsx`     | `0d75cbfb8246a16472fe22a416673bac23a2a348ed487fea4566cf712979edef` |

## Ledger reconciliation

Compared all tracked apps/admin files with coverage.json. Added 19 previously missing paths as pending and invalidated 24 changed source hashes, retaining earlier evidence only as historical references. Untracked private writing drafts were not read or added. The ledger remains in progress and must be reconciled again after successor integration. No count is a browser-acceptance or line-coverage claim.
