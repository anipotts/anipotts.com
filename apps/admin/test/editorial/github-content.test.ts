import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";

const head = "a".repeat(40),
  tree = "b".repeat(40);
const record = { kind: "page", id: "home" } as const;
const path = "content/public/pages/home.md";
function fixture(source = "\uFEFF---\r\ntitle: café\r\n---\r\n") {
  const bytes = Buffer.from(source);
  const sha = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  const file = { record, path, sha };
  const responses: Record<string, unknown> = {
    [`/git/commits/${head}`]: { sha: head, tree: { sha: tree } },
    [`/git/trees/${tree}?recursive=1`]: {
      sha: tree,
      truncated: false,
      tree: [{ path, sha, type: "blob", mode: "100644", size: bytes.length }],
    },
    [`/git/blobs/${sha}`]: {
      sha,
      encoding: "base64",
      size: bytes.length,
      content: bytes.toString("base64"),
    },
  };
  const client = new EditorialGitHub(
    async () => "synthetic",
    async (url, init) => {
      expect(init?.method).toBe("GET");
      const key = String(url).replace(
        "https://api.github.com/repos/anipotts/anipotts.com",
        "",
      );
      expect(Object.hasOwn(responses, key)).toBe(true);
      return Response.json(responses[key]);
    },
  );
  return { client, responses, file, source };
}
describe("Git content inventory and verified source", () => {
  it("pins the inventory and preserves exact Unicode, BOM and newline bytes", async () => {
    const { client, file, source } = fixture();
    expect(await client.readContentInventory(head)).toEqual({
      head,
      tree,
      files: [file],
    });
    expect(await client.readContentSource(file)).toBe(source);
  });
  it("rejects truncated inventories, unexpected files and symlinks", async () => {
    for (const entry of [
      {
        path: "content/public/pages/home.md",
        mode: "120000",
        type: "blob",
        sha: head,
        size: 1,
      },
      {
        path: "content/public/pages/new-unknown-page.md",
        mode: "100644",
        type: "blob",
        sha: head,
        size: 1,
      },
      {
        path: "content/public/writing/injected.mdx",
        mode: "100644",
        type: "blob",
        sha: head,
        size: 1,
      },
    ]) {
      const { client, responses } = fixture();
      responses[`/git/trees/${tree}?recursive=1`] = {
        sha: tree,
        truncated: false,
        tree: [entry],
      };
      await expect(client.readContentInventory(head)).rejects.toThrow();
    }
    const { client, responses } = fixture();
    responses[`/git/trees/${tree}?recursive=1`] = {
      sha: tree,
      truncated: true,
      tree: [],
    };
    await expect(client.readContentInventory(head)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
  it("rejects provider byte substitution, false sizes and malformed base64", async () => {
    for (const content of [
      Buffer.from("substituted").toString("base64"),
      "!!!!",
    ]) {
      const { client, responses, file } = fixture();
      responses[`/git/blobs/${file.sha}`] = {
        sha: file.sha,
        encoding: "base64",
        size: 11,
        content,
      };
      await expect(client.readContentSource(file)).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  });
});
