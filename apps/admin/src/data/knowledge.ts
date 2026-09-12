import {
  assertValidKnowledgeCards,
  buildKnowledgeContextBundle,
  getKnowledgeCard,
  knowledgeRetrievalContract,
  loadAdminControlSnapshot,
  type AdminControlDatabase,
  type KnowledgeSearchOptions,
} from "@anipotts/lib/admin-control";

export class KnowledgeUnavailableError extends Error {
  constructor() {
    super("knowledge_unavailable");
  }
}
function knowledgeAvailability(
  snapshot: Awaited<ReturnType<typeof loadAdminControlSnapshot>>,
) {
  const errors = snapshot.errors.filter((error) =>
    error.startsWith("admin_knowledge_cards"),
  );
  if (snapshot.source_mode === "disconnected")
    errors.push("knowledge_storage_unavailable");
  return { available: errors.length === 0, errors };
}

export async function readAdminKnowledge(
  db: AdminControlDatabase,
  query = "",
  options: KnowledgeSearchOptions = {},
) {
  const snapshot = await loadKnowledgeSnapshot(db);
  assertValidKnowledgeCards(snapshot.projections.knowledge_cards);

  return {
    generated_at: snapshot.generated_at,
    source_mode: snapshot.source_mode,
    ...knowledgeAvailability(snapshot),
    contract: knowledgeRetrievalContract,
    bundle: buildKnowledgeContextBundle(
      snapshot.projections.knowledge_cards,
      query,
      options,
    ),
    cards: snapshot.projections.knowledge_cards,
  };
}

export async function readAdminKnowledgeCard(
  db: AdminControlDatabase,
  cardId: string,
) {
  const snapshot = await loadKnowledgeSnapshot(db);
  if (!knowledgeAvailability(snapshot).available)
    throw new KnowledgeUnavailableError();
  return getKnowledgeCard(snapshot.projections.knowledge_cards, cardId);
}

async function loadKnowledgeSnapshot(db: AdminControlDatabase) {
  if (import.meta.env.DEV) {
    const { adminControlFixtureData } =
      await import("@anipotts/lib/admin-control/dev-fixtures");
    return loadAdminControlSnapshot(null, adminControlFixtureData);
  }
  return loadAdminControlSnapshot(db);
}
