import { describe, expect, it, vi } from "vitest";
import {
  createFixtureFetch,
  FIXTURE_API,
  FIXTURE_THREAD,
  fixtureReducer,
  fixtureThread,
  initialFixture,
} from "./dev-openai-fixture";

describe("synthetic admin fixture", () => {
  it("only publishes acknowledged current revisions to every record projection", () => {
    const original = initialFixture();
    const change = {
      type: "acknowledge" as const,
      id: "synthetic-1",
      revision: 1,
      title: "Changed synthetic title",
      body: "New synthetic body",
    };
    expect(fixtureReducer(original, change)).toBe(original);
    const saving = fixtureReducer(original, {
      type: "scenario",
      scenario: "updating",
    });
    const saved = fixtureReducer(saving, change);
    expect(saved.records[0]).toMatchObject({
      title: change.title,
      body: change.body,
      revision: 2,
    });
    expect(JSON.stringify(fixtureThread(saved))).toContain(change.title);
    const conflict = fixtureReducer({ ...saved, scenario: "updating" }, change);
    expect(conflict.scenario).toBe("conflict");
    expect(conflict.records).toBe(saved.records);
  });
  it("failed saves and simulated disconnected states preserve acknowledged content", () => {
    const original = initialFixture();
    for (const scenario of [
      "failed",
      "disconnected",
      "stale",
      "conflict",
    ] as const) {
      const state = fixtureReducer(original, { type: "scenario", scenario });
      expect(state.records).toBe(original.records);
    }
  });
  it("reads the latest selected record without invoking fetch, storage, or inference", async () => {
    let state = initialFixture();
    const network = vi.fn(() => {
      throw new Error("network forbidden");
    });
    vi.stubGlobal("fetch", network);
    const transport = createFixtureFetch(() => state);
    const request = (type: string, url = FIXTURE_API) =>
      transport(url, {
        method: "POST",
        body: JSON.stringify({ type, params: { thread_id: FIXTURE_THREAD } }),
      });
    expect(
      (await (await request("threads.get_by_id")).json()).status.type,
    ).toBe("locked");
    state = fixtureReducer(state, { type: "select", id: "synthetic-2" });
    expect(
      JSON.stringify(await (await request("items.list")).json()),
    ).toContain("Synthetic writing note 2");
    expect((await request("threads.create")).status).toBe(405);
    expect((await request("threads.add_user_message")).status).toBe(405);
    expect(
      (
        await request(
          "threads.get_by_id",
          "https://api.openai.com/__dev__/synthetic-chatkit",
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("threads.get_by_id", "/api/content/articles")).status,
    ).toBe(403);
    expect(network).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("rejects malformed bodies and unknown thread identities", async () => {
    const transport = createFixtureFetch(initialFixture);
    expect((await transport(FIXTURE_API, { body: "oops" })).status).toBe(400);
    expect(
      (
        await transport(FIXTURE_API, {
          body: JSON.stringify({
            type: "items.list",
            params: { thread_id: "production" },
          }),
        })
      ).status,
    ).toBe(404);
  });
});
