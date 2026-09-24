/**
 * Provenance for `ops_v1.sample.json`, a byte-exact copy of System's synthetic
 * ops_v1 example. JSON cannot carry a comment, so the record lives here and
 * `ops-v1.test.ts` checks the copy against `blobSha`.
 *
 * Source: anipotts/system `tests/fixtures/ops_v1.sample.json` at commit
 * 4d6f0176c5c6f113a1e709b8a9a4d8731f4ce642 (the run fields: catalog
 * `trigger`, row `runs`, `interval_s`, `last_duration_s`, `next_run_at`),
 * copied 2026-09-22. The contract is
 * `docs/ops-v1.md` at the same commit. The fixture is synthetic: it holds no
 * private text and no live observation.
 *
 * To refresh, copy the file unchanged and update `commit` and `blobSha`
 * (`git hash-object` of the file, equal to the GitHub contents sha).
 */
export const OPS_V1_SAMPLE_PROVENANCE = {
  repository: "anipotts/system",
  path: "tests/fixtures/ops_v1.sample.json",
  commit: "4d6f0176c5c6f113a1e709b8a9a4d8731f4ce642",
  blobSha: "740bccb4cf4f7bea76d5c46dc5d0462537b68589",
  contract: "docs/ops-v1.md",
  copiedOn: "2026-09-22",
} as const;
