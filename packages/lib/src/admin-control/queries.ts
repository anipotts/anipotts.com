import type { AdminKnowledgeCard } from "./types";

type D1Result<T> = { results?: T[] };

export type AdminControlStatement = {
  all<T = unknown>(): Promise<D1Result<T>>;
};

export type AdminControlDatabase =
  | {
      prepare(query: string): AdminControlStatement;
    }
  | null
  | undefined;

/** The knowledge card projection, with its availability. A missing store or a
 * failed read is unavailable, never an empty success. */
export type KnowledgeCardsRead = {
  cards: AdminKnowledgeCard[];
  available: boolean;
  errors: string[];
};

const KNOWLEDGE_CARDS_QUERY = `SELECT card_id, entity_ref, domain, kind, title, summary, source_system,
            source_locator, source_native_id, canonical_host, canonical_path,
            sensitivity, reveal_policy, freshness_state, observed_at,
            stale_after_seconds, content_hash, proof_refs, lineage_refs,
            related_card_ids, retrieval_instructions, context_budget_tokens,
            event_refs, indexed_at
       FROM admin_knowledge_cards
      ORDER BY domain ASC, title ASC`;

/** Reads `admin_knowledge_cards` alone. Development passes the fixture cards
 * with no database, so a local D1 binding never shadows them. */
export async function loadKnowledgeCards(
  db: AdminControlDatabase,
  fixture?: AdminKnowledgeCard[],
): Promise<KnowledgeCardsRead> {
  if (!db) {
    return fixture
      ? { cards: fixture, available: true, errors: [] }
      : {
          cards: [],
          available: false,
          errors: ["knowledge_storage_unavailable"],
        };
  }
  try {
    const result = await db
      .prepare(KNOWLEDGE_CARDS_QUERY)
      .all<Record<string, unknown>>();
    return {
      cards: Array.isArray(result.results)
        ? result.results.map(knowledgeCard)
        : [],
      available: true,
      errors: [],
    };
  } catch (error) {
    return {
      cards: [],
      available: false,
      errors: [`admin_knowledge_cards read failed: ${String(error)}`],
    };
  }
}

function knowledgeCard(row: Record<string, unknown>): AdminKnowledgeCard {
  return {
    card_id: asString(row.card_id),
    entity_ref: asString(row.entity_ref),
    domain: asString(row.domain) as AdminKnowledgeCard["domain"],
    kind: asString(row.kind) as AdminKnowledgeCard["kind"],
    title: asString(row.title),
    summary: asString(row.summary),
    source_system: asString(row.source_system),
    source_locator: asString(row.source_locator),
    source_native_id: nullableString(row.source_native_id),
    canonical_host: asString(
      row.canonical_host,
    ) as AdminKnowledgeCard["canonical_host"],
    canonical_path: nullableString(row.canonical_path),
    sensitivity: asString(row.sensitivity) as AdminKnowledgeCard["sensitivity"],
    reveal_policy: asString(
      row.reveal_policy,
    ) as AdminKnowledgeCard["reveal_policy"],
    freshness_state: asString(
      row.freshness_state,
    ) as AdminKnowledgeCard["freshness_state"],
    observed_at: nullableString(row.observed_at),
    stale_after_seconds:
      row.stale_after_seconds == null
        ? null
        : toNumber(row.stale_after_seconds, 0),
    content_hash: asString(row.content_hash),
    proof_refs: parseStringArray(row.proof_refs),
    lineage_refs: parseStringArray(row.lineage_refs),
    related_card_ids: parseStringArray(row.related_card_ids),
    retrieval_instructions: asString(row.retrieval_instructions),
    context_budget_tokens: toNumber(row.context_budget_tokens, 200),
    event_refs: parseStringArray(row.event_refs),
    indexed_at: asString(row.indexed_at),
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const text = asString(value);
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string");
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
