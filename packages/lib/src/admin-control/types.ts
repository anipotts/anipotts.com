export type KnowledgeDomain = "work" | "content" | "life" | "fleet" | "system";

export type KnowledgeCardKind =
  | "person"
  | "project"
  | "place"
  | "moment"
  | "decision"
  | "concept"
  | "system"
  | "reference";

export type KnowledgeSensitivity =
  "open" | "restricted" | "intimate" | "closed";

export type KnowledgeRevealPolicy =
  "summary" | "pointer_only" | "human_present" | "never_index";

export type KnowledgeFreshnessState =
  "fresh" | "stale" | "partial" | "unavailable" | "unknown";

export interface AdminKnowledgeCard {
  card_id: string;
  entity_ref: string;
  domain: KnowledgeDomain;
  kind: KnowledgeCardKind;
  title: string;
  summary: string;
  source_system: string;
  source_locator: string;
  source_native_id: string | null;
  canonical_host: "ap-pro" | "ap-mini" | "cloud" | "provider" | "none";
  canonical_path: string | null;
  sensitivity: KnowledgeSensitivity;
  reveal_policy: KnowledgeRevealPolicy;
  freshness_state: KnowledgeFreshnessState;
  observed_at: string | null;
  stale_after_seconds: number | null;
  content_hash: string;
  proof_refs: string[];
  lineage_refs: string[];
  related_card_ids: string[];
  retrieval_instructions: string;
  context_budget_tokens: number;
  event_refs: string[];
  indexed_at: string;
}

export interface AdminKnowledgeRetrievalContract {
  query_before_asking: true;
  default_result_limit: number;
  max_result_limit: number;
  default_context_budget_tokens: number;
  escalation_order: [
    "index_card",
    "bounded_summary_and_proof",
    "canonical_source",
  ];
  stale_behavior: string;
  closed_tier_behavior: "never_index_values";
  inbox_behavior: "knowledge_is_not_attention";
}
