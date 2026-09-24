/**
 * GET /health for api.anipotts.com: one bounded fact per plane.
 *
 * Every plane is read, never assumed. The body carries counts, times and
 * state names only: no link url or title, no commit sha or subject, and no
 * binding or secret value. `ok` is true only while the links store answers
 * and a commit producer has reached CodeStats inside its budget. The control
 * plane never sets `ok`; its state says whether the connect route could accept
 * any handshake at all.
 */

/**
 * The Mini publisher posts only when a scanned repo has a new commit, so the
 * budget allows a quiet week. `none_in_budget` means no commit arrived in that
 * window; it cannot tell a quiet week from a stopped publisher.
 */
export const COMMITS_BUDGET_S = 7 * 24 * 60 * 60;

/** Each Durable Object read gets this long before its plane reads unreadable. */
export const PLANE_READ_TIMEOUT_MS = 2_500;

export type LinksPlane =
  | { state: "readable"; held: number; last_saved_at: string | null }
  | { state: "unreadable"; held: null; last_saved_at: null };

export type CommitsState =
  /** A producer reached CodeStats inside the budget. */
  | "receiving"
  /** The last receipt is older than the budget. */
  | "none_in_budget"
  /** Nothing is held and no receipt was ever recorded. */
  | "never_received"
  /** Commits are held, but they arrived before receipts were recorded. */
  | "unrecorded"
  | "unreadable";

export type CommitsPlane = {
  state: CommitsState;
  held: number | null;
  last_received_at: string | null;
  freshness_budget_s: number;
};

export type ControlPlane = {
  /**
   * disabled: no device key is configured, so every connect returns 401.
   * configured: a key is set. Whether any device connects is not measured here.
   */
  state: "disabled" | "configured";
};

export type StateHealth = {
  service: "anipotts-state";
  ok: boolean;
  planes: {
    links: LinksPlane;
    commits: CommitsPlane;
    control: ControlPlane;
  };
  ts: string;
};

export type StateHealthInput = {
  /** Thunks, so a missing binding fails inside the read and not the route. */
  links: () => DurableObjectStub;
  commits: () => DurableObjectStub;
  /** Presence only; the key itself never reaches this module. */
  controlConfigured: boolean;
  timeoutMs?: number;
};

type Summary = Record<string, unknown>;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("plane read timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function readSummary(
  stub: () => DurableObjectStub,
  ms: number,
): Promise<Summary | null> {
  try {
    const body = await withTimeout(
      (async () => {
        const response = await stub().fetch("https://internal/summary");
        if (!response.ok) return null;
        return (await response.json()) as unknown;
      })(),
      ms,
    );
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Summary)
      : null;
  } catch {
    return null;
  }
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** null stays null; anything else must parse, or the plane reads unreadable. */
function time(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 64) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

const UNREADABLE_LINKS: LinksPlane = {
  state: "unreadable",
  held: null,
  last_saved_at: null,
};

export function judgeLinks(summary: Summary | null): LinksPlane {
  if (!summary) return UNREADABLE_LINKS;
  const held = count(summary.held);
  const last = time(summary.last_saved_at);
  if (held === null || last === undefined) return UNREADABLE_LINKS;
  return { state: "readable", held, last_saved_at: last };
}

export function judgeCommits(
  summary: Summary | null,
  nowMs: number,
): CommitsPlane {
  const unreadable: CommitsPlane = {
    state: "unreadable",
    held: null,
    last_received_at: null,
    freshness_budget_s: COMMITS_BUDGET_S,
  };
  if (!summary) return unreadable;
  const held = count(summary.held);
  const last = time(summary.last_received_at);
  if (held === null || last === undefined) return unreadable;
  const state: CommitsState =
    last === null
      ? held === 0
        ? "never_received"
        : "unrecorded"
      : nowMs - Date.parse(last) <= COMMITS_BUDGET_S * 1000
        ? "receiving"
        : "none_in_budget";
  return {
    state,
    held,
    last_received_at: last,
    freshness_budget_s: COMMITS_BUDGET_S,
  };
}

export async function stateHealth(
  input: StateHealthInput,
  nowMs: number,
): Promise<StateHealth> {
  const ms = input.timeoutMs ?? PLANE_READ_TIMEOUT_MS;
  const [linksSummary, commitsSummary] = await Promise.all([
    readSummary(input.links, ms),
    readSummary(input.commits, ms),
  ]);
  const links = judgeLinks(linksSummary);
  const commits = judgeCommits(commitsSummary, nowMs);
  const control: ControlPlane = {
    state: input.controlConfigured ? "configured" : "disabled",
  };
  return {
    service: "anipotts-state",
    ok: links.state === "readable" && commits.state === "receiving",
    planes: { links, commits, control },
    ts: new Date(nowMs).toISOString(),
  };
}
