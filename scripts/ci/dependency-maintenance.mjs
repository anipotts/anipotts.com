#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const repo = "anipotts/anipotts.com";
const query = `query { repository(owner:"anipotts",name:"anipotts.com") {
  nameWithOwner defaultBranchRef { name target { oid } }
  pullRequests(first:100,states:OPEN,orderBy:{field:UPDATED_AT,direction:DESC}) {
    pageInfo { hasNextPage }
    nodes { number title url isDraft author { __typename login } headRefName headRefOid baseRefName
      headRepository { nameWithOwner } mergeStateStatus mergeable autoMergeRequest { enabledAt }
      files(first:100) { pageInfo { hasNextPage } nodes { path additions deletions } }
      reviewThreads(first:100) { pageInfo { hasNextPage } nodes { id isResolved isOutdated path comments(first:1) { nodes { body url author { login } } } } }
      commits(last:1) { nodes { commit { oid statusCheckRollup { contexts(first:100) { pageInfo { hasNextPage } nodes { __typename ... on CheckRun { name status conclusion detailsUrl checkSuite { app { databaseId slug } } } ... on StatusContext { context state targetUrl } } } } } } }
    }
  }
} }`;

export function classify(pr, required) {
  if (
    pr.author?.__typename !== "Bot" ||
    pr.author?.login !== "dependabot" ||
    pr.headRepository?.nameWithOwner !== repo ||
    pr.baseRefName !== "main" ||
    !pr.headRefName.startsWith("dependabot/")
  )
    return "excluded";
  const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  if (
    pr.files.pageInfo.hasNextPage ||
    pr.reviewThreads.pageInfo.hasNextPage ||
    contexts?.pageInfo.hasNextPage
  )
    return "inspect_pagination";
  if (pr.isDraft) return "inspect_draft_hold";
  if (pr.reviewThreads.nodes.some((t) => !t.isResolved))
    return "address_review";
  if (pr.mergeable === "CONFLICTING") return "repair_conflict";
  if (pr.mergeStateStatus === "BEHIND") return "refresh_base";
  if (pr.commits.nodes[0]?.commit.oid !== pr.headRefOid || !contexts)
    return "wait_checks";
  const checks = contexts.nodes;
  for (const requiredCheck of required) {
    const matches = checks.filter(
      (c) =>
        c.__typename === "CheckRun" &&
        c.name === requiredCheck.context &&
        (requiredCheck.app_id === null ||
          c.checkSuite?.app?.databaseId === requiredCheck.app_id),
    );
    if (matches.length !== 1) return "inspect_checks";
    if (matches[0].status !== "COMPLETED") return "wait_checks";
    if (matches[0].conclusion !== "SUCCESS") return "repair_checks";
  }
  if (pr.mergeStateStatus !== "CLEAN") return "inspect_merge_gate";
  return pr.autoMergeRequest ? "wait_merge" : "review_then_enable_auto_merge";
}

export function inspect(gh) {
  const protection = gh(["api", `repos/${repo}/branches/main/protection`]);
  const repository = gh(["api", "graphql", "-f", `query=${query}`]).data
    .repository;
  if (repository.pullRequests.pageInfo.hasNextPage)
    throw new Error("pull_request_pagination_required");
  const required = protection.required_status_checks?.checks ?? [];
  const protectionIntact =
    required.length > 0 &&
    protection.required_status_checks.strict &&
    protection.enforce_admins?.enabled &&
    protection.required_conversation_resolution?.enabled &&
    !protection.allow_force_pushes?.enabled &&
    !protection.allow_deletions?.enabled;
  // Rulesets and exact PR files still require review before any mutation. This
  // command deliberately never executes candidate code or modifies GitHub.
  const prs = repository.pullRequests.nodes
    .filter(
      (pr) =>
        pr.author?.__typename === "Bot" && pr.author?.login === "dependabot",
    )
    .map((pr) => ({
      ...pr,
      action: protectionIntact ? classify(pr, required) : "inspect_protection",
    }));
  const deployments = gh([
    "api",
    `repos/${repo}/actions/workflows/deploy.yml/runs?per_page=10`,
  ]).workflow_runs.map((run) => ({
    id: run.id,
    sha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
  }));
  const state = {
    base: repository.defaultBranchRef,
    protectionIntact,
    required,
    prs,
    deployments,
  };
  return {
    ...state,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(state))
      .digest("hex"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const started = Date.now();
  try {
    const result = inspect((args) => {
      const remaining = 90_000 - (Date.now() - started);
      if (remaining <= 0) throw new Error("inspection_budget_exhausted");
      return JSON.parse(
        execFileSync("gh", args, {
          encoding: "utf8",
          timeout: Math.min(30_000, remaining),
          maxBuffer: 8 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    });
    const previous = process.argv.indexOf("--previous");
    const unchanged =
      previous !== -1 && process.argv[previous + 1] === result.fingerprint;
    console.log(JSON.stringify({ ...result, unchanged }));
    console.error(
      unchanged
        ? "dependencies: unchanged"
        : result.prs.map((pr) => `#${pr.number}: ${pr.action}`).join("\n") ||
            "dependencies: no open candidates",
    );
  } catch {
    console.log(
      JSON.stringify({
        error: "inspection_unavailable",
        retryAfterSeconds: 1800,
      }),
    );
    process.exitCode = 1;
  }
}
