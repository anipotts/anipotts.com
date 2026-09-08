import { expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";

const id = "12345678-1234-1234-1234-123456789abc";
const commit = "a".repeat(40);
const mergeCommit = "b".repeat(40);
const payload = {
  number: 10,
  node_id: "PR_test",
  html_url: "https://github.com/anipotts/anipotts.com/pull/10",
  head: {
    ref: `codex/editorial-${id}`,
    sha: commit,
    repo: { full_name: "anipotts/anipotts.com" },
  },
  base: { ref: "main", repo: { full_name: "anipotts/anipotts.com" } },
  draft: false,
  state: "open",
  body: `Editorial-Publication: ${id}`,
  merged: false,
  merged_at: null,
  merge_commit_sha: mergeCommit,
};
function read(value: unknown) {
  const git = new EditorialGitHub(
    async () => "synthetic",
    async (url, init) => {
      expect(String(url)).toBe(
        "https://api.github.com/repos/anipotts/anipotts.com/pulls/10",
      );
      expect(init?.method).toBe("GET");
      return Response.json(value);
    },
  );
  return git.readPullRequest(id, commit, 10, "PR_test");
}
it("does not confuse a speculative test-merge SHA or closed PR with an actual merge", async () => {
  expect(await read(payload)).toMatchObject({
    state: "open",
    merged: false,
    mergeCommit: null,
  });
  expect(await read({ ...payload, state: "closed" })).toMatchObject({
    state: "closed",
    merged: false,
    mergeCommit: null,
  });
  expect(
    await read({
      ...payload,
      state: "closed",
      merged: true,
      merged_at: "2026-09-08T12:00:00Z",
    }),
  ).toMatchObject({ merged: true, mergeCommit });
});
it("rejects substituted PR identity, changed head and contradictory merge receipts", async () => {
  for (const change of [
    { node_id: "PR_other" },
    { head: { ...payload.head, sha: mergeCommit } },
    { merged: true },
    { merged: true, merged_at: "2026-09-08T12:00:00Z" },
    {
      state: "closed",
      merged: true,
      merged_at: "2026-09-08T12:00:00Z",
      merge_commit_sha: null,
    },
  ])
    await expect(read({ ...payload, ...change })).rejects.toMatchObject({
      code: "invalid_response",
    });
});
