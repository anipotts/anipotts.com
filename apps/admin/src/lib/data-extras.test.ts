import { beforeEach, describe, expect, it, vi } from "vitest";

const read = vi.fn();
vi.mock("../data/knowledge", () => ({ readAdminKnowledge: read }));
const { fixtureExtras, loadDataExtras } = await import("./data-extras");

const card = (id: string, entity: string, extra: object = {}) => ({
  card_id: id,
  kind: "system",
  title: id,
  summary: `${id} summary`,
  source_system: "notes",
  freshness_state: "fresh",
  observed_at: null,
  entity_ref: entity,
  ...extra,
});

beforeEach(() => read.mockReset());

describe("Health and Knowledge cards", () => {
  it("reads health by the Life domain and its entity, not by a text search", async () => {
    read.mockResolvedValue({
      available: true,
      bundle: {
        cards: [
          card("vitals", "domain:health"),
          card("sleep", "health:sleep"),
          card("finance", "domain:finance", { title: "Health of savings" }),
        ],
      },
    });
    const extras = await loadDataExtras({}, "health");
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![1]).toBe("");
    expect(read.mock.calls[0]![2]).toMatchObject({ domain: "life" });
    expect(extras.health?.cards.map((item) => item.id)).toEqual([
      "vitals",
      "sleep",
    ]);
    expect(extras.knowledge).toBeUndefined();
  });

  it("reads only the page's own view, with its own availability", async () => {
    read.mockResolvedValue({
      available: false,
      bundle: { cards: [card("one", "system:one")] },
    });
    const extras = await loadDataExtras({}, "knowledge");
    expect(read.mock.calls[0]![2]).not.toHaveProperty("domain");
    expect(extras).toEqual({
      knowledge: {
        available: false,
        cards: [
          {
            id: "one",
            kind: "system",
            title: "one",
            summary: "one summary",
            source: "notes",
            freshness: "fresh",
            observed_at: null,
          },
        ],
      },
    });
  });

  it("reports a failed read as unavailable, never as empty", async () => {
    // A projection that breaks its shape fails the read the same way D1 does.
    read.mockResolvedValue({ available: true });
    expect(await loadDataExtras({}, "health")).toEqual({
      health: { available: false, cards: [] },
    });
  });

  it("maps the synthetic dataset onto both views", () => {
    expect(fixtureExtras(undefined)).toEqual({});
    expect(
      fixtureExtras({ available: true, health: [], knowledge: [] }),
    ).toEqual({
      health: { available: true, cards: [] },
      knowledge: { available: true, cards: [] },
    });
  });
});
