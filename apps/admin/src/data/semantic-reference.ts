import type { OperatorTaskState } from "./operator-work";

export const SEMANTIC_REFERENCE_KINDS = [
  "calendar_event",
  "deadline",
  "date_range",
  "source_time",
  "recurrence",
  "person",
  "organization",
  "location",
  "source",
  "evidence",
  "proof",
  "repository",
  "commit",
  "task",
  "run",
  "graph_entity",
  "route",
] as const;

export type SemanticReferenceKind = (typeof SEMANTIC_REFERENCE_KINDS)[number];
export type SemanticSourceState =
  "verified" | "stale" | "unchecked" | "absent" | "unknown";
export type SemanticConfidence = "high" | "medium" | "low" | "unknown";
export type SemanticSensitivity =
  "public" | "internal" | "private" | "sensitive" | "restricted";
export type SemanticAuthorityKind =
  "provider" | "internal" | "recorded" | "none";
export type SemanticProvenanceMethod =
  "provider" | "projection" | "fixture" | "manual" | "inference";
export type SemanticProvider =
  "google_calendar" | "github" | "gmail" | "google_drive";

export type SemanticDestination =
  | {
      type: "provider";
      provider: SemanticProvider;
      href: string;
      label: string;
    }
  | {
      type: "internal";
      href: string;
      label: string;
    }
  | {
      type: "inspector";
      label: string;
    }
  | {
      type: "none";
      reason: string;
    };

export type SemanticRetrievalPolicy = {
  mode:
    | "open_provider"
    | "open_internal"
    | "inspect"
    | "refresh_then_inspect"
    | "none";
  refresh_href: string | null;
  explanation: string;
};

export type SemanticReferenceBase<K extends SemanticReferenceKind> = {
  id: string;
  kind: K;
  label: string;
  summary: string;
  authority: {
    kind: SemanticAuthorityKind;
    label: string;
  };
  provenance: {
    source: string;
    source_ref: string;
    method: SemanticProvenanceMethod;
    evidence_refs: string[];
  };
  confidence: {
    level: SemanticConfidence;
    explanation: string;
  };
  sensitivity: SemanticSensitivity;
  validity: {
    valid_from: string | null;
    valid_until: string | null;
  };
  retrieval_policy: SemanticRetrievalPolicy;
  destination: SemanticDestination;
};

export type KnownSemanticReference<K extends SemanticReferenceKind> =
  SemanticReferenceBase<K> &
    (
      | {
          source_state: "verified";
          value: string;
          checked_at: string;
        }
      | {
          source_state: "stale";
          value: string;
          checked_at: string | null;
        }
    );

export type MissingSemanticReference<K extends SemanticReferenceKind> =
  SemanticReferenceBase<K> & {
    source_state: "unchecked" | "absent" | "unknown";
    value: null;
    checked_at: string | null;
  };

export type SemanticReference<
  K extends SemanticReferenceKind = SemanticReferenceKind,
> = K extends SemanticReferenceKind
  ? KnownSemanticReference<K> | MissingSemanticReference<K>
  : never;

export type AnyKnownSemanticReference = {
  [K in SemanticReferenceKind]: KnownSemanticReference<K>;
}[SemanticReferenceKind];

export type SemanticReferenceRenderDescriptor = {
  element: "link" | "button" | "text";
  href: string | null;
  target: "_blank" | null;
  rel: "noreferrer" | null;
  interactive: boolean;
  action_label: string;
  state_label: string;
  authority_label: string;
  title: string;
  aria_label: string;
};

type KnownReferenceInput<K extends SemanticReferenceKind> =
  SemanticReferenceBase<K> & {
    source_state: "verified" | "stale";
    value: string;
    checked_at: string | null;
  };

type MissingReferenceInput<K extends SemanticReferenceKind> =
  MissingSemanticReference<K>;

const PROVIDER_HOSTS: Record<SemanticProvider, readonly string[]> = {
  google_calendar: ["calendar.google.com"],
  github: ["github.com"],
  gmail: ["mail.google.com"],
  google_drive: ["drive.google.com", "docs.google.com"],
};

export function defineKnownReference<K extends SemanticReferenceKind>(
  input: KnownReferenceInput<K>,
): KnownSemanticReference<K> {
  if (input.value.trim().length === 0) {
    throw new Error(`semantic reference ${input.id} needs a known value`);
  }
  if (input.source_state === "verified" && !isIsoTimestamp(input.checked_at)) {
    throw new Error(`semantic reference ${input.id} needs checked_at`);
  }
  if (input.checked_at !== null && !isIsoTimestamp(input.checked_at)) {
    throw new Error(`semantic reference ${input.id} has invalid checked_at`);
  }
  validateReference(input);
  return input as KnownSemanticReference<K>;
}

export function defineMissingReference<K extends SemanticReferenceKind>(
  input: MissingReferenceInput<K>,
): MissingSemanticReference<K> {
  if (input.source_state === "absent" && !isIsoTimestamp(input.checked_at)) {
    throw new Error(
      `semantic reference ${input.id} cannot claim absence without checked_at`,
    );
  }
  if (input.checked_at !== null && !isIsoTimestamp(input.checked_at)) {
    throw new Error(`semantic reference ${input.id} has invalid checked_at`);
  }
  validateReference(input);
  return input;
}

export function internalDestination(
  href: string,
  label: string,
): SemanticDestination {
  if (!isSafeInternalHref(href)) {
    throw new Error(`unsafe internal semantic destination: ${href}`);
  }
  return { type: "internal", href, label };
}

export function providerDestination(
  provider: SemanticProvider,
  href: string,
  label: string,
): SemanticDestination {
  if (!isSafeProviderHref(provider, href)) {
    throw new Error(`unsafe ${provider} semantic destination: ${href}`);
  }
  return { type: "provider", provider, href, label };
}

export function inspectorDestination(label = "inspect details") {
  return { type: "inspector", label } as const;
}

export function noDestination(reason: string) {
  return { type: "none", reason } as const;
}

export function internalRecordReference<
  K extends SemanticReferenceKind,
>(input: {
  id: string;
  kind: K;
  label: string;
  value: string | null;
  summary: string;
  source: string;
  source_ref: string;
  checked_at?: string | null;
  source_state?: "verified" | "stale" | "unchecked" | "absent" | "unknown";
  sensitivity?: SemanticSensitivity;
  confidence?: SemanticConfidence;
  evidence_refs?: string[];
}): SemanticReference<K> {
  const sourceState = input.source_state ?? "stale";
  const checkedAt = input.checked_at ?? null;
  const authority = { kind: "internal" as const, label: "admin source record" };
  const provenance = {
    source: input.source,
    source_ref: input.source_ref,
    method: "projection" as const,
    evidence_refs: input.evidence_refs ?? [],
  };
  const confidence = {
    level: input.confidence ?? (sourceState === "verified" ? "high" : "medium"),
    explanation:
      sourceState === "verified"
        ? "The current read-only source returned this record."
        : "This is the last recorded value and needs a fresh source observation.",
  };
  const common = {
    id: semanticReferenceId(input.id, input.kind),
    kind: input.kind,
    label: input.label,
    summary: input.summary,
    checked_at: checkedAt,
    authority,
    provenance,
    confidence,
    sensitivity: input.sensitivity ?? ("internal" as const),
    validity: { valid_from: checkedAt, valid_until: null },
    retrieval_policy: {
      mode: "inspect" as const,
      refresh_href: null,
      explanation:
        "Inspect the source state and evidence without leaving this page.",
    },
    destination: inspectorDestination("inspect details"),
  };

  if (
    input.value !== null &&
    (sourceState === "verified" || sourceState === "stale")
  ) {
    return defineKnownReference({
      ...common,
      value: input.value,
      source_state: sourceState,
    }) as SemanticReference<K>;
  }

  return defineMissingReference({
    ...common,
    value: null,
    source_state:
      sourceState === "verified" || sourceState === "stale"
        ? "unknown"
        : sourceState,
  }) as SemanticReference<K>;
}

export function renderSemanticReference(
  reference: SemanticReference,
): SemanticReferenceRenderDescriptor {
  const stateLabel = semanticStateLabel(reference.source_state);
  const valueLabel = reference.value ?? reference.label;
  const authorityLabel = reference.authority.label;
  const canOpenDestination = reference.source_state === "verified";

  if (
    canOpenDestination &&
    (reference.destination.type === "provider" ||
      reference.destination.type === "internal")
  ) {
    const isProvider = reference.destination.type === "provider";
    const actionLabel = reference.destination.label;
    return {
      element: "link",
      href: reference.destination.href,
      target: isProvider ? "_blank" : null,
      rel: isProvider ? "noreferrer" : null,
      interactive: true,
      action_label: actionLabel,
      state_label: stateLabel,
      authority_label: authorityLabel,
      title: `${actionLabel}. ${stateLabel}. ${authorityLabel}.`,
      aria_label: `${actionLabel} for ${valueLabel}. ${stateLabel}. ${authorityLabel}.`,
    };
  }

  if (reference.destination.type !== "none") {
    const actionLabel = actionLabelFor(reference);
    return {
      element: "button",
      href: null,
      target: null,
      rel: null,
      interactive: true,
      action_label: actionLabel,
      state_label: stateLabel,
      authority_label: authorityLabel,
      title: `${actionLabel}. ${stateLabel}. ${authorityLabel}.`,
      aria_label: `${actionLabel} for ${valueLabel}. ${stateLabel}. ${authorityLabel}.`,
    };
  }

  return {
    element: "text",
    href: null,
    target: null,
    rel: null,
    interactive: false,
    action_label: "unavailable",
    state_label: stateLabel,
    authority_label: authorityLabel,
    title: `${stateLabel}. ${reference.destination.reason}`,
    aria_label: `${reference.label}. ${stateLabel}. ${reference.destination.reason}`,
  };
}

export function googleCalendarEventReference(input: {
  id: string;
  label: string;
  value: string;
  canonical_href: string;
  source_ref: string;
  checked_at: string;
  valid_from?: string | null;
  valid_until?: string | null;
  sensitivity?: SemanticSensitivity;
}): SemanticReference<"calendar_event"> {
  return defineKnownReference({
    id: input.id,
    kind: "calendar_event",
    label: input.label,
    value: input.value,
    summary: "Google Calendar returned this canonical event.",
    source_state: "verified",
    checked_at: input.checked_at,
    authority: { kind: "provider", label: "Google Calendar authoritative" },
    provenance: {
      source: "google_calendar",
      source_ref: input.source_ref,
      method: "provider",
      evidence_refs: [input.source_ref],
    },
    confidence: {
      level: "high",
      explanation: "The provider returned the canonical event destination.",
    },
    sensitivity: input.sensitivity ?? "private",
    validity: {
      valid_from: input.valid_from ?? null,
      valid_until: input.valid_until ?? null,
    },
    retrieval_policy: {
      mode: "open_provider",
      refresh_href: null,
      explanation: "Open the canonical event without changing Calendar.",
    },
    destination: providerDestination(
      "google_calendar",
      input.canonical_href,
      "open canonical Google Calendar event",
    ),
  });
}

export function googleCalendarDeadlineReference(input: {
  id: string;
  label: string;
  value: string;
  canonical_href: string;
  source_ref: string;
  checked_at: string;
  sensitivity?: SemanticSensitivity;
}): SemanticReference<"deadline"> {
  return defineKnownReference({
    id: input.id,
    kind: "deadline",
    label: input.label,
    value: input.value,
    summary:
      "Google Calendar returned this deadline and its exact Calendar destination.",
    source_state: "verified",
    checked_at: input.checked_at,
    authority: { kind: "provider", label: "Google Calendar authoritative" },
    provenance: {
      source: "google_calendar",
      source_ref: input.source_ref,
      method: "provider",
      evidence_refs: [input.source_ref],
    },
    confidence: {
      level: "high",
      explanation: "The provider returned the deadline destination.",
    },
    sensitivity: input.sensitivity ?? "private",
    validity: { valid_from: null, valid_until: input.value },
    retrieval_policy: {
      mode: "open_provider",
      refresh_href: null,
      explanation: "Open the exact Calendar destination without changing it.",
    },
    destination: providerDestination(
      "google_calendar",
      input.canonical_href,
      "open exact Google Calendar deadline",
    ),
  });
}

export function inferredDeadlineReference(input: {
  id: string;
  label: string;
  value: string;
  source: string;
  source_ref: string;
  checked_at: string;
  confidence: Exclude<SemanticConfidence, "high" | "unknown">;
  explanation: string;
}): SemanticReference<"deadline"> {
  return defineKnownReference({
    id: input.id,
    kind: "deadline",
    label: input.label,
    value: input.value,
    summary: input.explanation,
    source_state: "verified",
    checked_at: input.checked_at,
    authority: { kind: "internal", label: "internal inference" },
    provenance: {
      source: input.source,
      source_ref: input.source_ref,
      method: "inference",
      evidence_refs: [input.source_ref],
    },
    confidence: {
      level: input.confidence,
      explanation: input.explanation,
    },
    sensitivity: "internal",
    validity: { valid_from: null, valid_until: input.value },
    retrieval_policy: {
      mode: "inspect",
      refresh_href: null,
      explanation:
        "Inspect provenance before treating this inferred date as authoritative.",
    },
    destination: inspectorDestination("inspect deadline provenance"),
  });
}

export type OperatorTaskSemanticReferences = {
  task: SemanticReference<"task">;
  owner: SemanticReference<"task">;
  repository: SemanticReference<"repository">;
  proof: SemanticReference<"proof">;
  source_time: SemanticReference<"source_time">;
};

export function buildOperatorTaskSemanticReferences(
  task: OperatorTaskState,
  sourceState: "verified" | "stale",
): OperatorTaskSemanticReferences {
  const method: SemanticProvenanceMethod =
    sourceState === "stale" ? "fixture" : "projection";
  const provenance = {
    source: task.source,
    source_ref: task.source_ref,
    method,
    evidence_refs: task.proof_refs,
  } as const;
  const authority = {
    kind: "internal" as const,
    label: "admin task projection",
  };
  const confidence = {
    level: sourceState === "stale" ? ("medium" as const) : ("high" as const),
    explanation:
      sourceState === "stale"
        ? "The task was verified previously, but its freshness window expired."
        : "The current task projection supplied this value.",
  };
  const checkedAt = task.reconciled_at;
  const common = {
    source_state: sourceState,
    checked_at: checkedAt,
    authority,
    provenance,
    confidence,
    sensitivity: "internal" as const,
    validity: { valid_from: task.last_observed_at, valid_until: null },
  };

  const repository = task.repo
    ? defineKnownReference({
        ...common,
        id: semanticReferenceId(task.task_id, "repository"),
        kind: "repository",
        label: "repository",
        value: task.repo,
        summary:
          "The operator projection records this repository. No provider URL was supplied.",
        retrieval_policy: {
          mode: "inspect",
          refresh_href: null,
          explanation:
            "Inspect the recorded repository identity without guessing a provider destination.",
        },
        destination: inspectorDestination("inspect repository provenance"),
      })
    : defineMissingReference({
        id: semanticReferenceId(task.task_id, "repository"),
        kind: "repository",
        label: "repository",
        value: null,
        summary: "The task projection was checked and has no repository value.",
        source_state: "absent",
        checked_at: checkedAt,
        authority,
        provenance,
        confidence,
        sensitivity: "internal",
        validity: { valid_from: null, valid_until: null },
        retrieval_policy: {
          mode: "inspect",
          refresh_href: null,
          explanation: "Inspect the checked absence in the task projection.",
        },
        destination: inspectorDestination("inspect repository source"),
      });

  const proof = task.proof_refs.length
    ? defineKnownReference({
        ...common,
        id: semanticReferenceId(task.task_id, "proof"),
        kind: "proof",
        label: "proof",
        value: task.proof_refs.join(", "),
        summary: task.proof_owed,
        retrieval_policy: {
          mode: "inspect",
          refresh_href: null,
          explanation: "Inspect proof pointers and their source state.",
        },
        destination: inspectorDestination("inspect proof"),
      })
    : defineMissingReference({
        id: semanticReferenceId(task.task_id, "proof"),
        kind: "proof",
        label: "proof",
        value: null,
        summary: "The task projection was checked and has no proof pointer.",
        source_state: "absent",
        checked_at: checkedAt,
        authority,
        provenance,
        confidence,
        sensitivity: "internal",
        validity: { valid_from: null, valid_until: null },
        retrieval_policy: {
          mode: "inspect",
          refresh_href: null,
          explanation: "Inspect the checked absence in the task projection.",
        },
        destination: inspectorDestination("inspect proof source"),
      });

  return {
    task: defineKnownReference({
      ...common,
      id: semanticReferenceId(task.task_id, "task"),
      kind: "task",
      label: "task",
      value: task.canonical_title,
      summary: task.bounded_goal,
      retrieval_policy: {
        mode: "open_internal",
        refresh_href: null,
        explanation: "Open the exact task in the internal Work projection.",
      },
      destination: internalDestination(
        `/work?view=now#task-${encodeURIComponent(task.task_id)}`,
        "open task in Work",
      ),
    }),
    owner: defineKnownReference({
      ...common,
      id: semanticReferenceId(task.task_id, "owner"),
      kind: "task",
      label: "owner",
      value: task.owner,
      summary: `Resolver recorded for ${task.canonical_title}.`,
      retrieval_policy: {
        mode: "inspect",
        refresh_href: null,
        explanation: "Inspect owner provenance and task authority.",
      },
      destination: inspectorDestination("inspect owner"),
    }),
    repository,
    proof,
    source_time: defineKnownReference({
      ...common,
      id: semanticReferenceId(task.task_id, "source-time"),
      kind: "source_time",
      label: "last verified",
      value: task.last_observed_at,
      summary: "This is the recorded task observation time.",
      retrieval_policy: {
        mode: "inspect",
        refresh_href: null,
        explanation: "Inspect observation and reconciliation times.",
      },
      destination: inspectorDestination("inspect source time"),
    }),
  };
}

export function semanticReferenceId(...parts: string[]): string {
  return parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function isKnownSemanticReference(
  reference: SemanticReference,
): reference is AnyKnownSemanticReference {
  return reference.value !== null;
}

export function semanticStateLabel(state: SemanticSourceState): string {
  switch (state) {
    case "verified":
      return "verified source";
    case "stale":
      return "last verified";
    case "unchecked":
      return "source not checked";
    case "absent":
      return "checked · no value found";
    case "unknown":
      return "unknown";
  }
}

export function isSafeInternalHref(href: string): boolean {
  return (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(href) &&
    !href.toLowerCase().includes("javascript:")
  );
}

export function isSafeProviderHref(
  provider: SemanticProvider,
  href: string,
): boolean {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return false;
    if (!PROVIDER_HOSTS[provider].includes(url.hostname)) return false;
    if (
      provider === "google_calendar" &&
      !url.pathname.startsWith("/calendar/")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validateReference(reference: SemanticReferenceBase<any>): void {
  if (!/^[a-z0-9][a-z0-9:_-]*$/.test(reference.id)) {
    throw new Error(`invalid semantic reference id: ${reference.id}`);
  }
  if (reference.provenance.source_ref.trim().length === 0) {
    throw new Error(`semantic reference ${reference.id} needs a source_ref`);
  }
  if (
    reference.retrieval_policy.refresh_href !== null &&
    !isSafeInternalHref(reference.retrieval_policy.refresh_href)
  ) {
    throw new Error(
      `semantic reference ${reference.id} has unsafe refresh destination`,
    );
  }
  if (reference.destination.type === "internal") {
    internalDestination(
      reference.destination.href,
      reference.destination.label,
    );
  }
  if (reference.destination.type === "provider") {
    providerDestination(
      reference.destination.provider,
      reference.destination.href,
      reference.destination.label,
    );
  }
}

function actionLabelFor(reference: SemanticReference): string {
  if (reference.source_state === "unchecked") return "refresh or inspect";
  if (reference.source_state === "stale") return "inspect last verified value";
  if (reference.source_state === "absent") return "inspect checked absence";
  if (reference.source_state === "unknown") return "inspect unknown value";
  return reference.destination.type === "inspector"
    ? reference.destination.label
    : "inspect destination authority";
}

function isIsoTimestamp(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(value));
}
