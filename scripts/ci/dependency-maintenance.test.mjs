import assert from "node:assert/strict";
import { classify } from "./dependency-maintenance.mjs";

const required = [{ context: "Build, lint, typecheck, test", app_id: 15368 }];
const pr = {
  author: { __typename: "Bot", login: "dependabot" },
  headRepository: { nameWithOwner: "anipotts/anipotts.com" },
  baseRefName: "main",
  headRefName: "dependabot/test",
  headRefOid: "abc",
  isDraft: false,
  files: { pageInfo: { hasNextPage: false } },
  reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  autoMergeRequest: null,
  commits: {
    nodes: [
      {
        commit: {
          oid: "abc",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  __typename: "CheckRun",
                  name: required[0].context,
                  status: "COMPLETED",
                  conclusion: "SUCCESS",
                  checkSuite: { app: { databaseId: 15368 } },
                },
              ],
            },
          },
        },
      },
    ],
  },
};
assert.equal(classify(pr, required), "review_then_enable_auto_merge");
assert.equal(
  classify({ ...pr, isDraft: true }, required),
  "inspect_draft_hold",
);
assert.equal(
  classify({ ...pr, mergeStateStatus: "BEHIND" }, required),
  "refresh_base",
);
assert.equal(
  classify({ ...pr, mergeable: "CONFLICTING" }, required),
  "repair_conflict",
);
assert.equal(
  classify(
    {
      ...pr,
      reviewThreads: { ...pr.reviewThreads, nodes: [{ isResolved: false }] },
    },
    required,
  ),
  "address_review",
);
assert.equal(
  classify(
    { ...pr, author: { __typename: "User", login: "dependabot" } },
    required,
  ),
  "excluded",
);
assert.equal(
  classify(
    { ...pr, headRepository: { nameWithOwner: "attacker/fork" } },
    required,
  ),
  "excluded",
);
assert.equal(classify({ ...pr, headRefOid: "new" }, required), "wait_checks");
for (const conclusion of ["FAILURE", "SKIPPED", "NEUTRAL", "CANCELLED"]) {
  const changed = structuredClone(pr);
  changed.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion =
    conclusion;
  assert.equal(classify(changed, required), "repair_checks");
}
assert.equal(classify(pr, required), classify(pr, required));
console.log("dependency maintenance classification passed");
