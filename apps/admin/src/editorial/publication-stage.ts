import type { EditorialGitHub } from "./github";
import type { Publication } from "./publication";
import type { PublishJob, PublishOutcome } from "./publication-jobs";
import { publicationPreflight } from "./publication-preflight";

type PublisherGit = Pick<
  EditorialGitHub,
  | "readBase"
  | "readContentInventory"
  | "readContentSource"
  | "requireProtectedPublishing"
  | "createCommit"
  | "ensureBranch"
  | "ensurePullRequest"
  | "readPullRequest"
  | "readRequiredChecks"
  | "ensureProtectedMerge"
  | "readDeploymentRun"
>;
export type ReleaseReadiness = (head: string) => Promise<
  | { ready: true; head: string }
  | {
      ready: false;
      code:
        | "unreleased_public_changes"
        | "stale_renderer"
        | "release_unavailable"
        | "publication_hold";
    }
>;

/** Advance one durable checkpoint. Release readiness is mandatory: content
 * validation alone cannot authorize an unreleased or incompatible public base.
 */
export async function publicationStage(
  job: PublishJob,
  publication: Publication,
  git: PublisherGit,
  releaseReadiness: ReleaseReadiness,
  verifyRelease?: (publication: Publication, merge: string) => Promise<boolean>,
): Promise<PublishOutcome> {
  if (job.id !== publication.id) return { blocked: "publication_mismatch" };
  if (job.phase === "live") return {};
  if (job.phase === "deploy" || job.phase === "verify") {
    const merge = job.checkpoint.mergeCommit;
    if (!merge) return { blocked: "missing_checkpoint" };
    const run = await git.readDeploymentRun(merge);
    if (!run || run.state === "pending")
      return { retryAt: Date.now() + 30_000 };
    if (run.state === "failed") return { blocked: "deployment_failed" };
    if (job.phase === "deploy")
      return { next: "verify", checkpoint: { deployRun: run.id } };
    if (!verifyRelease)
      return { blocked: "release_verification_not_configured" };
    if (!(await verifyRelease(publication, merge)))
      return { blocked: "release_content_mismatch" };
    return { next: "live", checkpoint: { deployRun: run.id } };
  }
  const requiredChecks = await git.requireProtectedPublishing();
  if (job.phase === "checks") {
    const { commit, prNumber, prNodeId } = job.checkpoint;
    if (!commit || !prNumber || !prNodeId || !/^[1-9][0-9]*$/.test(prNumber))
      return { blocked: "missing_checkpoint" };
    const pr = await git.readPullRequest(
      publication.id,
      commit,
      Number(prNumber),
      prNodeId,
    );
    if (pr.merged && pr.mergeCommit)
      return { next: "deploy", checkpoint: { mergeCommit: pr.mergeCommit } };
    if (pr.state === "closed") return { blocked: "publication_closed" };
    const checks = await git.readRequiredChecks(commit, requiredChecks);
    if (checks.state === "pending") return { retryAt: Date.now() + 30_000 };
    if (checks.state === "failed") return { blocked: "required_checks_failed" };
    await git.ensureProtectedMerge(
      publication.id,
      commit,
      Number(prNumber),
      prNodeId,
    );
    return { retryAt: Date.now() + 30_000 };
  }
  const pinned = job.checkpoint.baseHead;
  if (job.phase === "validate" || job.phase === "commit") {
    if (job.phase === "commit" && !pinned)
      return { blocked: "missing_checkpoint" };
    const result = await publicationPreflight(publication, git, pinned);
    if (!result.ok) return { blocked: result.code };
    if (job.phase === "commit" && result.base.tree !== job.checkpoint.baseTree)
      return { blocked: "checkpoint_mismatch" };
    const readiness = await releaseReadiness(result.base.head);
    if (!readiness.ready) return { blocked: readiness.code };
    if (readiness.head !== result.base.head)
      return { blocked: "readiness_mismatch" };
    if (job.phase === "validate")
      return {
        next: "commit",
        checkpoint: { baseHead: result.base.head, baseTree: result.base.tree },
      };
    const commit = await git.createCommit(publication, result.base);
    return { next: "branch", checkpoint: { commit } };
  }
  const commit = job.checkpoint.commit;
  if (!pinned || !commit) return { blocked: "missing_checkpoint" };
  if (job.phase === "branch") {
    await git.ensureBranch(publication.id, commit);
    return { next: "pr" };
  }
  const pr = await git.ensurePullRequest(publication.id, commit);
  if (pr.state === "closed")
    return {
      blocked: pr.merged
        ? "merged_requires_reconciliation"
        : "publication_closed",
    };
  return {
    next: "checks",
    checkpoint: { prNumber: String(pr.number), prNodeId: pr.nodeId },
  };
}
