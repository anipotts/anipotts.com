import { describe, expect, it } from "vitest";
import { loadKnowledgeCards, type AdminControlDatabase } from "./index";
import { fixtureKnowledgeCards } from "./dev-fixtures";

function database(all: () => Promise<{ results?: unknown[] }>) {
  const queries: string[] = [];
  const db: AdminControlDatabase = {
    prepare: (query) => {
      queries.push(query);
      return { all: all as never };
    },
  };
  return { db, queries };
}

describe("knowledge card reads", () => {
  it("serves the explicit development fixture without a database", async () => {
    const read = await loadKnowledgeCards(null, fixtureKnowledgeCards);
    expect(read.available).toBe(true);
    expect(read.errors).toEqual([]);
    expect(read.cards).toBe(fixtureKnowledgeCards);
  });

  it("reports a missing production database as unavailable", async () => {
    for (const db of [null, undefined])
      expect(await loadKnowledgeCards(db)).toEqual({
        cards: [],
        available: false,
        errors: ["knowledge_storage_unavailable"],
      });
  });

  it("reads only the knowledge table and keeps an empty table empty", async () => {
    const { db, queries } = database(async () => ({ results: [] }));
    const read = await loadKnowledgeCards(db, fixtureKnowledgeCards);
    expect(read).toEqual({ cards: [], available: true, errors: [] });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/FROM admin_knowledge_cards/);
  });

  it("reports a failed read as unavailable, without substituting fixtures", async () => {
    const { db } = database(async () => {
      throw new Error("read unavailable");
    });
    const read = await loadKnowledgeCards(db, fixtureKnowledgeCards);
    expect(read.available).toBe(false);
    expect(read.cards).toEqual([]);
    expect(read.errors).toEqual([
      "admin_knowledge_cards read failed: Error: read unavailable",
    ]);
  });

  it("maps D1 rows, parsing JSON lists and numbers", async () => {
    const { db } = database(async () => ({
      results: [
        {
          card_id: "card-1",
          entity_ref: "system:brain",
          domain: "life",
          kind: "system",
          title: "Brain",
          summary: "",
          source_system: "brain",
          source_locator: "brain://vault",
          source_native_id: "",
          canonical_host: "ap-mini",
          canonical_path: null,
          sensitivity: "intimate",
          reveal_policy: "pointer_only",
          freshness_state: "unknown",
          observed_at: null,
          stale_after_seconds: "900",
          content_hash: "git:1",
          proof_refs: '["git:1", 2]',
          lineage_refs: "not json",
          related_card_ids: null,
          retrieval_instructions: "",
          context_budget_tokens: "n/a",
          event_refs: ["evt-1"],
          indexed_at: "2026-07-23T23:00:00.000Z",
        },
      ],
    }));
    const [card] = (await loadKnowledgeCards(db)).cards;
    expect(card).toMatchObject({
      card_id: "card-1",
      source_native_id: null,
      stale_after_seconds: 900,
      proof_refs: ["git:1"],
      lineage_refs: [],
      related_card_ids: [],
      context_budget_tokens: 200,
      event_refs: ["evt-1"],
    });
  });
});
