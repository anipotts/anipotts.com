import {
  assertValidKnowledgeCards,
  buildKnowledgeContextBundle,
  loadAdminControlSnapshot,
  type AdminControlDatabase,
  type KnowledgeSearchOptions,
} from "@anipotts/lib/admin-control";

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

/** The bounded knowledge bundle behind the Data Health and Knowledge views. */
export async function readAdminKnowledge(
  db: AdminControlDatabase,
  query = "",
  options: KnowledgeSearchOptions = {},
) {
  const snapshot = await loadKnowledgeSnapshot(db);
  assertValidKnowledgeCards(snapshot.projections.knowledge_cards);
  return {
    ...knowledgeAvailability(snapshot),
    bundle: buildKnowledgeContextBundle(
      snapshot.projections.knowledge_cards,
      query,
      options,
    ),
  };
}

async function loadKnowledgeSnapshot(db: AdminControlDatabase) {
  if (import.meta.env.DEV) {
    const { adminControlFixtureData } =
      await import("@anipotts/lib/admin-control/dev-fixtures");
    return loadAdminControlSnapshot(null, adminControlFixtureData);
  }
  return loadAdminControlSnapshot(db);
}
