import { preparePublication, type GitBase } from "./prepare-publication";
import type { Publication } from "./publication";
import {
  editorialRecordPath,
  editorialRecordSchema,
  MAX_SOURCE_BYTES,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";

const repository = "anipotts/anipotts.com";
const root = `https://api.github.com/repos/${repository}`;
const hash = /^[a-f0-9]{40}$/;
const operation = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export type PublicationPR = {
  number: number;
  nodeId: string;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  head: string;
};
export type GitContentFile = {
  record: EditorialRecord;
  path: string;
  sha: string;
};
export type RequiredCheck = { context: string; appId: number };
export type PublicationChecks = {
  state: "pending" | "failed" | "passed";
  pending: string[];
  failed: string[];
};

export class GitHubFailure extends Error {
  constructor(
    readonly code:
      | "unavailable"
      | "unauthorized"
      | "rate_limited"
      | "rejected"
      | "invalid_response"
      | "unexpected_branch",
    readonly retryAfterMs = 0,
  ) {
    super(code);
  }
}

/** Installation tokens are injected by the server. No browser-controlled destination.
 * A failed write is never retried here: the durable coordinator must reconcile first.
 */
export class EditorialGitHub {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly transport: typeof fetch = fetch,
    private readonly signPublication?: (
      publication: Publication,
      baseHead: string,
    ) => Promise<string>,
  ) {}

  private async request(
    path: string,
    method = "GET",
    body?: unknown,
    graphql = false,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.transport(
        graphql ? "https://api.github.com/graphql" : `${root}${path}`,
        {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
          headers: {
            Authorization: `Bearer ${await this.token()}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "anipotts-editorial",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
    } catch (error) {
      if (error instanceof GitHubFailure) throw error;
      throw new GitHubFailure("unavailable");
    }
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.has("Retry-After") ||
          response.headers.get("X-RateLimit-Remaining") === "0"))
    ) {
      const retrySeconds = Number(response.headers.get("Retry-After"));
      const reset =
        Number(response.headers.get("X-RateLimit-Reset")) * 1000 - Date.now();
      const delay =
        retrySeconds > 0 ? retrySeconds * 1000 : reset > 0 ? reset : 60_000;
      throw new GitHubFailure("rate_limited", Math.max(1000, delay));
    }
    if (response.status === 401 || response.status === 403)
      throw new GitHubFailure("unauthorized");
    if (response.status >= 500) throw new GitHubFailure("unavailable");
    return response;
  }

  private branch(id: string) {
    if (!operation.test(id)) throw new GitHubFailure("rejected");
    return `codex/editorial-${id}`;
  }

  private async readObject(path: string): Promise<Record<string, unknown>> {
    return object(await this.readJson(path));
  }

  private async readJson(path: string): Promise<unknown> {
    const response = await this.request(path);
    return this.responseJson(response);
  }

  private async responseJson(response: Response): Promise<unknown> {
    if (!response.ok) throw new GitHubFailure("rejected");
    if (response.headers.get("Link")?.includes('rel="next"'))
      throw new GitHubFailure("invalid_response");
    try {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = "",
        bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2 * 1024 * 1024) {
            await reader.cancel();
            throw new Error();
          }
          text += decoder.decode(part.value, { stream: true });
        }
        return JSON.parse(text + decoder.decode());
      } finally {
        reader.releaseLock();
      }
    } catch {
      throw new GitHubFailure("invalid_response");
    }
  }

  /** Native exact-head merge only; provider checks/reviews are never bypassed.
   * Read before each mutation so retries reconcile an already enabled/merged PR.
   */
  async ensureProtectedMerge(
    id: string,
    commit: string,
    number: number,
    nodeId: string,
  ): Promise<void> {
    const required = await this.requireProtectedPublishing();
    const pr = await this.readPullRequest(id, commit, number, nodeId);
    if (pr.merged) return;
    if (pr.state !== "open") throw new GitHubFailure("rejected");
    if ((await this.readRequiredChecks(commit, required)).state !== "passed")
      throw new GitHubFailure("rejected");
    const query = await this.graphql({
      query: `query($id: ID!) { node(id: $id) { ... on PullRequest { id number headRefOid headRefName baseRefName state isDraft mergeStateStatus repository { nameWithOwner } headRepository { nameWithOwner } autoMergeRequest { mergeMethod } } } }`,
      variables: { id: nodeId },
    });
    const node = object(query.node);
    if (
      node.id !== nodeId ||
      node.number !== number ||
      node.headRefOid !== commit ||
      node.headRefName !== this.branch(id) ||
      node.baseRefName !== "main" ||
      node.state !== "OPEN" ||
      node.isDraft !== false ||
      object(node.repository).nameWithOwner !== repository ||
      object(node.headRepository).nameWithOwner !== repository
    )
      throw new GitHubFailure("unexpected_branch");
    if (node.autoMergeRequest !== null) {
      if (object(node.autoMergeRequest).mergeMethod !== "SQUASH")
        throw new GitHubFailure("rejected");
      return;
    }
    const immediate = node.mergeStateStatus === "CLEAN";
    const mutation = immediate
      ? "mergePullRequest"
      : "enablePullRequestAutoMerge";
    const inputType = immediate
      ? "MergePullRequestInput"
      : "EnablePullRequestAutoMergeInput";
    const result = await this.graphql({
      query: `mutation($input: ${inputType}!) { ${mutation}(input: $input) { pullRequest { id headRefOid } } }`,
      variables: {
        input: {
          pullRequestId: nodeId,
          expectedHeadOid: commit,
          mergeMethod: "SQUASH",
          clientMutationId: id,
        },
      },
    });
    const confirmed = object(object(result[mutation]).pullRequest);
    if (confirmed.id !== nodeId || confirmed.headRefOid !== commit)
      throw new GitHubFailure("invalid_response");
  }

  private async graphql(body: unknown): Promise<Record<string, unknown>> {
    const value = object(
      await this.responseJson(await this.request("", "POST", body, true)),
    );
    if (value.errors !== undefined || !value.data)
      throw new GitHubFailure("rejected");
    return object(value.data);
  }

  /** Prove ancestry and return a complete, bounded changed-file inventory. */
  async compare(base: string, head: string): Promise<string[]> {
    if (!hash.test(base) || !hash.test(head))
      throw new GitHubFailure("rejected");
    if (base === head) return [];
    const value = await this.readObject(
      `/compare/${base}...${head}?per_page=100`,
    );
    if (
      !["ahead", "identical"].includes(String(value.status)) ||
      object(value.base_commit).sha !== base ||
      object(value.merge_base_commit).sha !== base ||
      !Array.isArray(value.files) ||
      value.files.length >= 300
    )
      throw new GitHubFailure("invalid_response");
    const files: string[] = [];
    for (const raw of value.files) {
      const file = object(raw);
      if (typeof file.filename !== "string")
        throw new GitHubFailure("invalid_response");
      files.push(file.filename);
      if (file.previous_filename !== undefined) {
        if (typeof file.previous_filename !== "string")
          throw new GitHubFailure("invalid_response");
        files.push(file.previous_filename);
      }
    }
    return files;
  }

  async readDeploymentRun(
    head: string,
  ): Promise<{ id: string; state: "pending" | "failed" | "passed" } | null> {
    if (!hash.test(head)) throw new GitHubFailure("rejected");
    const value = await this.readObject(
      `/actions/workflows/deploy.yml/runs?head_sha=${head}&event=push&per_page=100`,
    );
    if (
      !Array.isArray(value.workflow_runs) ||
      value.total_count !== value.workflow_runs.length
    )
      throw new GitHubFailure("invalid_response");
    const runs = value.workflow_runs
      .map(object)
      .sort((a, b) => Number(b.id) - Number(a.id));
    if (!runs.length) return null;
    const run = runs[0]!;
    if (
      !Number.isSafeInteger(run.id) ||
      Number(run.id) < 1 ||
      run.head_sha !== head ||
      run.event !== "push" ||
      run.head_branch !== "main" ||
      object(run.repository).full_name !== repository ||
      run.path !== ".github/workflows/deploy.yml"
    )
      throw new GitHubFailure("invalid_response");
    if (run.status !== "completed")
      return { id: String(run.id), state: "pending" };
    if (run.conclusion !== "success")
      return { id: String(run.id), state: "failed" };
    const jobs = await this.readObject(
      `/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    );
    if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length)
      throw new GitHubFailure("invalid_response");
    const www = jobs.jobs
      .map(object)
      .filter((job) => job.name === "Deploy www");
    if (
      www.length !== 1 ||
      www[0]!.head_sha !== head ||
      www[0]!.status !== "completed" ||
      www[0]!.conclusion !== "success"
    )
      return { id: String(run.id), state: "failed" };
    return { id: String(run.id), state: "passed" };
  }

  /** Inspect live provider enforcement, never mutate policy or trust a UI label.
   * This repository combines classic required checks with a PR-only ruleset.
   */
  async requireProtectedPublishing(): Promise<
    { context: string; appId: number }[]
  > {
    const repo = await this.readObject("");
    if (
      repo.full_name !== repository ||
      repo.default_branch !== "main" ||
      repo.allow_auto_merge !== true ||
      repo.allow_squash_merge !== true ||
      repo.delete_branch_on_merge !== true ||
      repo.archived !== false
    )
      throw new GitHubFailure("rejected");
    const protection = await this.readObject("/branches/main/protection");
    const checks = object(protection.required_status_checks);
    if (
      checks.strict !== true ||
      object(protection.enforce_admins).enabled !== true ||
      object(protection.required_conversation_resolution).enabled !== true ||
      object(protection.allow_force_pushes).enabled !== false ||
      object(protection.allow_deletions).enabled !== false ||
      !Array.isArray(checks.checks)
    )
      throw new GitHubFailure("rejected");
    const required: { context: string; appId: number }[] = [];
    for (const raw of checks.checks) {
      const check = object(raw);
      if (
        typeof check.context !== "string" ||
        !check.context ||
        !Number.isSafeInteger(check.app_id) ||
        Number(check.app_id) <= 0
      )
        throw new GitHubFailure("rejected");
      required.push({ context: check.context, appId: Number(check.app_id) });
    }
    if (
      !["Build, lint, typecheck, test", "Security Review"].every((context) =>
        required.some(
          (check) => check.context === context && check.appId === 15368,
        ),
      )
    )
      throw new GitHubFailure("rejected");
    const applied = await this.readJson("/rules/branches/main?per_page=100");
    if (!Array.isArray(applied)) throw new GitHubFailure("invalid_response");
    const ruleIds = new Set<number>();
    for (const raw of applied) {
      const rule = object(raw);
      if (
        rule.ruleset_source_type !== "Repository" ||
        rule.ruleset_source !== repository ||
        !Number.isSafeInteger(rule.ruleset_id)
      )
        throw new GitHubFailure("rejected");
      ruleIds.add(Number(rule.ruleset_id));
    }
    if (!ruleIds.size || ruleIds.size > 10) throw new GitHubFailure("rejected");
    const enforced = new Set<string>();
    for (const id of ruleIds) {
      if (id <= 0) throw new GitHubFailure("rejected");
      const ruleset = await this.readObject(`/rulesets/${id}`);
      const refs = object(object(ruleset.conditions).ref_name);
      if (
        ruleset.id !== id ||
        ruleset.enforcement !== "active" ||
        ruleset.target !== "branch" ||
        !Array.isArray(ruleset.bypass_actors) ||
        ruleset.bypass_actors.length ||
        !Array.isArray(refs.exclude) ||
        refs.exclude.length ||
        !Array.isArray(refs.include) ||
        !refs.include.some((ref) =>
          ["refs/heads/main", "~DEFAULT_BRANCH", "~ALL"].includes(String(ref)),
        ) ||
        !Array.isArray(ruleset.rules)
      )
        throw new GitHubFailure("rejected");
      for (const raw of ruleset.rules) {
        const rule = object(raw);
        if (rule.type === "pull_request") {
          const parameters = object(rule.parameters);
          if (
            parameters.required_review_thread_resolution !== true ||
            !Array.isArray(parameters.allowed_merge_methods) ||
            !parameters.allowed_merge_methods.includes("squash")
          )
            throw new GitHubFailure("rejected");
        }
        if (typeof rule.type === "string") enforced.add(rule.type);
      }
    }
    if (
      !["pull_request", "deletion", "non_fast_forward"].every((type) =>
        enforced.has(type),
      )
    )
      throw new GitHubFailure("rejected");
    return required;
  }

  async readRequiredChecks(
    commit: string,
    required: RequiredCheck[],
  ): Promise<PublicationChecks> {
    if (!hash.test(commit) || !required.length)
      throw new GitHubFailure("rejected");
    const response = await this.readObject(
      `/commits/${commit}/check-runs?filter=latest&per_page=100`,
    );
    if (
      !Array.isArray(response.check_runs) ||
      !Number.isSafeInteger(response.total_count) ||
      response.total_count !== response.check_runs.length
    )
      throw new GitHubFailure("invalid_response");
    const pending: string[] = [],
      failed: string[] = [];
    const runs = response.check_runs.map(object);
    for (const rule of required) {
      if (!rule.context || !Number.isSafeInteger(rule.appId) || rule.appId <= 0)
        throw new GitHubFailure("rejected");
      const candidates = runs.filter(
        (run) => run.name === rule.context && object(run.app).id === rule.appId,
      );
      if (!candidates.length) {
        pending.push(rule.context);
        continue;
      }
      for (const run of candidates) {
        if (
          run.head_sha !== commit ||
          !Number.isSafeInteger(run.id) ||
          Number(run.id) <= 0
        )
          throw new GitHubFailure("invalid_response");
      }
      // Reruns replace earlier attempts for the same check identity. A newer
      // failure/in-progress attempt must never inherit an older green result.
      const latest = candidates.reduce((a, b) =>
        Number(a.id) > Number(b.id) ? a : b,
      );
      if (latest.status !== "completed") {
        if (
          ![
            "queued",
            "in_progress",
            "waiting",
            "pending",
            "requested",
          ].includes(String(latest.status))
        )
          throw new GitHubFailure("invalid_response");
        pending.push(rule.context);
      } else if (latest.conclusion !== "success") failed.push(rule.context);
    }
    return {
      state: failed.length ? "failed" : pending.length ? "pending" : "passed",
      pending,
      failed,
    };
  }

  /** Resolve main once, then follow immutable object IDs. A later main update
   * cannot mix a new file version with an older parent/tree. No writes occur.
   */
  async readBase(
    record: EditorialRecord,
    pinnedHead?: string,
  ): Promise<GitBase> {
    const path = editorialRecordPath(record);
    let head = pinnedHead;
    if (head === undefined) {
      const ref = await this.readObject("/git/ref/heads/main");
      const target = object(ref.object);
      if (
        ref.ref !== "refs/heads/main" ||
        target.type !== "commit" ||
        typeof target.sha !== "string"
      )
        throw new GitHubFailure("invalid_response");
      head = target.sha;
    }
    if (!hash.test(head)) throw new GitHubFailure("rejected");
    const commit = await this.readObject(`/git/commits/${head}`);
    const tree = object(commit.tree).sha;
    if (commit.sha !== head || typeof tree !== "string" || !hash.test(tree))
      throw new GitHubFailure("invalid_response");
    let currentTree = tree;
    const segments = path.split("/");
    for (let i = 0; i < segments.length; i++) {
      // Non-recursive traversal avoids truncated full-repository inventories.
      const listing = await this.readObject(`/git/trees/${currentTree}`);
      if (
        listing.sha !== currentTree ||
        listing.truncated !== false ||
        !Array.isArray(listing.tree)
      )
        throw new GitHubFailure("invalid_response");
      const matches = listing.tree
        .map(object)
        .filter((entry) => entry.path === segments[i]);
      if (matches.length > 1) throw new GitHubFailure("invalid_response");
      const entry = matches[0];
      if (!entry) return { head, tree, file: null };
      if (
        typeof entry.sha !== "string" ||
        !hash.test(entry.sha) ||
        typeof entry.mode !== "string" ||
        typeof entry.type !== "string"
      )
        throw new GitHubFailure("invalid_response");
      if (i === segments.length - 1)
        return {
          head,
          tree,
          file: { path, sha: entry.sha, mode: entry.mode, type: entry.type },
        };
      if (entry.type !== "tree" || entry.mode !== "040000")
        throw new GitHubFailure("rejected");
      currentTree = entry.sha;
    }
    throw new GitHubFailure("invalid_response");
  }

  async readContentInventory(
    head: string,
  ): Promise<{ head: string; tree: string; files: GitContentFile[] }> {
    if (!hash.test(head)) throw new GitHubFailure("rejected");
    const commit = await this.readObject(`/git/commits/${head}`);
    const tree = object(commit.tree).sha;
    if (commit.sha !== head || typeof tree !== "string" || !hash.test(tree))
      throw new GitHubFailure("invalid_response");
    const listing = await this.readObject(`/git/trees/${tree}?recursive=1`);
    if (
      listing.sha !== tree ||
      listing.truncated !== false ||
      !Array.isArray(listing.tree)
    )
      throw new GitHubFailure("invalid_response");
    const files: GitContentFile[] = [];
    const seen = new Set<string>();
    for (const raw of listing.tree) {
      const entry = object(raw);
      if (typeof entry.path !== "string")
        throw new GitHubFailure("invalid_response");
      if (!entry.path.startsWith("content/public/")) continue;
      if (seen.has(entry.path)) throw new GitHubFailure("invalid_response");
      seen.add(entry.path);
      if (entry.type === "tree" && entry.mode === "040000") continue;
      // Explicit retained source, with no active public route or editorial identity.
      if (entry.path === "content/public/pages/newsletter_archive.md") continue;
      const match =
        /^content\/public\/(pages|projects|writing)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/.exec(
          entry.path,
        );
      if (
        !match ||
        entry.type !== "blob" ||
        entry.mode !== "100644" ||
        typeof entry.sha !== "string" ||
        !hash.test(entry.sha) ||
        !Number.isSafeInteger(entry.size) ||
        Number(entry.size) > MAX_SOURCE_BYTES ||
        Number(entry.size) < 0
      )
        throw new GitHubFailure("rejected");
      const parsed = editorialRecordSchema.safeParse({
        kind:
          match[1] === "pages"
            ? "page"
            : match[1] === "projects"
              ? "work"
              : "writing",
        id: match[2],
      });
      if (!parsed.success || editorialRecordPath(parsed.data) !== entry.path)
        throw new GitHubFailure("rejected");
      files.push({ record: parsed.data, path: entry.path, sha: entry.sha });
    }
    if (files.length > 1000) throw new GitHubFailure("rejected");
    return { head, tree, files };
  }

  /** Blob bytes are checked against the pinned inventory before UTF-8 decoding.
   * No provider download_url or redirect is followed.
   */
  async readContentSource(file: GitContentFile): Promise<string> {
    if (editorialRecordPath(file.record) !== file.path || !hash.test(file.sha))
      throw new GitHubFailure("rejected");
    const blob = await this.readObject(`/git/blobs/${file.sha}`);
    if (
      blob.sha !== file.sha ||
      blob.encoding !== "base64" ||
      typeof blob.content !== "string" ||
      !Number.isSafeInteger(blob.size) ||
      Number(blob.size) < 0 ||
      Number(blob.size) > MAX_SOURCE_BYTES
    )
      throw new GitHubFailure("invalid_response");
    const encoded = blob.content.replace(/[\r\n]/g, "");
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    )
      throw new GitHubFailure("invalid_response");
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const gitObject = new Uint8Array(prefix.length + bytes.length);
    gitObject.set(prefix);
    gitObject.set(bytes, prefix.length);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-1", gitObject)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (
      bytes.length !== blob.size ||
      bytes.length > MAX_SOURCE_BYTES ||
      digest !== file.sha
    )
      throw new GitHubFailure("invalid_response");
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      throw new GitHubFailure("invalid_response");
    }
  }

  private parsePR(value: unknown, id: string, commit: string): PublicationPR {
    const pr = object(value);
    const head = object(pr.head);
    const base = object(pr.base);
    if (
      !Number.isSafeInteger(pr.number) ||
      Number(pr.number) < 1 ||
      typeof pr.node_id !== "string" ||
      head.ref !== this.branch(id) ||
      head.sha !== commit ||
      object(head.repo).full_name !== repository ||
      base.ref !== "main" ||
      object(base.repo).full_name !== repository ||
      pr.draft !== false ||
      (pr.state !== "open" && pr.state !== "closed") ||
      typeof pr.body !== "string" ||
      !pr.body.split("\n").includes(`Editorial-Publication: ${id}`) ||
      pr.html_url !== `https://github.com/${repository}/pull/${pr.number}`
    )
      throw new GitHubFailure("invalid_response");
    return {
      number: Number(pr.number),
      nodeId: pr.node_id,
      url: String(pr.html_url),
      state: pr.state,
      merged: typeof pr.merged_at === "string",
      head: commit,
    };
  }

  private async existingPR(
    id: string,
    commit: string,
  ): Promise<PublicationPR | null> {
    const params = new URLSearchParams({
      state: "all",
      head: `anipotts:${this.branch(id)}`,
      base: "main",
      per_page: "2",
    });
    const response = await this.request(`/pulls?${params}`);
    if (!response.ok) throw new GitHubFailure("rejected");
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GitHubFailure("invalid_response");
    }
    if (
      !Array.isArray(value) ||
      value.length > 1 ||
      response.headers.get("Link")?.includes('rel="next"')
    )
      throw new GitHubFailure("invalid_response");
    return value.length === 0 ? null : this.parsePR(value[0], id, commit);
  }

  /** Observe a recorded PR without creating or reopening anything. GitHub's
   * merge_commit_sha can be a speculative test merge while open, so it is only
   * usable after the explicit merged flag and closed state agree. */
  async readPullRequest(
    id: string,
    commit: string,
    number: number,
    nodeId: string,
  ): Promise<PublicationPR & { mergeCommit: string | null }> {
    this.branch(id);
    if (
      !hash.test(commit) ||
      !Number.isSafeInteger(number) ||
      number < 1 ||
      !nodeId
    )
      throw new GitHubFailure("rejected");
    const value = await this.readObject(`/pulls/${number}`);
    const pr = this.parsePR(value, id, commit);
    if (
      pr.number !== number ||
      pr.nodeId !== nodeId ||
      typeof value.merged !== "boolean" ||
      value.merged !== pr.merged ||
      (pr.merged &&
        (pr.state !== "closed" ||
          typeof value.merge_commit_sha !== "string" ||
          !hash.test(value.merge_commit_sha)))
    )
      throw new GitHubFailure("invalid_response");
    return {
      ...pr,
      mergeCommit: pr.merged ? String(value.merge_commit_sha) : null,
    };
  }

  /** Closing is reconciled after a lost response. A racing merge must finish
   * deployment verification; it cannot be represented as a stopped publication. */
  async stopPublication(
    id: string,
    commit: string,
  ): Promise<{ mergeCommit: string | null }> {
    const existing = await this.existingPR(id, commit);
    if (!existing) return { mergeCommit: null };
    let pr = await this.readPullRequest(
      id,
      commit,
      existing.number,
      existing.nodeId,
    );
    if (pr.state === "open") {
      const response = await this.request(`/pulls/${pr.number}`, "PATCH", {
        state: "closed",
      });
      if (!response.ok) throw new GitHubFailure("rejected");
      pr = await this.readPullRequest(
        id,
        commit,
        existing.number,
        existing.nodeId,
      );
    }
    if (pr.state !== "closed") throw new GitHubFailure("unavailable");
    return { mergeCommit: pr.mergeCommit };
  }

  /** Reconcile all PR states before creation: a closed publication is never silently reopened.
   * The durable job must serialize calls. Creation is public disclosure, not autosave.
   */
  async ensurePullRequest(id: string, commit: string): Promise<PublicationPR> {
    this.branch(id);
    if (!hash.test(commit)) throw new GitHubFailure("rejected");
    const existing = await this.existingPR(id, commit);
    if (existing) return existing;
    if ((await this.branchHead(id)) !== commit)
      throw new GitHubFailure("unexpected_branch");
    const response = await this.request("/pulls", "POST", {
      title: "content: publish editorial revision",
      head: this.branch(id),
      base: "main",
      draft: false,
      maintainer_can_modify: false,
      body: `Editorial-Publication: ${id}\n\nPublishes the owner-authorized content snapshot through required checks.`,
    });
    if (response.status !== 201 && response.status !== 422)
      throw new GitHubFailure("rejected");
    const observed = await this.existingPR(id, commit);
    if (!observed) throw new GitHubFailure("unavailable");
    return observed;
  }

  private async returnedSha(response: Response): Promise<string> {
    if (!response.ok) throw new GitHubFailure("rejected");
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GitHubFailure("invalid_response");
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("sha" in value) ||
      typeof value.sha !== "string" ||
      !hash.test(value.sha)
    )
      throw new GitHubFailure("invalid_response");
    return value.sha;
  }

  /** Call only after full snapshot validation, release readiness and owner consent.
   * Git objects disclose source even before a branch or PR exists.
   * Fixed parent, tree, message and timestamp make an ambiguous retry identical.
   */
  async createCommit(publication: Publication, base: GitBase): Promise<string> {
    this.branch(publication.id);
    if (
      !Number.isSafeInteger(publication.createdAt) ||
      publication.createdAt <= 0
    )
      throw new GitHubFailure("rejected");
    const plan = preparePublication(publication, base);
    if (!plan.ok) throw new GitHubFailure("rejected");
    if (!this.signPublication) throw new GitHubFailure("unauthorized");
    let manifest: string;
    try {
      manifest = await this.signPublication(publication, base.head);
      if (
        typeof manifest !== "string" ||
        manifest.length > 32_768 ||
        !manifest.length
      )
        throw new Error();
    } catch {
      throw new GitHubFailure("unauthorized");
    }
    const tree = await this.returnedSha(
      await this.request("/git/trees", "POST", {
        base_tree: plan.baseTree,
        tree: [
          plan.file,
          {
            path: "content/publication.json",
            mode: "100644",
            type: "blob",
            content: manifest,
          },
        ],
      }),
    );
    const identity = {
      name: "Ani Potts",
      email: "hello@anipotts.com",
      date: new Date(publication.createdAt).toISOString(),
    };
    return this.returnedSha(
      await this.request("/git/commits", "POST", {
        message: `content: update ${publication.record.id}\n\nEditorial-Publication: ${publication.id}\nEditorial-Revision: ${publication.revision}`,
        tree,
        parents: [plan.parent],
        author: identity,
        committer: identity,
      }),
    );
  }

  async branchHead(id: string): Promise<string | null> {
    const branch = this.branch(id);
    const response = await this.request(`/git/ref/heads/${branch}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new GitHubFailure("rejected");
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GitHubFailure("invalid_response");
    }
    const ref = object(value);
    const target = object(ref.object);
    if (
      ref.ref !== `refs/heads/${branch}` ||
      target.type !== "commit" ||
      typeof target.sha !== "string" ||
      !hash.test(target.sha)
    )
      throw new GitHubFailure("invalid_response");
    return target.sha;
  }

  /** A lost create response is reconciled by reading the exact deterministic ref.
   * An existing different head is never updated or force-pushed.
   */
  async ensureBranch(id: string, commit: string): Promise<void> {
    const branch = this.branch(id);
    if (!hash.test(commit)) throw new GitHubFailure("rejected");
    const existing = await this.branchHead(id);
    if (existing !== null) {
      if (existing !== commit) throw new GitHubFailure("unexpected_branch");
      return;
    }
    const response = await this.request("/git/refs", "POST", {
      ref: `refs/heads/${branch}`,
      sha: commit,
    });
    if (![201, 409, 422].includes(response.status))
      throw new GitHubFailure("rejected");
    const observed = await this.branchHead(id);
    if (observed === null) throw new GitHubFailure("unavailable");
    if (observed !== commit) throw new GitHubFailure("unexpected_branch");
  }
}
