import { describe, expect, it, vi } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";

const repository = "anipotts/anipotts.com";
const id = "12345678-1234-1234-1234-123456789abc";
const head = "a".repeat(40);
function mergeFixture(change: Record<string, unknown> = {}) {
  const requests: Record<string, any>[] = [];
  const node = {
    id: "PR_test",
    number: 10,
    headRefOid: head,
    headRefName: `codex/editorial-${id}`,
    baseRefName: "main",
    state: "OPEN",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    repository: { nameWithOwner: repository },
    headRepository: { nameWithOwner: repository },
    autoMergeRequest: null,
    ...change,
  };
  const git = new EditorialGitHub(
    async () => "synthetic",
    async (url, init) => {
      expect(String(url)).toBe("https://api.github.com/graphql");
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (body.query.startsWith("query"))
        return Response.json({ data: { node } });
      const mutation = body.query.includes("enablePullRequestAutoMerge")
        ? "enablePullRequestAutoMerge"
        : "mergePullRequest";
      return Response.json({
        data: {
          [mutation]: { pullRequest: { id: "PR_test", headRefOid: head } },
        },
      });
    },
  );
  vi.spyOn(git, "requireProtectedPublishing").mockResolvedValue([]);
  vi.spyOn(git, "readPullRequest").mockResolvedValue({
    number: 10,
    nodeId: "PR_test",
    url: "",
    state: "open",
    head,
    merged: false,
    mergeCommit: null,
  });
  vi.spyOn(git, "readRequiredChecks").mockResolvedValue({
    state: "passed",
    pending: [],
    failed: [],
  });
  return { git, requests };
}
describe("native protected publication merge", () => {
  it("pins both immediate merge and auto-merge to the checked head", async () => {
    for (const mergeStateStatus of ["CLEAN", "BLOCKED"]) {
      const { git, requests } = mergeFixture({ mergeStateStatus });
      await git.ensureProtectedMerge(id, head, 10, "PR_test");
      expect(requests[1]?.variables.input).toEqual({
        pullRequestId: "PR_test",
        expectedHeadOid: head,
        mergeMethod: "SQUASH",
        clientMutationId: id,
      });
      expect(git.requireProtectedPublishing).toHaveBeenCalledOnce();
      expect(git.readRequiredChecks).toHaveBeenCalledWith(head, []);
    }
  });
  it("does not mutate a substituted head, fork, base, draft or failing checks", async () => {
    for (const change of [
      { headRefOid: "b".repeat(40) },
      { baseRefName: "other" },
      { isDraft: true },
      { headRepository: { nameWithOwner: "other/repo" } },
    ]) {
      const { git, requests } = mergeFixture(change);
      await expect(
        git.ensureProtectedMerge(id, head, 10, "PR_test"),
      ).rejects.toMatchObject({ code: "unexpected_branch" });
      expect(requests).toHaveLength(1);
    }
    const { git, requests } = mergeFixture();
    vi.mocked(git.readRequiredChecks).mockResolvedValue({
      state: "pending",
      pending: ["CI"],
      failed: [],
    });
    await expect(
      git.ensureProtectedMerge(id, head, 10, "PR_test"),
    ).rejects.toMatchObject({ code: "rejected" });
    expect(requests).toHaveLength(0);
  });
  it("reconciles an enabled auto-merge after a lost write response", async () => {
    const { git, requests } = mergeFixture({
      autoMergeRequest: { mergeMethod: "SQUASH" },
    });
    await git.ensureProtectedMerge(id, head, 10, "PR_test");
    expect(requests).toHaveLength(1);
  });
});

describe("deployment receipts", () => {
  function fixture(change = {}, jobChange = {}) {
    const run = {
      id: 42,
      head_sha: head,
      event: "push",
      head_branch: "main",
      repository: { full_name: repository },
      path: ".github/workflows/deploy.yml",
      status: "completed",
      conclusion: "success",
      ...change,
    };
    return new EditorialGitHub(
      async () => "synthetic",
      async (url) =>
        Response.json(
          String(url).includes("/jobs?")
            ? {
                total_count: 1,
                jobs: [
                  {
                    name: "Deploy www",
                    head_sha: head,
                    status: "completed",
                    conclusion: "success",
                    ...jobChange,
                  },
                ],
              }
            : { total_count: 1, workflow_runs: [run] },
        ),
    );
  }
  it("requires successful www deployment for the exact release", async () => {
    expect(await fixture().readDeploymentRun(head)).toEqual({
      id: "42",
      state: "passed",
    });
    expect(
      await fixture({ status: "in_progress" }).readDeploymentRun(head),
    ).toEqual({ id: "42", state: "pending" });
    expect(
      await fixture({}, { conclusion: "skipped" }).readDeploymentRun(head),
    ).toEqual({ id: "42", state: "failed" });
    expect(
      await fixture({}, { head_sha: "b".repeat(40) }).readDeploymentRun(head),
    ).toEqual({ id: "42", state: "failed" });
    await expect(
      fixture({ repository: { full_name: "other/repo" } }).readDeploymentRun(
        head,
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
