import { createHash } from "node:crypto";
import { exportPKCS8, flattenedVerify, generateKeyPair } from "jose";
import { expect, it } from "vitest";
import { EditorialGitHub } from "../../src/editorial/github";
import type { Publication } from "../../src/editorial/publication";
import { signPublication } from "../../src/editorial/publication-signature";

const publication: Publication = {
  id: "12345678-1234-1234-1234-123456789abc",
  record: { kind: "page", id: "home" },
  path: "content/public/pages/home.md",
  source: "---\nsubheading: héllo 🌤\n---\n",
  revision: 2,
  baseCommit: "a".repeat(40),
  baseFileHash: "b".repeat(40),
  createdAt: 1788900000000,
};
const base = {
  head: "c".repeat(40),
  tree: "d".repeat(40),
  file: {
    path: publication.path,
    sha: publication.baseFileHash!,
    mode: "100644",
    type: "blob",
  },
};

it("signs the exact content and inspected parent atomically inside Workers", async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  let treeWrites = 0;
  const client = new EditorialGitHub(
    async () => "synthetic-installation-token",
    async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith("/git/trees")) {
        treeWrites++;
        expect(body.base_tree).toBe(base.tree);
        expect(body.tree).toHaveLength(2);
        const [content, manifest] = body.tree;
        expect(content).toEqual({
          path: publication.path,
          mode: "100644",
          type: "blob",
          content: publication.source,
        });
        expect(manifest).toMatchObject({
          path: "content/publication.json",
          mode: "100644",
          type: "blob",
        });
        const verified = await flattenedVerify(
          JSON.parse(manifest.content),
          keys.publicKey,
          { algorithms: ["RS256"] },
        );
        expect(verified.protectedHeader).toEqual({
          alg: "RS256",
          typ: "editorial-publication",
        });
        expect(JSON.parse(new TextDecoder().decode(verified.payload))).toEqual({
          version: 1,
          repository: "anipotts/anipotts.com",
          operationId: publication.id,
          revision: publication.revision,
          baseHead: base.head,
          files: [
            {
              path: publication.path,
              sha256: createHash("sha256")
                .update(content.content)
                .digest("hex"),
            },
          ],
        });
        expect(manifest.content).toBe(
          await signPublication(publication, base.head, privateKey),
        );
        return Response.json({ sha: "e".repeat(40) }, { status: 201 });
      }
      expect(String(url)).toBe(
        "https://api.github.com/repos/anipotts/anipotts.com/git/commits",
      );
      expect(body.parents).toEqual([base.head]);
      expect(body.tree).toBe("e".repeat(40));
      return Response.json({ sha: "f".repeat(40) }, { status: 201 });
    },
    (snapshot, head) => signPublication(snapshot, head, privateKey),
  );
  expect(await client.createCommit(publication, base)).toBe("f".repeat(40));
  expect(treeWrites).toBe(1);
});

it("fails before token minting or GitHub writes when signing is unavailable", async () => {
  let tokenCalls = 0;
  let requests = 0;
  for (const sign of [
    undefined,
    async () => {
      throw new Error("private signing detail");
    },
    async () => "",
    async () => "x".repeat(32_769),
  ]) {
    const client = new EditorialGitHub(
      async () => {
        tokenCalls++;
        return "synthetic-installation-token";
      },
      async () => {
        requests++;
        throw new Error("unexpected provider request");
      },
      sign,
    );
    await expect(client.createCommit(publication, base)).rejects.toMatchObject({
      code: "unauthorized",
      message: "unauthorized",
    });
  }
  expect(tokenCalls).toBe(0);
  expect(requests).toBe(0);
});

it("commits an image and its signed content reference in the same Git tree", async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
  const digest = createHash("sha256").update(image).digest("hex");
  const id = `${digest}.png`;
  const snapshot = {
    ...publication,
    source: `${publication.source}\n![Photo](/images/editorial/${id})`,
    attachments: [{ id, base64: image.toString("base64") }],
  };
  const calls: string[] = [];
  const client = new EditorialGitHub(
    async () => "synthetic",
    async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      const body = JSON.parse(String(init?.body));
      if (path.endsWith("/git/blobs")) {
        expect(body).toEqual({
          encoding: "base64",
          content: image.toString("base64"),
        });
        return Response.json({ sha: "1".repeat(40) }, { status: 201 });
      }
      if (path.endsWith("/git/trees")) {
        expect(body.tree).toHaveLength(3);
        expect(body.tree[0].content).toBe(snapshot.source);
        expect(body.tree[1]).toEqual({
          path: `apps/www/public/images/editorial/${id}`,
          mode: "100644",
          type: "blob",
          sha: "1".repeat(40),
        });
        const verified = await flattenedVerify(
          JSON.parse(body.tree[2].content),
          keys.publicKey,
          { algorithms: ["RS256"] },
        );
        expect(
          JSON.parse(new TextDecoder().decode(verified.payload)).files,
        ).toContainEqual({
          path: `apps/www/public/images/editorial/${id}`,
          sha256: digest,
        });
        return Response.json({ sha: "e".repeat(40) }, { status: 201 });
      }
      expect(path.endsWith("/git/commits")).toBe(true);
      expect(body.parents).toEqual([base.head]);
      return Response.json({ sha: "f".repeat(40) }, { status: 201 });
    },
    (value, head) => signPublication(value, head, privateKey),
  );
  expect(await client.createCommit(snapshot, base)).toBe("f".repeat(40));
  expect(calls.map((path) => path.split("/").at(-1))).toEqual([
    "blobs",
    "trees",
    "commits",
  ]);
  calls.length = 0;
  await expect(
    client.createCommit({ ...snapshot, attachments: [] }, base),
  ).rejects.toThrow();
  expect(calls).toEqual([]);
});
