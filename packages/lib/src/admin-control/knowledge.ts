import type {
  AdminKnowledgeCard,
  AdminKnowledgeRetrievalContract,
  KnowledgeRevealPolicy,
} from "./types";

export const KNOWLEDGE_CARD_SCHEMA_VERSION = 1;
export const MAX_KNOWLEDGE_RESULT_LIMIT = 20;
export const MAX_KNOWLEDGE_CONTEXT_BUDGET_TOKENS = 4_000;

export const knowledgeRetrievalContract: AdminKnowledgeRetrievalContract = {
  query_before_asking: true,
  default_result_limit: 8,
  max_result_limit: MAX_KNOWLEDGE_RESULT_LIMIT,
  default_context_budget_tokens: 1_200,
  escalation_order: [
    "index_card",
    "bounded_summary_and_proof",
    "canonical_source",
  ],
  stale_behavior:
    "return the card with its freshness label; ask Ani only when live source retrieval fails and the answer changes the decision",
  closed_tier_behavior: "never_index_values",
  inbox_behavior: "knowledge_is_not_attention",
};

export interface KnowledgeSearchOptions {
  domain?: AdminKnowledgeCard["domain"] | null;
  limit?: number;
  context_budget_tokens?: number;
}

export interface KnowledgeSearchResult {
  card: AdminKnowledgeCard;
  score: number;
  estimated_tokens: number;
}

export interface KnowledgeContextBundle {
  query: string;
  cards: AdminKnowledgeCard[];
  used_context_budget_tokens: number;
  max_context_budget_tokens: number;
  truncated: boolean;
  next_step:
    | "use_index_cards"
    | "retrieve_bounded_summary_and_proof"
    | "retrieve_canonical_source"
    | "ask_ani";
}

const FORBIDDEN_KEYS = new Set([
  "transcript",
  "transcripts",
  "message",
  "messages",
  "message_body",
  "recipients",
  "recipient",
  "attachments",
  "attachment",
  "provider_payload",
  "payload",
  "health_data",
  "credentials",
  "credential",
  "secret",
  "password",
  "token",
]);

const MAX_SUMMARY_LENGTH = 480;
const MAX_RETRIEVAL_LENGTH = 420;

export function assertValidKnowledgeCards(cards: AdminKnowledgeCard[]): void {
  const ids = new Set<string>();

  for (const card of cards) {
    walkSanitized(card, `knowledge card ${card.card_id}`);
    if (ids.has(card.card_id)) {
      throw new Error(`duplicate knowledge card id ${card.card_id}`);
    }
    ids.add(card.card_id);

    if (!card.card_id || !card.entity_ref || !card.source_locator) {
      throw new Error("knowledge cards require stable identity and locator");
    }
    if (card.summary.length > MAX_SUMMARY_LENGTH) {
      throw new Error(`${card.card_id} summary exceeds bounded length`);
    }
    if (card.retrieval_instructions.length > MAX_RETRIEVAL_LENGTH) {
      throw new Error(
        `${card.card_id} retrieval instructions exceed bounded length`,
      );
    }
    if (
      card.context_budget_tokens < 40 ||
      card.context_budget_tokens > MAX_KNOWLEDGE_CONTEXT_BUDGET_TOKENS
    ) {
      throw new Error(`${card.card_id} has an invalid context budget`);
    }
    if (card.sensitivity === "closed" && card.reveal_policy !== "never_index") {
      throw new Error(`${card.card_id} closed values must never be indexed`);
    }
    if (card.reveal_policy === "never_index" && card.summary.trim()) {
      throw new Error(
        `${card.card_id} never-index cards cannot carry a summary`,
      );
    }
  }

  for (const card of cards) {
    for (const relatedId of card.related_card_ids) {
      if (!ids.has(relatedId)) {
        throw new Error(`${card.card_id} references unknown card ${relatedId}`);
      }
    }
  }
}

export function searchKnowledgeCards(
  cards: AdminKnowledgeCard[],
  query: string,
  options: KnowledgeSearchOptions = {},
): KnowledgeSearchResult[] {
  assertValidKnowledgeCards(cards);
  const terms = tokenize(query);
  const limit = clamp(
    options.limit ?? knowledgeRetrievalContract.default_result_limit,
    1,
    knowledgeRetrievalContract.max_result_limit,
  );

  return cards
    .filter((card) => !options.domain || card.domain === options.domain)
    .map((card) => ({
      card,
      score: scoreCard(card, terms),
      estimated_tokens: estimateCardTokens(card),
    }))
    .filter((result) => terms.length === 0 || result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        freshnessRank(left.card.freshness_state) -
          freshnessRank(right.card.freshness_state) ||
        right.card.indexed_at.localeCompare(left.card.indexed_at) ||
        left.card.title.localeCompare(right.card.title),
    )
    .slice(0, limit);
}

export function buildKnowledgeContextBundle(
  cards: AdminKnowledgeCard[],
  query: string,
  options: KnowledgeSearchOptions = {},
): KnowledgeContextBundle {
  const budget = clamp(
    options.context_budget_tokens ??
      knowledgeRetrievalContract.default_context_budget_tokens,
    100,
    MAX_KNOWLEDGE_CONTEXT_BUDGET_TOKENS,
  );
  const candidates = searchKnowledgeCards(cards, query, {
    ...options,
    limit: knowledgeRetrievalContract.max_result_limit,
  });
  const resultLimit = clamp(
    options.limit ?? knowledgeRetrievalContract.default_result_limit,
    1,
    knowledgeRetrievalContract.max_result_limit,
  );
  const selected: AdminKnowledgeCard[] = [];
  let used = 0;

  for (const candidate of candidates) {
    if (used + candidate.estimated_tokens > budget) continue;
    selected.push(candidate.card);
    used += candidate.estimated_tokens;
    if (selected.length >= resultLimit) break;
  }

  const staleOrUnavailable = selected.some((card) =>
    ["stale", "unavailable", "unknown"].includes(card.freshness_state),
  );
  const needsSource = selected.some((card) =>
    ["pointer_only", "human_present"].includes(card.reveal_policy),
  );

  return {
    query,
    cards: selected,
    used_context_budget_tokens: used,
    max_context_budget_tokens: budget,
    truncated: selected.length < candidates.length,
    next_step:
      selected.length === 0
        ? "ask_ani"
        : staleOrUnavailable || needsSource
          ? "retrieve_canonical_source"
          : query.trim()
            ? "retrieve_bounded_summary_and_proof"
            : "use_index_cards",
  };
}

function scoreCard(card: AdminKnowledgeCard, terms: string[]): number {
  if (terms.length === 0) return 0;
  const fields: Array<[string, number]> = [
    [card.title, 10],
    [card.entity_ref, 8],
    [card.summary, 6],
    [card.source_system, 5],
    [card.domain, 4],
    [card.kind, 4],
    [card.source_locator, 3],
    [card.retrieval_instructions, 2],
    [card.proof_refs.join(" "), 1],
    [card.lineage_refs.join(" "), 1],
  ];

  return terms.reduce((score, term) => {
    const termScore = fields.reduce(
      (fieldScore, [value, weight]) =>
        fieldScore + (value.toLowerCase().includes(term) ? weight : 0),
      0,
    );
    return score + termScore;
  }, 0);
}

function estimateCardTokens(card: AdminKnowledgeCard): number {
  const text = [
    card.card_id,
    card.entity_ref,
    card.title,
    card.summary,
    card.source_locator,
    card.retrieval_instructions,
    ...card.proof_refs,
    ...card.lineage_refs,
  ].join(" ");
  return Math.min(
    card.context_budget_tokens,
    Math.max(40, Math.ceil(text.length / 4)),
  );
}

function freshnessRank(state: AdminKnowledgeCard["freshness_state"]): number {
  return {
    fresh: 0,
    partial: 1,
    stale: 2,
    unknown: 3,
    unavailable: 4,
  }[state];
}

function tokenize(value: string): string[] {
  return [
    ...new Set(
      value
        .trim()
        .toLowerCase()
        .split(/[^a-z0-9@./:_-]+/)
        .filter(Boolean),
    ),
  ];
}

function walkSanitized(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSanitized(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`${path} contains forbidden key ${key}`);
    }
    walkSanitized(child, `${path}.${key}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function isKnowledgeRevealPolicy(
  value: string,
): value is KnowledgeRevealPolicy {
  return ["summary", "pointer_only", "human_present", "never_index"].includes(
    value,
  );
}
