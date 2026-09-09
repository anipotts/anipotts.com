import { describe, expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";
const sha = "a".repeat(40);
const required = [{ context: "Build, lint, typecheck, test", appId: 15368 }];
const run = (id = 1) => ({
  id,
  name: required[0]!.context,
  app: { id: 15368 },
  head_sha: sha,
  status: "completed",
  conclusion: "success",
});
function client(runs: unknown[], total = runs.length) {
  return new EditorialGitHub(
    async () => "synthetic",
    async (url, init) => {
      expect(init?.method).toBe("GET");
      expect(String(url)).toBe(
        `https://api.github.com/repos/anipotts/anipotts.com/commits/${sha}/check-runs?filter=latest&per_page=100`,
      );
      return Response.json({ total_count: total, check_runs: runs });
    },
  );
}
describe("exact-head required check evaluation", () => {
  it("passes only successful exact-head checks from the required app", async () => {
    expect(
      (await client([run()]).readRequiredChecks(sha, required)).state,
    ).toBe("passed");
    expect(
      (
        await client([{ ...run(), app: { id: 999 } }]).readRequiredChecks(
          sha,
          required,
        )
      ).state,
    ).toBe("pending");
    await expect(
      client([{ ...run(), head_sha: "b".repeat(40) }]).readRequiredChecks(
        sha,
        required,
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("never accepts skipped, neutral, failed or canceled jobs as validation", async () => {
    for (const conclusion of [
      "skipped",
      "neutral",
      "failure",
      "cancelled",
      "timed_out",
      null,
    ])
      expect(
        (
          await client([{ ...run(), conclusion }]).readRequiredChecks(
            sha,
            required,
          )
        ).state,
      ).toBe("failed");
  });
  it("uses the latest attempt and waits for missing or running checks", async () => {
    expect(
      (
        await client([
          run(1),
          { ...run(2), conclusion: "failure" },
        ]).readRequiredChecks(sha, required)
      ).state,
    ).toBe("failed");
    expect(
      (
        await client([
          { ...run(1), conclusion: "failure" },
          run(2),
        ]).readRequiredChecks(sha, required)
      ).state,
    ).toBe("passed");
    expect(
      (
        await client([
          { ...run(), status: "in_progress", conclusion: null },
        ]).readRequiredChecks(sha, required)
      ).state,
    ).toBe("pending");
    expect((await client([]).readRequiredChecks(sha, required)).state).toBe(
      "pending",
    );
  });
  it("rejects incomplete inventories and an empty required-check contract", async () => {
    await expect(
      client([run()], 2).readRequiredChecks(sha, required),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client([]).readRequiredChecks(sha, [])).rejects.toMatchObject({
      code: "rejected",
    });
  });
});
