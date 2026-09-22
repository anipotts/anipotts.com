import { readAdminKnowledge } from "../data/knowledge";

/**
 * The server-read Data views: Health summaries and Knowledge cards, from the
 * D1 knowledge projection. Each view is read only on its own page, by
 * domain rather than by text search, and carries its own availability. Only
 * display fields leave the server; a failed read is reported as unavailable,
 * never as empty.
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
export type CardSet = { available: boolean; cards: DataCard[] };
export type CardsView = "health" | "knowledge";
export type DataExtras = Partial<Record<CardsView, CardSet>>;

/** The synthetic dataset's shape for the same cards. */
export type FixtureExtras = {
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

/** A Life-domain card about health: its entity names health
 * (`domain:health`, `health:sleep`, `system:health-api`). Status only: no raw
 * readings, no inferred tasks. */
const isHealth = (card: Card) => /\bhealth\b/i.test(card.entity_ref ?? "");

async function read(db: unknown, which: CardsView): Promise<CardSet> {
  try {
    const result = await readAdminKnowledge(db as never, "", {
      ...(which === "health" ? { domain: "life" as const } : {}),
      limit: 20,
      context_budget_tokens: 4000,
    });
    const cards = result.bundle.cards as Card[];
    return {
      available: result.available,
      cards: (which === "health" ? cards.filter(isHealth) : cards).map(view),
    };
  } catch {
    return { available: false, cards: [] };
  }
}

/** One view's cards, read on its own page only. */
export async function loadDataExtras(
  db: unknown,
  which: CardsView,
): Promise<DataExtras> {
  return { [which]: await read(db, which) };
}

/** The synthetic dataset's cards as the views read them. */
export function fixtureExtras(extras: FixtureExtras | undefined): DataExtras {
  if (!extras) return {};
  return {
    health: { available: extras.available, cards: extras.health },
    knowledge: { available: extras.available, cards: extras.knowledge },
  };
}
