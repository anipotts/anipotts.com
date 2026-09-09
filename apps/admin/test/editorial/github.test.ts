import { describe, expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";

const id = "40c949e1-0e1e-40a1-8eca-2b1b0202a1e5";
const sha = "a".repeat(40);
const ref = `refs/heads/codex/editorial-${id}`;
const found = (head = sha) =>
  Response.json({ ref, object: { type: "commit", sha: head } });

describe("restricted GitHub branch adapter", () => {
  const pull = () => ({
    number: 10,
    node_id: "PR_test",
    html_url: "https://github.com/anipotts/anipotts.com/pull/10",
    state: "open",
    draft: false,
    merged_at: null,
    body: `Editorial-Publication: ${id}`,
    head: {
      ref: `codex/editorial-${id}`,
      sha,
      repo: { full_name: "anipotts/anipotts.com" },
    },
    base: { ref: "main", repo: { full_name: "anipotts/anipotts.com" } },
  });

  it("reconciles a lost close response and preserves a racing merge", async () => {
    for (const race of [false, true]) {
      let closed = false,
        writes = 0;
      const client = new EditorialGitHub(
        async () => "test-token",
        async (url, init) => {
          const pr = {
            ...pull(),
            state: closed ? "closed" : "open",
            merged: closed && race,
            merged_at: closed && race ? "2026-09-08T12:00:00Z" : null,
            merge_commit_sha: closed && race ? "b".repeat(40) : null,
          };
          if (init?.method === "PATCH") {
            writes++;
            closed = true;
            throw new Error("response lost");
          }
          return Response.json(String(url).includes("/pulls?") ? [pr] : pr);
        },
      );
      await expect(client.stopPublication(id, sha)).rejects.toMatchObject({
        code: "unavailable",
      });
      expect(await client.stopPublication(id, sha)).toEqual({
        mergeCommit: race ? "b".repeat(40) : null,
      });
      expect(writes).toBe(1);
    }
  });
  it("recovers a lost PR creation response without another PR", async () => {
    let created = false;
    let writes = 0;
    const client = new EditorialGitHub(
      async () => "test-token",
      async (url, init) => {
        if (init?.method === "POST") {
          writes++;
          expect(JSON.parse(String(init.body))).toMatchObject({
            head: `codex/editorial-${id}`,
            base: "main",
            draft: false,
            maintainer_can_modify: false,
          });
          created = true;
          throw new Error("response lost");
        }
        if (String(url).includes("/git/ref/")) return found();
        expect(new URL(String(url)).searchParams.get("state")).toBe("all");
        return Response.json(created ? [pull()] : []);
      },
    );
    await expect(client.ensurePullRequest(id, sha)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(await client.ensurePullRequest(id, sha)).toMatchObject({
      number: 10,
      state: "open",
      head: sha,
    });
    expect(writes).toBe(1);
  });

  it("does not reopen a closed PR or mistake a merged PR for deployment proof", async () => {
    for (const merged_at of [null, "2026-09-08T12:00:00Z"]) {
      const client = new EditorialGitHub(
        async () => "test-token",
        async (_url, init) => {
          expect(init?.method).toBe("GET");
          return Response.json([{ ...pull(), state: "closed", merged_at }]);
        },
      );
      expect(await client.ensurePullRequest(id, sha)).toMatchObject({
        state: "closed",
        merged: merged_at !== null,
      });
    }
  });

  it("rejects changed PR heads, foreign repositories, missing receipts and ambiguous duplicates", async () => {
    for (const value of [
      [{ ...pull(), head: { ...pull().head, sha: "b".repeat(40) } }],
      [
        {
          ...pull(),
          head: { ...pull().head, repo: { full_name: "someone/fork" } },
        },
      ],
      [{ ...pull(), body: "unrelated" }],
      [pull(), pull()],
    ]) {
      const client = new EditorialGitHub(
        async () => "test-token",
        async (_url, init) => {
          expect(init?.method).toBe("GET");
          return Response.json(value);
        },
      );
      await expect(client.ensurePullRequest(id, sha)).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  });
  it("retries identical Git objects after a lost commit response and preserves the inspected newer parent", async () => {
    const calls: { url: string; body: unknown }[] = [];
    let loseResponse = true;
    const client = new EditorialGitHub(
      async () => "test-token",
      async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        if (String(url).endsWith("/git/commits") && loseResponse) {
          loseResponse = false;
          throw new Error("commit created but response lost");
        }
        return Response.json({ sha }, { status: 201 });
      },
      async () => "synthetic signed manifest",
    );
    const publication = {
      id,
      record: { kind: "page" as const, id: "home" as const },
      path: "content/public/pages/home.md",
      source: "authorized source",
      revision: 3,
      baseCommit: "b".repeat(40),
      baseFileHash: "c".repeat(40),
      createdAt: 1788900000000,
    };
    const base = {
      head: "d".repeat(40),
      tree: "e".repeat(40),
      file: {
        path: publication.path,
        sha: publication.baseFileHash,
        mode: "100644",
        type: "blob",
      },
    };
    await expect(client.createCommit(publication, base)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(await client.createCommit(publication, base)).toBe(sha);
    expect(calls.slice(0, 2)).toEqual(calls.slice(2));
    if (!calls[0] || !calls[1])
      throw new Error("expected tree and commit requests");
    expect(calls[0].body).toEqual({
      base_tree: base.tree,
      tree: [
        {
          path: publication.path,
          mode: "100644",
          type: "blob",
          content: publication.source,
        },
        {
          path: "content/publication.json",
          mode: "100644",
          type: "blob",
          content: "synthetic signed manifest",
        },
      ],
    });
    expect(calls[1].body).toMatchObject({
      parents: [base.head],
      author: { date: new Date(publication.createdAt).toISOString() },
      committer: { date: new Date(publication.createdAt).toISOString() },
    });
    await expect(
      client.createCommit(
        { ...publication, path: ".github/workflows/deploy.yml" },
        base,
      ),
    ).rejects.toMatchObject({ code: "rejected" });
    expect(calls).toHaveLength(4);
  });
  it("reconciles a committed write whose response was lost without another POST", async () => {
    let head: string | null = null;
    let writes = 0;
    const client = new EditorialGitHub(
      async () => "test-token",
      async (url, init) => {
        expect(String(url)).toMatch(
          /^https:\/\/api\.github\.com\/repos\/anipotts\/anipotts\.com\/git\//,
        );
        expect(init?.redirect).toBe("error");
        expect(init?.signal).toBeDefined();
        if (init?.method === "POST") {
          writes++;
          expect(JSON.parse(String(init.body))).toEqual({ ref, sha });
          head = sha;
          throw new Error("lost response");
        }
        return head ? found(head) : new Response(null, { status: 404 });
      },
    );
    await expect(client.ensureBranch(id, sha)).rejects.toMatchObject({
      code: "unavailable",
    });
    await client.ensureBranch(id, sha);
    expect(writes).toBe(1);
  });

  it("never overwrites an unexpected branch or accepts an arbitrary branch name", async () => {
    let reads = 0;
    const client = new EditorialGitHub(
      async () => "test-token",
      async (_url, init) => {
        expect(init?.method).toBe("GET");
        reads++;
        return found("b".repeat(40));
      },
    );
    await expect(client.ensureBranch(id, sha)).rejects.toMatchObject({
      code: "unexpected_branch",
    });
    await expect(client.ensureBranch("main", sha)).rejects.toMatchObject({
      code: "rejected",
    });
    expect(reads).toBe(1);
  });

  it("honors rate limits and keeps provider errors out of returned exceptions", async () => {
    const client = new EditorialGitHub(
      async () => "test-token",
      async () =>
        new Response("private provider details", {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
    );
    await expect(client.branchHead(id)).rejects.toMatchObject({
      message: "rate_limited",
      retryAfterMs: 120000,
    });
    const denied = new EditorialGitHub(
      async () => "test-token",
      async () => new Response("secret details", { status: 401 }),
    );
    await expect(denied.branchHead(id)).rejects.toMatchObject({
      message: "unauthorized",
    });
  });

  it("rejects malformed or mismatched ref responses", async () => {
    const client = new EditorialGitHub(
      async () => "test-token",
      async () =>
        Response.json({
          ref: "refs/heads/main",
          object: { type: "commit", sha },
        }),
    );
    await expect(client.branchHead(id)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
