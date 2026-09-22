import { describe, expect, it } from "vitest";
import {
  assertValidKnowledgeCards,
  buildKnowledgeContextBundle,
  knowledgeRetrievalContract,
  searchKnowledgeCards,
  type AdminKnowledgeCard,
} from "./index";
import { fixtureKnowledgeCards } from "./dev-fixtures";

describe("admin knowledge cards", () => {
  it("validates the bounded fixture catalog and retrieval contract", () => {
    expect(() =>
      assertValidKnowledgeCards(fixtureKnowledgeCards),
    ).not.toThrow();
    expect(knowledgeRetrievalContract.query_before_asking).toBe(true);
    expect(knowledgeRetrievalContract.inbox_behavior).toBe(
      "knowledge_is_not_attention",
    );
    expect(knowledgeRetrievalContract.closed_tier_behavior).toBe(
      "never_index_values",
    );
  });

  it("finds canonical systems and filters by domain", () => {
    const brain = searchKnowledgeCards(fixtureKnowledgeCards, "brain life");
    const work = searchKnowledgeCards(fixtureKnowledgeCards, "", {
      domain: "work",
      limit: 20,
    });

    expect(brain[0]?.card.card_id).toBe("knowledge-brain-life-record");
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((result) => result.card.domain === "work")).toBe(true);
  });

  it("bounds result count and context budget", () => {
    const bundle = buildKnowledgeContextBundle(fixtureKnowledgeCards, "", {
      limit: 100,
      context_budget_tokens: 240,
    });

    expect(bundle.cards.length).toBeLessThanOrEqual(20);
    expect(bundle.used_context_budget_tokens).toBeLessThanOrEqual(240);
    expect(bundle.max_context_budget_tokens).toBe(240);
    expect(bundle.truncated).toBe(true);
  });

  it("rejects closed values and unknown lineage targets", () => {
    const closed = cloneCard(fixtureKnowledgeCards[0]!);
    closed.sensitivity = "closed";
    closed.reveal_policy = "summary";

    expect(() => assertValidKnowledgeCards([closed])).toThrow(
      "closed values must never be indexed",
    );

    const broken = cloneCard(fixtureKnowledgeCards[0]!);
    broken.related_card_ids = ["knowledge-does-not-exist"];

    expect(() => assertValidKnowledgeCards([broken])).toThrow(
      "references unknown card",
    );
  });
});

function cloneCard(card: AdminKnowledgeCard): AdminKnowledgeCard {
  return structuredClone(card);
}
