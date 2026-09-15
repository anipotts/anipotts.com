import type { AdminInboxItem, AdminInboxReadState } from "./inbox";
import type {
  OperatorTaskState,
  OperatorWorkProjection,
} from "./operator-work";
import {
  buildOperatorTaskSemanticReferences,
  defineKnownReference,
  inspectorDestination,
  internalDestination,
  semanticReferenceId,
  type SemanticReference,
} from "./semantic-reference";

export const OPERATIONAL_PROJECTIONS = [
  "ready",
  "running",
  "waiting",
  "blocked",
  "needs-ani",
  "recently-completed",
] as const;

export type OperationalProjection = (typeof OPERATIONAL_PROJECTIONS)[number];
export type ActivationGraphLayer =
  "world" | "obligation" | "execution" | "trajectory";

export type ActivationLane = {
  key: OperationalProjection;
  label: string;
  count: number;
  href: string;
  basis: string;
  source_state: "current" | "stale" | "partial";
  reference: SemanticReference<"route">;
};

export type ActivationGraphNode = {
  id: string;
  layer: ActivationGraphLayer;
  label: string;
  title: string;
  detail: string;
  reference: SemanticReference;
  source_reference: SemanticReference;
};

export type ActivationGraphConnection = {
  from: string;
  to: string;
  relation: "projects" | "assigned_to" | "owes_verification";
};

export type ActivationGraphProjection = {
  generated_at: string;
  mode: "ready" | "partial";
  work_source_state: "current" | "stale";
  work_last_verified_at: string;
  foreground: AdminInboxItem | null;
  foreground_reference: SemanticReference | null;
  foreground_reason: string;
  lanes: ActivationLane[];
  sources: SemanticReference<"source">[];
  nodes: ActivationGraphNode[];
  connections: ActivationGraphConnection[];
};

export function buildActivationGraph(
  inbox: AdminInboxReadState,
  work: OperatorWorkProjection,
  now = new Date(),
): ActivationGraphProjection {
  const foreground = inbox.items[0] ?? null;
  const linkedTask = foreground
    ? findLinkedTask(work.task_states, foreground)
    : undefined;
  const workSourceState = isWorkProjectionCurrent(work, now)
    ? "current"
    : "stale";

  return {
    generated_at: inbox.generated_at,
    mode: inbox.mode,
    work_source_state: workSourceState,
    work_last_verified_at: work.generated_at,
    foreground,
    foreground_reference: foreground?.references.entity ?? null,
    foreground_reason: foreground
      ? `${foreground.risk} priority, ${foreground.timeframe}. ${foreground.next_action}`
      : "No current attention item is available from the connected sources.",
    lanes: buildActivationLanes(
      inbox.items,
      work.task_states,
      inbox.source,
      workSourceState,
      inbox.generated_at,
    ),
    sources: [inbox.source, buildWorkSourceReference(work, workSourceState)],
    nodes: foreground ? buildGraphNodes(foreground, linkedTask) : [],
    connections: foreground
      ? [
          {
            from: `world:${foreground.entity_id}`,
            to: `obligation:${foreground.id}`,
            relation: "projects",
          },
          {
            from: `obligation:${foreground.id}`,
            to: `execution:${linkedTask?.task_id ?? foreground.owner}`,
            relation: "assigned_to",
          },
          {
            from: `execution:${linkedTask?.task_id ?? foreground.owner}`,
            to: `trajectory:${foreground.id}`,
            relation: "owes_verification",
          },
        ]
      : [],
  };
}

export function itemMatchesOperationalProjection(
  item: AdminInboxItem,
  projection: OperationalProjection,
): boolean {
  if (projection === "blocked") return isBlocked(item);
  if (projection === "waiting") return isWaiting(item);
  if (projection === "needs-ani") return needsAni(item);
  if (projection === "ready") {
    return !isBlocked(item) && !isWaiting(item) && !needsAni(item);
  }
  return false;
}

function buildActivationLanes(
  items: AdminInboxItem[],
  tasks: OperatorTaskState[],
  inboxSource: SemanticReference<"source">,
  workSourceState: "current" | "stale",
  checkedAt: string,
): ActivationLane[] {
  const inboxSourceState: ActivationLane["source_state"] =
    inboxSource.source_state === "verified"
      ? "current"
      : inboxSource.source_state === "unknown"
        ? "partial"
        : "stale";
  const workLaneSourceState = workSourceState;

  return [
    {
      key: "ready",
      label: "ready",
      count: items.filter((item) =>
        itemMatchesOperationalProjection(item, "ready"),
      ).length,
      href: "/?view=ready",
      basis:
        "actionable without a waiting, blocking, or personal-authority signal",
      source_state: inboxSourceState,
      reference: activationLaneReference("ready", "/?view=ready", checkedAt),
    },
    {
      key: "running",
      label: "running",
      count: tasks.filter(
        (task) =>
          task.lifecycle === "open" &&
          (task.operator_state === "working" ||
            task.operator_state === "review"),
      ).length,
      href: "/work?view=now",
      basis: "operator work projection",
      source_state: workLaneSourceState,
      reference: activationLaneReference(
        "running",
        "/work?view=now",
        checkedAt,
      ),
    },
    {
      key: "waiting",
      label: "waiting",
      count:
        items.filter((item) =>
          itemMatchesOperationalProjection(item, "waiting"),
        ).length +
        tasks.filter(
          (task) =>
            task.lifecycle === "open" && task.operator_state === "waiting",
        ).length,
      href: "/?view=waiting",
      basis: "time, response, or another condition must change",
      source_state: combineProjectionSourceStates(
        workLaneSourceState,
        inboxSourceState,
      ),
      reference: activationLaneReference(
        "waiting",
        "/?view=waiting",
        checkedAt,
      ),
    },
    {
      key: "blocked",
      label: "blocked",
      count:
        items.filter((item) =>
          itemMatchesOperationalProjection(item, "blocked"),
        ).length +
        tasks.filter(
          (task) =>
            task.lifecycle === "open" && task.operator_state === "blocked",
        ).length,
      href: "/?view=blocked",
      basis: "an actionable constraint or resolver is identified",
      source_state: combineProjectionSourceStates(
        workLaneSourceState,
        inboxSourceState,
      ),
      reference: activationLaneReference(
        "blocked",
        "/?view=blocked",
        checkedAt,
      ),
    },
    {
      key: "needs-ani",
      label: "needs ani",
      count: items.filter((item) =>
        itemMatchesOperationalProjection(item, "needs-ani"),
      ).length,
      href: "/?view=needs-ani",
      basis: "Ani's authority, decision, or presence is explicitly signaled",
      source_state: inboxSourceState,
      reference: activationLaneReference(
        "needs-ani",
        "/?view=needs-ani",
        checkedAt,
      ),
    },
    {
      key: "recently-completed",
      label: "recently completed",
      count: tasks.filter(
        (task) =>
          task.lifecycle === "completed" || task.operator_state === "completed",
      ).length,
      href: "/work?view=history",
      basis: "operator work projection",
      source_state: workLaneSourceState,
      reference: activationLaneReference(
        "recently-completed",
        "/work?view=history",
        checkedAt,
      ),
    },
  ];
}

function combineProjectionSourceStates(
  left: ActivationLane["source_state"],
  right: ActivationLane["source_state"],
): ActivationLane["source_state"] {
  if (left === "partial" || right === "partial") return "partial";
  if (left === "stale" || right === "stale") return "stale";
  return "current";
}

function buildGraphNodes(
  item: AdminInboxItem,
  linkedTask?: OperatorTaskState,
): ActivationGraphNode[] {
  const taskReferences = linkedTask
    ? buildOperatorTaskSemanticReferences(linkedTask, "stale")
    : null;
  return [
    {
      id: `world:${item.entity_id}`,
      layer: "world",
      label: "entity",
      title: item.title,
      detail: item.summary,
      reference: item.references.entity,
      source_reference: item.references.source,
    },
    {
      id: `obligation:${item.id}`,
      layer: "obligation",
      label: item.timeframe,
      title: item.next_action,
      detail: `${item.status}, ${item.risk} priority`,
      reference: item.references.deadline ?? item.references.action,
      source_reference: item.references.deadline ?? item.references.source_time,
    },
    {
      id: `execution:${linkedTask?.task_id ?? item.owner}`,
      layer: "execution",
      label: linkedTask ? linkedTask.operator_state : item.action_kind,
      title: linkedTask?.canonical_title ?? item.owner,
      detail:
        linkedTask?.bounded_goal ??
        `Resolver recorded as ${item.owner}; required-party detail is not yet modeled.`,
      reference: taskReferences?.task ?? item.references.owner,
      source_reference: taskReferences?.source_time ?? item.references.source,
    },
    {
      id: `trajectory:${item.id}`,
      layer: "trajectory",
      label: "verification",
      title: linkedTask?.proof_owed ?? "Proof pointer retained",
      detail: `Trajectory is not normalized yet. Evidence pointer: ${item.proof}`,
      reference: taskReferences?.proof ?? item.references.proof,
      source_reference: taskReferences?.proof ?? item.references.proof,
    },
  ];
}

function findLinkedTask(
  tasks: OperatorTaskState[],
  item: AdminInboxItem,
): OperatorTaskState | undefined {
  return tasks.find(
    (task) =>
      task.attention_ref === item.id ||
      task.primary_entity_ref === item.entity_id ||
      task.entity_refs.includes(item.entity_id),
  );
}

function isBlocked(item: AdminInboxItem): boolean {
  return item.status.toLowerCase().includes("blocked");
}

function isWaiting(item: AdminInboxItem): boolean {
  return (
    item.timeframe.toLowerCase().includes("waiting") ||
    item.status.toLowerCase().includes("waiting")
  );
}

function needsAni(item: AdminInboxItem): boolean {
  const status = item.status.toLowerCase().replaceAll("_", " ");
  const owner = item.owner.toLowerCase();
  return (
    item.action_kind === "approve" ||
    item.action_kind === "decide" ||
    owner === "ani" ||
    owner === "anirudh" ||
    status.includes("needs ani")
  );
}

function isWorkProjectionCurrent(
  work: OperatorWorkProjection,
  now: Date,
): boolean {
  if (work.mode !== "live") return false;
  const generatedAt = Date.parse(work.generated_at);
  if (!Number.isFinite(generatedAt)) return false;
  const ageSeconds = (now.getTime() - generatedAt) / 1000;
  return (
    ageSeconds >= 0 && ageSeconds <= work.freshness_policy.fresh_for_seconds
  );
}

function activationLaneReference(
  lane: OperationalProjection,
  href: string,
  checkedAt: string,
): SemanticReference<"route"> {
  return defineKnownReference({
    id: semanticReferenceId("activation-lane", lane),
    kind: "route",
    label: `${lane.replaceAll("-", " ")} projection`,
    value: href,
    summary: "This route opens a derived operational projection.",
    source_state: "verified",
    checked_at: checkedAt,
    authority: { kind: "internal", label: "admin route registry" },
    provenance: {
      source: "activation_graph",
      source_ref: `operational-projection:${lane}`,
      method: "projection",
      evidence_refs: [],
    },
    confidence: {
      level: "high",
      explanation: "The typed activation projection supplied this route.",
    },
    sensitivity: "internal",
    validity: { valid_from: checkedAt, valid_until: null },
    retrieval_policy: {
      mode: "open_internal",
      refresh_href: null,
      explanation: "Open the declared overlapping operational projection.",
    },
    destination: internalDestination(href, "open operational projection"),
  });
}

function buildWorkSourceReference(
  work: OperatorWorkProjection,
  state: "current" | "stale",
): SemanticReference<"source"> {
  const disconnected = work.mode === "disconnected";
  const fixture = work.mode === "tracked_fixture";
  return defineKnownReference({
    id: "operator-work:source",
    kind: "source",
    label: "work source",
    value: disconnected
      ? "work source disconnected"
      : fixture
        ? "tracked operator work fixture"
        : "connected operator work projection",
    summary: disconnected
      ? "No current operator work source is connected. No fixture activity was substituted."
      : fixture
        ? "The operator work projection is a retained fixture and cannot establish live activity."
        : "The operator work projection comes from the connected read source.",
    source_state: state === "current" ? "verified" : "stale",
    checked_at: disconnected ? null : work.reconciled_at,
    authority: disconnected
      ? { kind: "none", label: "operator work source unavailable" }
      : { kind: "recorded", label: "operator work source" },
    provenance: {
      source: work.projection_id,
      source_ref: work.projection_id,
      method: fixture ? "fixture" : disconnected ? "inference" : "projection",
      evidence_refs: disconnected ? [] : [work.projection_id],
    },
    confidence: {
      level: disconnected ? "low" : fixture ? "medium" : "high",
      explanation: disconnected
        ? "No source-backed work projection is currently available."
        : fixture
          ? "The fixture preserves prior observations but does not prove current runtime state."
          : "The connected source supplied the current work projection.",
    },
    sensitivity: "internal",
    validity: { valid_from: work.generated_at, valid_until: null },
    retrieval_policy: {
      mode: "inspect",
      refresh_href: null,
      explanation: disconnected
        ? "Connect a governed work source before showing current activity."
        : "Inspect the source boundary and last reconciliation time.",
    },
    destination: inspectorDestination("inspect work source"),
  });
}
