import {
  assertValidKnowledgeCards,
  buildKnowledgeContextBundle,
  loadKnowledgeCards,
  type AdminControlDatabase,
  type KnowledgeSearchOptions,
} from "@anipotts/lib/admin-control";

/** The bounded knowledge bundle behind the Data Health and Knowledge views. */
export async function readAdminKnowledge(
  db: AdminControlDatabase,
  query = "",
  options: KnowledgeSearchOptions = {},
) {
  const { cards, available, errors } = await readKnowledgeCards(db);
  assertValidKnowledgeCards(cards);
  return {
    available,
    errors,
    bundle: buildKnowledgeContextBundle(cards, query, options),
  };
}

async function readKnowledgeCards(db: AdminControlDatabase) {
  if (import.meta.env.DEV) {
    const { fixtureKnowledgeCards } =
      await import("@anipotts/lib/admin-control/dev-fixtures");
    return loadKnowledgeCards(null, fixtureKnowledgeCards);
  }
  return loadKnowledgeCards(db);
}
