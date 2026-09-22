/**
 * Provenance for `ops_v1.sample.json`, a byte-exact copy of System's synthetic
 * ops_v1 example. JSON cannot carry a comment, so the record lives here and
 * `ops-v1.test.ts` checks the copy against `blobSha`.
 *
 * Source: anipotts/system `tests/fixtures/ops_v1.sample.json` at commit
 * feca443e0d903b26493bfeea69284fce6e110668 (System PR #138, the regenerated
 * internally consistent fixture), copied 2026-09-21. The contract is
 * `docs/ops-v1.md` at the same commit. The fixture is synthetic: it holds no
 * private text and no live observation.
 *
 * To refresh, copy the file unchanged and update `commit` and `blobSha`
 * (`git hash-object` of the file, equal to the GitHub contents sha).
 */
export const OPS_V1_SAMPLE_PROVENANCE = {
  repository: "anipotts/system",
  path: "tests/fixtures/ops_v1.sample.json",
  commit: "feca443e0d903b26493bfeea69284fce6e110668",
  blobSha: "85b7b7b5a3b0d2fe471d1f0eeadb360db2e3019b",
  contract: "docs/ops-v1.md",
  copiedOn: "2026-09-21",
} as const;
