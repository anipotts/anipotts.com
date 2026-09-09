import { describe, expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";
import { preparePublication } from "../../src/editorial/prepare-publication";

const head = "a".repeat(40),
  tree = "b".repeat(40),
  blob = "f".repeat(40);
const record = { kind: "page", id: "home" } as const;
function fixture() {
  const responses: Record<string, unknown> = {
    "/git/ref/heads/main": {
      ref: "refs/heads/main",
      object: { type: "commit", sha: head },
    },
    [`/git/commits/${head}`]: { sha: head, tree: { sha: tree } },
  };
  const ids = [tree, "c".repeat(40), "d".repeat(40), "e".repeat(40), blob];
  ["content", "public", "pages", "home.md"].forEach((path, i) => {
    responses[`/git/trees/${ids[i]}`] = {
      sha: ids[i],
      truncated: false,
      tree: [
        {
          path,
          sha: ids[i + 1],
          mode: i === 3 ? "100644" : "040000",
          type: i === 3 ? "blob" : "tree",
        },
      ],
    };
  });
  const requests: string[] = [];
  const client = new EditorialGitHub(
    async () => "synthetic-token",
    async (url, init) => {
      expect(init?.method).toBe("GET");
      const path = new URL(String(url)).pathname.replace(
        "/repos/anipotts/anipotts.com",
        "",
      );
      requests.push(path);
      if (!(path in responses)) throw new Error("unexpected request");
      return Response.json(responses[path]);
    },
  );
  return { client, responses, requests };
}
describe("pinned Git base inspection", () => {
  it("resolves main only once and follows immutable tree IDs", async () => {
    const { client, requests } = fixture();
    const base = await client.readBase(record);
    expect(base).toEqual({
      head,
      tree,
      file: {
        path: "content/public/pages/home.md",
        sha: blob,
        mode: "100644",
        type: "blob",
      },
    });
    expect(requests.filter((path) => path.includes("main"))).toHaveLength(1);
    expect(requests).toHaveLength(6);
    expect(
      preparePublication(
        {
          id: "40c949e1-0e1e-40a1-8eca-2b1b0202a1e5",
          record,
          path: base.file!.path,
          source: "authorized",
          revision: 1,
          baseCommit: "0".repeat(40),
          baseFileHash: blob,
          createdAt: 1,
        },
        base,
      ),
    ).toMatchObject({ ok: true, parent: head, baseTree: tree });
  });
  it("resumes an already pinned snapshot without consulting a newer main", async () => {
    const { client, requests } = fixture();
    await client.readBase(record, head);
    expect(requests.some((path) => path.includes("main"))).toBe(false);
    await expect(client.readBase(record, "main")).rejects.toMatchObject({
      code: "rejected",
    });
  });
  it("distinguishes missing records from incomplete provider responses", async () => {
    const { client, responses } = fixture();
    const key = `/git/trees/${"e".repeat(40)}`;
    responses[key] = { sha: "e".repeat(40), truncated: false, tree: [] };
    expect((await client.readBase(record)).file).toBeNull();
    responses[key] = { sha: "e".repeat(40), truncated: true, tree: [] };
    await expect(client.readBase(record)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
  it("rejects substituted objects, duplicate entries and symlinked directories", async () => {
    for (const listing of [
      { sha: "0".repeat(40), truncated: false, tree: [] },
      {
        sha: tree,
        truncated: false,
        tree: [1, 2].map(() => ({
          path: "content",
          sha: blob,
          type: "tree",
          mode: "040000",
        })),
      },
      {
        sha: tree,
        truncated: false,
        tree: [{ path: "content", sha: blob, type: "blob", mode: "120000" }],
      },
    ]) {
      const { client, responses } = fixture();
      responses[`/git/trees/${tree}`] = listing;
      await expect(client.readBase(record)).rejects.toThrow();
    }
  });
});
