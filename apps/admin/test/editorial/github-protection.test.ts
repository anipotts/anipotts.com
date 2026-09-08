import { describe, expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";

function fixture() {
  const rules = [
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "pull_request",
      parameters: {
        required_review_thread_resolution: true,
        allowed_merge_methods: ["squash"],
      },
    },
  ];
  const checks = ["Build, lint, typecheck, test", "Security Review"].map(
    (context) => ({ context, app_id: 15368 }),
  );
  const protection = {
    required_status_checks: { strict: true, checks },
    enforce_admins: { enabled: true },
    required_conversation_resolution: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
  const ruleset = {
    id: 123,
    target: "branch",
    enforcement: "active",
    bypass_actors: [] as unknown[],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules,
  };
  const repo = {
    full_name: "anipotts/anipotts.com",
    default_branch: "main",
    archived: false,
    allow_auto_merge: true,
    allow_squash_merge: true,
    delete_branch_on_merge: true,
  };
  const responses: Record<string, unknown> = {
    "": repo,
    "/branches/main/protection": protection,
    "/rules/branches/main?per_page=100": rules.map((rule) => ({
      ...rule,
      ruleset_id: 123,
      ruleset_source_type: "Repository",
      ruleset_source: "anipotts/anipotts.com",
    })),
    "/rulesets/123": ruleset,
  };
  const client = new EditorialGitHub(
    async () => "synthetic",
    async (url, init) => {
      expect(init?.method).toBe("GET");
      const path = String(url).replace(
        "https://api.github.com/repos/anipotts/anipotts.com",
        "",
      );
      expect(Object.hasOwn(responses, path)).toBe(true);
      return Response.json(responses[path]);
    },
  );
  return { client, protection, ruleset, repo, responses };
}
describe("live provider publishing protection", () => {
  it("accepts this site's combined strict-check and no-bypass PR rules", async () => {
    expect(await fixture().client.requireProtectedPublishing()).toEqual([
      { context: "Build, lint, typecheck, test", appId: 15368 },
      { context: "Security Review", appId: 15368 },
    ]);
  });
  it("rejects weaker enforcement and missing or spoofable checks", async () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => {
        f.protection.required_status_checks.strict = false;
      },
      (f: ReturnType<typeof fixture>) => {
        f.protection.enforce_admins.enabled = false;
      },
      (f: ReturnType<typeof fixture>) => {
        f.protection.allow_force_pushes.enabled = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.protection.allow_deletions.enabled = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.protection.required_status_checks.checks[0]!.app_id = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.protection.required_status_checks.checks.pop();
      },
    ];
    for (const change of changes) {
      const f = fixture();
      change(f);
      await expect(f.client.requireProtectedPublishing()).rejects.toMatchObject(
        { code: "rejected" },
      );
    }
  });
  it("rejects bypass actors, disabled rules, missing PR rules and changed repository identity", async () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => {
        f.ruleset.bypass_actors.push({
          actor_type: "Integration",
          actor_id: 1,
          bypass_mode: "always",
        });
      },
      (f: ReturnType<typeof fixture>) => {
        f.ruleset.enforcement = "evaluate";
      },
      (f: ReturnType<typeof fixture>) => {
        f.ruleset.rules.pop();
      },
      (f: ReturnType<typeof fixture>) => {
        f.repo.full_name = "another/repo";
      },
      (f: ReturnType<typeof fixture>) => {
        f.repo.allow_auto_merge = false;
      },
    ];
    for (const change of changes) {
      const f = fixture();
      change(f);
      await expect(f.client.requireProtectedPublishing()).rejects.toMatchObject(
        { code: "rejected" },
      );
    }
  });
});
