/// <reference types="astro/client" />
import { describe, expect, it } from "vitest";
import {
  editorialRecordSchema,
  setEditorialField,
} from "@anipotts/content/editorial/source";
import { publicationPreflight } from "../../src/editorial/publication-preflight";
import type { GitContentFile } from "../../src/editorial/github";
import type { Publication } from "../../src/editorial/publication";
import { publicationStage } from "../../src/editorial/publication-stage";
import type { PublishJob } from "../../src/editorial/publication-jobs";

const sources = import.meta.glob<string>(
  "../../../../content/public/{pages,projects,writing}/*.md",
  { query: "?raw", import: "default", eager: true },
);
const head = "a".repeat(40),
  tree = "b".repeat(40),
  sha = "c".repeat(40);
function fixture() {
  const files: GitContentFile[] = [];
  const byPath = new Map<string, string>();
  for (const [raw, source] of Object.entries(sources)) {
    const path = raw.slice(raw.indexOf("content/public/"));
    if (path.endsWith("/newsletter_archive.md")) continue;
    const [, , folder, name] = path.split("/");
    const record = editorialRecordSchema.parse({
      kind:
        folder === "pages"
          ? "page"
          : folder === "projects"
            ? "work"
            : "writing",
      id: name!.replace(/\.md$/, ""),
    });
    files.push({ record, path, sha });
    byPath.set(path, source);
  }
  const path = "content/public/pages/home.md";
  const publication: Publication = {
    id: "40c949e1-0e1e-40a1-8eca-2b1b0202a1e5",
    record: { kind: "page", id: "home" },
    path,
    revision: 1,
    baseCommit: "0".repeat(40),
    baseFileHash: sha,
    createdAt: 1,
    source: setEditorialField(
      byPath.get(path)!,
      ["sections", "intro", "subheading"],
      "my changed subheading",
    ),
  };
  const base = {
    head,
    tree,
    file: { path, sha, mode: "100644", type: "blob" },
  };
  const reads: string[] = [];
  const git = {
    async readBase() {
      return base;
    },
    async readContentInventory(pinned: string) {
      expect(pinned).toBe(head);
      return { head, tree, files };
    },
    async readContentSource(file: GitContentFile) {
      reads.push(file.path);
      return byPath.get(file.path)!;
    },
  };
  return { publication, base, git, reads, files };
}
describe("publication content preflight", () => {
  it("advances frozen content through guarded checkpoints and stops on a release hold", async () => {
    const { publication, git } = fixture();
    const calls: string[] = [];
    const publisher = {
      ...git,
      async ensureProtectedMerge() {
        calls.push("merge");
      },
      async readDeploymentRun() {
        return { id: "123", state: "passed" as const };
      },
      async readPullRequest() {
        throw new Error("unexpected PR read");
      },
      async readRequiredChecks() {
        throw new Error("unexpected checks read");
      },
      async requireProtectedPublishing() {
        calls.push("protect");
        return [];
      },
      async createCommit(receipt: Publication) {
        expect(receipt).toEqual(publication);
        calls.push("commit");
        return "d".repeat(40);
      },
      async ensureBranch() {
        calls.push("branch");
      },
      async ensurePullRequest() {
        calls.push("pr");
        return {
          number: 1,
          nodeId: "PR_1",
          url: "https://github.com/anipotts/anipotts.com/pull/1",
          state: "open" as const,
          merged: false,
          head: "d".repeat(40),
        };
      },
    };
    const job: PublishJob = {
      id: publication.id,
      phase: "validate",
      version: 1,
      attempts: 1,
      dueAt: 1,
      lease: "test",
      leaseUntil: 10000,
      blocked: null,
      checkpoint: {},
    };
    expect(
      await publicationStage(job, publication, publisher, async () => ({
        ready: false,
        code: "publication_hold",
      })),
    ).toEqual({ blocked: "publication_hold" });
    expect(calls).toEqual(["protect"]);
    calls.length = 0;
    const ready = async (pinned: string) => ({
      ready: true as const,
      head: pinned,
    });
    for (const phase of ["validate", "commit", "branch", "pr"] as const) {
      job.phase = phase;
      const outcome = await publicationStage(
        job,
        publication,
        publisher,
        ready,
      );
      expect(outcome.blocked).toBeUndefined();
      Object.assign(job.checkpoint, outcome.checkpoint);
    }
    expect(calls).toEqual([
      "protect",
      "protect",
      "commit",
      "protect",
      "branch",
      "protect",
      "pr",
    ]);
    expect(job.checkpoint).toMatchObject({
      baseHead: head,
      baseTree: tree,
      commit: "d".repeat(40),
      prNumber: "1",
      prNodeId: "PR_1",
    });
    job.phase = "checks";
    const pr = {
      number: 1,
      nodeId: "PR_1",
      url: "https://github.com/anipotts/anipotts.com/pull/1",
      state: "open" as "open" | "closed",
      merged: false,
      head: "d".repeat(40),
      mergeCommit: null as string | null,
    };
    let checkState: "pending" | "failed" | "passed" = "pending";
    const observer = {
      ...publisher,
      async readPullRequest(
        id: string,
        commit: string,
        number: number,
        nodeId: string,
      ) {
        expect([id, commit, number, nodeId]).toEqual([
          publication.id,
          "d".repeat(40),
          1,
          "PR_1",
        ]);
        return pr;
      },
      async readRequiredChecks(commit: string) {
        expect(commit).toBe("d".repeat(40));
        return { state: checkState, pending: [], failed: [] };
      },
    };
    expect(
      (await publicationStage(job, publication, observer, ready)).retryAt,
    ).toBeGreaterThan(Date.now());
    checkState = "failed";
    expect(await publicationStage(job, publication, observer, ready)).toEqual({
      blocked: "required_checks_failed",
    });
    checkState = "passed";
    expect(
      (await publicationStage(job, publication, observer, ready)).retryAt,
    ).toBeGreaterThan(Date.now());
    expect(calls.at(-1)).toBe("merge");
    pr.state = "closed";
    expect(await publicationStage(job, publication, observer, ready)).toEqual({
      blocked: "publication_closed",
    });
    pr.merged = true;
    pr.mergeCommit = "e".repeat(40);
    expect(await publicationStage(job, publication, observer, ready)).toEqual({
      next: "deploy",
      checkpoint: { mergeCommit: "e".repeat(40) },
    });
    job.phase = "deploy";
    job.checkpoint.mergeCommit = "e".repeat(40);
    expect(await publicationStage(job, publication, observer, ready)).toEqual({
      next: "verify",
      checkpoint: { deployRun: "123" },
    });
    job.phase = "verify";
    expect(
      await publicationStage(
        job,
        publication,
        observer,
        ready,
        async () => false,
      ),
    ).toEqual({ blocked: "release_content_mismatch" });
    expect(
      await publicationStage(
        job,
        publication,
        observer,
        ready,
        async () => true,
      ),
    ).toEqual({ next: "live", checkpoint: { deployRun: "123" } });
  });
  it("validates a frozen home edit against the complete pinned canonical inventory", async () => {
    const { publication, base, git, reads, files } = fixture();
    expect(await publicationPreflight(publication, git)).toEqual({
      ok: true,
      base,
    });
    expect(reads).not.toContain(publication.path);
    expect(reads).toHaveLength(files.length - 1);
  });
  it("blocks overlapping edits before inventory reads and preserves the frozen source", async () => {
    const { publication, git, base, reads } = fixture();
    base.file.sha = "d".repeat(40);
    expect(await publicationPreflight(publication, git)).toMatchObject({
      ok: false,
      code: "record_changed",
    });
    expect(reads).toHaveLength(0);
    expect(publication.source).toContain("my changed subheading");
  });
  it("rejects a missing inventory record or a broken selected reference", async () => {
    const { publication, git, files } = fixture();
    const broken = {
      ...publication,
      source: setEditorialField(
        publication.source,
        ["sections", "latest_thoughts", "writing_slugs"],
        ["missing-writing"],
      ),
    };
    expect(await publicationPreflight(broken, git)).toMatchObject({
      ok: false,
      code: "invalid_content",
    });
    files.splice(
      files.findIndex((file) => file.path === publication.path),
      1,
    );
    expect(await publicationPreflight(publication, git)).toMatchObject({
      ok: false,
      code: "invalid_git_snapshot",
    });
  });
});
