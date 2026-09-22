import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminControlFixtureData } from "@anipotts/lib/admin-control/dev-fixtures";
import { loadAdminControlSnapshot } from "@anipotts/lib/admin-control";
import { readAdminKnowledge } from "./knowledge";
vi.mock("@anipotts/lib/admin-control", async (load) => ({
  ...(await load<typeof import("@anipotts/lib/admin-control")>()),
  loadAdminControlSnapshot: vi.fn(),
}));
const loader = vi.mocked(loadAdminControlSnapshot);
const known = adminControlFixtureData.projections.knowledge_cards[0]!;
function snapshot(
  errors: string[] = [],
  source_mode = "d1",
  cards = adminControlFixtureData.projections.knowledge_cards,
) {
  return {
    generated_at: "2026-09-12T00:00:00Z",
    source_mode,
    errors,
    projections: { knowledge_cards: cards },
  } as unknown as Awaited<ReturnType<typeof loadAdminControlSnapshot>>;
}
beforeEach(() => {
  vi.stubEnv("DEV", false);
  loader.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("knowledge source availability", () => {
  it("reports a failed knowledge table read as unavailable, not empty", async () => {
    loader.mockResolvedValue(
      snapshot(["admin_knowledge_cards read failed: unavailable"], "d1", []),
    );
    const result = await readAdminKnowledge(null);
    expect(result.available).toBe(false);
    expect(result.errors).toEqual([
      "admin_knowledge_cards read failed: unavailable",
    ]);
  });
  it("marks disconnected storage unavailable even when upstream errors lack a table prefix", async () => {
    loader.mockResolvedValue(
      snapshot(
        ["d1 unavailable; no development fixture was requested"],
        "disconnected",
        [],
      ),
    );
    expect((await readAdminKnowledge(null)).available).toBe(false);
  });
  it("does not hide valid knowledge when a different operational projection fails", async () => {
    loader.mockResolvedValue(
      snapshot(["admin_events read failed: unavailable"]),
    );
    const result = await readAdminKnowledge(null);
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
    loader.mockResolvedValue(snapshot([], "d1", cards));
    const result = await readAdminKnowledge(null, "Needle", {
      domain: "work",
      limit: 1,
      context_budget_tokens: 4000,
    });
    expect(result.bundle.cards).toHaveLength(1);
    expect(result.bundle.cards[0]?.domain).toBe("work");
    expect(result.bundle.cards[0]?.title).toContain("Needle");
  });
  it("applies token budget and preserves provenance without a full snapshot escape", async () => {
    loader.mockResolvedValue(snapshot([], "d1", cards));
    const result = await readAdminKnowledge(null, "", {
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
    loader.mockResolvedValue(snapshot([], "d1", cards));
    const result = await readAdminKnowledge(null, "unmatchedzzzzzz");
    expect(result.bundle.cards).toEqual([]);
  });
});
