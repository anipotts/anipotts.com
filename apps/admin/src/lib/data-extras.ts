import { readAdminKnowledge } from "../data/knowledge";

/**
 * The server-read parts of Data Sources: health summaries and the knowledge
 * cards that had their own pages before. Only display fields leave the
 * server; a failed read is reported as unavailable, never as empty.
 */
export type DataCard = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  source: string;
  freshness: string;
  observed_at: string | null;
};
export type DataExtras = {
  available: boolean;
  health: DataCard[];
  knowledge: DataCard[];
};

type Card = {
  card_id: string;
  kind: string;
  title: string;
  summary: string;
  source_system: string;
  freshness_state: string;
  observed_at?: string | null;
  entity_ref?: string;
};

const view = (card: Card): DataCard => ({
  id: card.card_id,
  kind: card.kind,
  title: card.title,
  summary: card.summary,
  source: card.source_system,
  freshness: card.freshness_state,
  observed_at: card.observed_at ?? null,
});

export async function loadDataExtras(db: unknown): Promise<DataExtras> {
  try {
    const [health, knowledge] = await Promise.all([
      readAdminKnowledge(db as never, "health vitals", {
        domain: "life",
        limit: 4,
      }),
      readAdminKnowledge(db as never, "", {
        limit: 20,
        context_budget_tokens: 4000,
      }),
    ]);
    // Status only: no raw readings, no inferred tasks.
    const healthCards = (health.bundle.cards as Card[]).filter(
      (card) =>
        card.entity_ref?.includes("health") ||
        card.title.toLowerCase().includes("health") ||
        card.summary.toLowerCase().includes("vital"),
    );
    return {
      available: health.available && knowledge.available,
      health: healthCards.map(view),
      knowledge: (knowledge.cards as Card[]).map(view),
    };
  } catch {
    return { available: false, health: [], knowledge: [] };
  }
}
