# Review component baseline reconciliation

September 13, 2026. Local preservation step before the Quiet Precision diff work.

The canonical checkout is on `codex/document-editor` at
`e58fa668c4a792017f8319b1aff7545c8cf7bc05`, with accumulated work preserved. Its
ReviewChanges implementation lacked a rich-text comparison fix already included
in the recorded PR339 release, `dcca7160ac9e1762eeeabb09a3c68f93a4316747`.

Restored exactly the released versions of:

- `apps/admin/src/components/astryx/ReviewChanges.tsx`
- `apps/admin/src/components/astryx/ReviewChanges.test.tsx`

The comparison recursively excludes text nodes when inspecting formatting. A copy
edit inside an unchanged bold span or link stays a readable copy edit. Changed
marks, link destinations, image attributes and nesting remain visible as
formatting/attribute changes. These semantics must survive the forthcoming split
and unified diff presentation.

## Evidence

- Both local files were byte-compared with `git show` of the exact release SHA
  from the preserved `site-astro7` checkout; both matched.
- `pnpm --dir apps/admin exec vitest run src/components/astryx/ReviewChanges.test.tsx src/lib/text-diff.test.ts`
  passed: 2 files, 24 tests.
- Scoped `git diff --check` passed.

This only reconciles these two files. It is not a full integration-tree merge,
new deployment, authenticated draft export, browser acceptance or completion of
the new conventional diff design. No draft, publication job or production resource
was written. No existing branch or patch was deleted.
