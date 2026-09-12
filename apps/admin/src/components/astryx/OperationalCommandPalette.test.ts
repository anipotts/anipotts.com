import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadLiveResults,
  operationalDestinations,
  operationalSearchNavigation,
} from "./OperationalCommandPalette";
import { navItems } from "../../data/admin";

afterEach(() => vi.unstubAllGlobals());

describe("operational search adapter", () => {
  it("starts with current workspace destinations and scopes advanced navigation", () => {
    expect(operationalDestinations.map((row) => row.label)).toEqual([
      "Overview",
      "Machines",
      "Loops",
    ]);
    const advanced = operationalSearchNavigation(navItems);
    expect(advanced.some((row) => row.href.startsWith("/inbox"))).toBe(true);
    expect(
      advanced.some((row) =>
        ["content", "life", "website"].includes(row.group),
      ),
    ).toBe(false);
    expect(
      advanced.some((row) => /carousels|preview|projects/.test(row.href)),
    ).toBe(false);
  });
  it("reads only operational runtime metadata and encodes record destinations", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        task_states: [
          {
            task_id: "task/1",
            canonical_title: "Fixture loop",
            primary_entity_ref: "project/fixture",
            operator_state: "working",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const results = await loadLiveResults();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/runtime-feed",
    ]);
    expect(results.map(({ href }) => href)).toEqual([
      "/work?view=now&entity=project%2Ffixture",
    ]);
  });

  it("reports unavailable sources instead of treating failed requests as empty collections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    await expect(loadLiveResults()).rejects.toThrow("could not be loaded");
  });

  it("accepts successful empty responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json({})),
    );
    await expect(loadLiveResults()).resolves.toEqual([]);
  });
});
