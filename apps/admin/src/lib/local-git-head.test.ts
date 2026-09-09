import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localGitHead } from "./local-git-head";
const roots: string[] = [];
const sha = "a".repeat(40);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "editorial-git-test-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
describe("local Git metadata without a Git executable", () => {
  it("reads loose references and notices updates without caching", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git/refs/heads"), { recursive: true });
    await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(root, ".git/refs/heads/main"), sha + "\n");
    expect(await localGitHead(root)).toBe(sha);
    await writeFile(join(root, ".git/refs/heads/main"), "b".repeat(40));
    expect(await localGitHead(root)).toBe("b".repeat(40));
  });
  it("reads linked worktrees and packed references", async () => {
    const root = await fixture();
    await mkdir(join(root, "metadata/worktrees/review"), { recursive: true });
    await writeFile(join(root, ".git"), "gitdir: metadata/worktrees/review\n");
    await writeFile(
      join(root, "metadata/worktrees/review/HEAD"),
      "ref: refs/heads/codex/review\n",
    );
    await writeFile(
      join(root, "metadata/worktrees/review/commondir"),
      "../..\n",
    );
    await writeFile(
      join(root, "metadata/packed-refs"),
      `# pack-refs\n${sha} refs/heads/codex/review\n`,
    );
    expect(await localGitHead(root)).toBe(sha);
  });
  it("reads detached HEAD and rejects malformed references", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git/HEAD"), sha);
    expect(await localGitHead(root)).toBe(sha);
    await writeFile(join(root, ".git/HEAD"), "ref: refs/../../secret");
    await expect(localGitHead(root)).rejects.toThrow("invalid_git_head");
  });
  it("recovers on the next request after temporarily missing metadata", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git/refs/heads"), { recursive: true });
    await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
    await expect(localGitHead(root)).rejects.toThrow();
    await writeFile(join(root, ".git/refs/heads/main"), sha);
    expect(await localGitHead(root)).toBe(sha);
  });
  it("rejects corrupt loose metadata instead of using an older packed value", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git/refs/heads"), { recursive: true });
    await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(root, ".git/refs/heads/main"), "incomplete");
    await writeFile(join(root, ".git/packed-refs"), `${sha} refs/heads/main\n`);
    await expect(localGitHead(root)).rejects.toThrow("invalid_git_reference");
  });
});
