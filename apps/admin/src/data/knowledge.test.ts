import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminControlFixtureData } from "@anipotts/lib/admin-control/dev-fixtures";
import { loadAdminControlSnapshot } from "@anipotts/lib/admin-control";
import {
  readAdminKnowledge,
  readAdminKnowledgeCard,
  KnowledgeUnavailableError,
} from "./knowledge";
import { GET } from "../pages/api/admin/knowledge";
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
function context(query: string) {
  return {
    url: new URL(`https://admin.test/api/admin/knowledge${query}`),
    locals: { runtime: { env: { DB: {} } } },
  } as never;
}
beforeEach(() => {
  vi.stubEnv("DEV", false);
  loader.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("knowledge source availability", () => {
  it("retains the successful detail shape and uses404 only for genuine absence", async () => {
    loader.mockResolvedValue(snapshot());
    expect(await readAdminKnowledgeCard(null, known.card_id)).toEqual(known);
    const found = await GET(
      context(`?card_id=${encodeURIComponent(known.card_id)}`),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(known);
    const missing = await GET(context("?card_id=not-present"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toContain("no-store");
  });
  it("returns503 rather than404 when a knowledge table read fails", async () => {
    loader.mockResolvedValue(
      snapshot(["admin_knowledge_cards read failed: unavailable"], "d1", []),
    );
    await expect(readAdminKnowledgeCard(null, "known")).rejects.toBeInstanceOf(
      KnowledgeUnavailableError,
    );
    const response = await GET(context("?card_id=known"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      error: "knowledge_unavailable",
      available: false,
    });
    const list = await readAdminKnowledge(null);
    expect(list.available).toBe(false);
    expect((await GET(context(""))).status).toBe(503);
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
    expect((await GET(context("?card_id=known"))).status).toBe(503);
  });
  it("does not hide valid knowledge when a different operational projection fails", async () => {
    loader.mockResolvedValue(
      snapshot(["admin_events read failed: unavailable"]),
    );
    expect((await readAdminKnowledge(null)).available).toBe(true);
    expect((await GET(context("?card_id=absent"))).status).toBe(404);
  });
});
