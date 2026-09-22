import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureKnowledgeCards } from "@anipotts/lib/admin-control/dev-fixtures";
import type { AdminControlDatabase } from "@anipotts/lib/admin-control";
import { readAdminKnowledge } from "./knowledge";

const known = fixtureKnowledgeCards[0]!;

/** A D1 stand-in that records each query and answers with `rows`. */
function database(rows: unknown[] | Error) {
  const queries: string[] = [];
  const db: AdminControlDatabase = {
    prepare: (query) => {
      queries.push(query);
      return {
        all: (async () => {
          if (rows instanceof Error) throw rows;
          return { results: rows };
        }) as never,
      };
    },
  };
  return { db, queries };
}

beforeEach(() => vi.stubEnv("DEV", false));
afterEach(() => vi.unstubAllEnvs());

describe("knowledge source availability", () => {
  it("reports a failed knowledge table read as unavailable, not empty", async () => {
    const { db } = database(new Error("unavailable"));
    const result = await readAdminKnowledge(db);
    expect(result.available).toBe(false);
    expect(result.bundle.cards).toEqual([]);
    expect(result.errors).toEqual([
      "admin_knowledge_cards read failed: Error: unavailable",
    ]);
  });

  it("marks missing storage unavailable", async () => {
    const result = await readAdminKnowledge(null);
    expect(result.available).toBe(false);
    expect(result.errors).toEqual(["knowledge_storage_unavailable"]);
  });

  it("reads the knowledge table and nothing else", async () => {
    const { db, queries } = database(fixtureKnowledgeCards);
    const result = await readAdminKnowledge(db);
    expect(result.available).toBe(true);
    expect(result.bundle.cards.length).toBeGreaterThan(0);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/FROM admin_knowledge_cards/);
  });

  it("serves the development fixture without letting a local binding shadow it", async () => {
    vi.stubEnv("DEV", true);
    const { db, queries } = database([]);
    const result = await readAdminKnowledge(db, "", { limit: 20 });
    expect(queries).toEqual([]);
    expect(result.available).toBe(true);
    expect(result.bundle.cards.length).toBeGreaterThan(0);
  });
});

describe("bounded knowledge list projection", () => {
  const cards = Array.from({ length: 6 }, (_, index) => ({
    ...known,
    card_id: `bounded-${index}`,
    entity_ref: `fixture:${index}`,
    title: index < 4 ? `Needle ${index}` : `Other ${index}`,
    summary: "",
    domain: index % 2 ? ("life" as const) : ("work" as const),
    related_card_ids: [],
    context_budget_tokens: 40,
  }));
  it("applies the query, domain and result count", async () => {
    const result = await readAdminKnowledge(database(cards).db, "Needle", {
      domain: "work",
      limit: 1,
      context_budget_tokens: 4000,
    });
    expect(result.bundle.cards).toHaveLength(1);
    expect(result.bundle.cards[0]?.domain).toBe("work");
    expect(result.bundle.cards[0]?.title).toContain("Needle");
  });
  it("applies token budget and preserves provenance without a full snapshot escape", async () => {
    const result = await readAdminKnowledge(database(cards).db, "", {
      limit: 20,
      context_budget_tokens: 100,
    });
    expect(result.bundle.cards).toHaveLength(2);
    expect(result.bundle.used_context_budget_tokens).toBeLessThanOrEqual(100);
    expect(result.bundle.truncated).toBe(true);
    expect(result.bundle.cards[0]).toMatchObject({
      source_locator: known.source_locator,
      reveal_policy: known.reveal_policy,
      freshness_state: known.freshness_state,
    });
    expect(Object.keys(result).sort()).toEqual([
      "available",
      "bundle",
      "errors",
    ]);
  });
  it("returns no cards for an unmatched query", async () => {
    const result = await readAdminKnowledge(
      database(cards).db,
      "unmatchedzzzzzz",
    );
    expect(result.bundle.cards).toEqual([]);
  });
});
