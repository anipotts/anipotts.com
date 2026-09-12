import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLiveResults } from "./OperationalCommandPalette";

afterEach(() => vi.unstubAllGlobals());

describe("operational search adapter", () => {
  it("retains authorized source mapping and encodes record destinations", async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) =>
      Response.json(
        url.includes("inbox")
          ? {
              items: [
                {
                  id: "a/b",
                  title: "Review draft",
                  category: "review",
                  status: "waiting",
                  source: "site",
                },
              ],
            }
          : url.includes("knowledge")
            ? {
                cards: [
                  {
                    card_id: "note/1",
                    title: "Site context",
                    domain: "work",
                    kind: "note",
                  },
                ],
              }
            : {
                task_states: [
                  {
                    task_id: "task/1",
                    canonical_title: "site",
                    primary_entity_ref: "project/site",
                    operator_state: "working",
                  },
                ],
              },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const results = await loadLiveResults();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/inbox",
      "/api/admin/knowledge?limit=50",
      "/api/admin/runtime-feed",
    ]);
    expect(results.map(({ href }) => href)).toEqual([
      "/inbox?item=a%2Fb",
      "/knowledge?card=note%2F1",
      "/work?view=now&entity=project%2Fsite",
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
