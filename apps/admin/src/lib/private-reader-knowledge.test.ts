import { describe, expect, it, vi } from "vitest";
import dataFixture from "../fixtures/data_v1.synthetic.json";
import { createPrivateReaderSession } from "./private-reader-client";
import { PRIVATE_READER_ORIGIN } from "./private-reader-fetch";
import {
  KnowledgeContractError,
  createFixtureKnowledgeReader,
  createPrivateKnowledgeReader,
  entitiesPath,
  entityPath,
  parseEntity,
  parseEntityPage,
  type KnowledgeFixture,
} from "./private-reader-knowledge";

// Synthetic only, in the round-2 target contract's shape.
const record = "rec-0123456789abcdef0123456789abcdef";
const summary = (extra: Record<string, unknown> = {}) => ({
  id: "ent-sample",
  kind: "person",
  name: "Sample Person",
  summary: "Synthetic",
  record_count: 2,
  last_seen_at: "2026-09-21T10:00:00Z",
  ...extra,
});
const entity = (extra: Record<string, unknown> = {}) => ({
  id: "ent-sample",
  kind: "person",
  name: "Sample Person",
  summary: "",
  facts: [{ label: "Met", value: "Synthetic", record_id: record }],
  timeline: [{ at: "2026-03-02", title: "First", record_id: null }],
  backlinks: [record],
  ...extra,
});
const envelope = (data: unknown, extra: Record<string, unknown> = {}) => ({
  schema: "personal_context_data_v1",
  response_observed_at: "2026-09-22T19:00:00Z",
  data,
  ...extra,
});
const page = (items: unknown[], extra: Record<string, unknown> = {}) =>
  envelope({ items, total: items.length, next_offset: null, ...extra });

describe("the life wiki contract", () => {
  it("reads a page of entities and an entity", () => {
    expect(parseEntityPage(page([summary()]))).toEqual({
      items: [
        {
          id: "ent-sample",
          kind: "person",
          name: "Sample Person",
          summary: "Synthetic",
          records: 2,
          lastSeenAt: "2026-09-21T10:00:00Z",
        },
      ],
      total: 1,
      nextOffset: null,
    });
    expect(parseEntity(envelope(entity()), "ent-sample")).toMatchObject({
      facts: [{ label: "Met", value: "Synthetic", recordId: record }],
      timeline: [{ at: "2026-03-02", title: "First", recordId: null }],
      backlinks: [record],
    });
  });

  it.each([
    ["an unknown entity field", page([summary({ email: "x" })])],
    ["a missing field", page([{ id: "ent-sample", kind: "person" }])],
    ["an id outside one path segment", page([summary({ id: "a/b" })])],
    ["an empty name", page([summary({ name: " " })])],
    ["an over-long summary", page([summary({ summary: "x".repeat(4001) })])],
    ["a fractional count", page([summary({ record_count: 1.5 })])],
    ["an unreadable time", page([summary({ last_seen_at: "soon" })])],
    ["a repeated id", page([summary(), summary()])],
    ["a cursor that goes back", page([summary()], { next_offset: 0 })],
    ["an unknown page field", page([summary()], { debug: 1 })],
    [
      "another schema",
      envelope(
        { items: [], total: 0, next_offset: null },
        { schema: "wiki_v2" },
      ),
    ],
  ])("rejects a page with %s", (_name, value) => {
    expect(() => parseEntityPage(value)).toThrow(KnowledgeContractError);
  });

  it.each([
    ["another entity", entity({ id: "ent-other" })],
    [
      "a fact with a stray field",
      entity({
        facts: [{ label: "a", value: "b", record_id: null, source: "x" }],
      }),
    ],
    [
      "a fact pointing at no record id",
      entity({ facts: [{ label: "a", value: "b", record_id: "123" }] }),
    ],
    [
      "a backlink that is not a record id",
      entity({ backlinks: ["ent-sample"] }),
    ],
    ["a repeated backlink", entity({ backlinks: [record, record] })],
    [
      "an undated timeline entry",
      entity({ timeline: [{ at: null, title: "x", record_id: null }] }),
    ],
    ["an unknown entity field", entity({ aliases: [] })],
  ])("rejects an entity with %s", (_name, value) => {
    expect(() => parseEntity(envelope(value), "ent-sample")).toThrow(
      KnowledgeContractError,
    );
  });

  it("asks with exactly the contract's params", () => {
    expect(entitiesPath({ kind: null, q: "" })).toBe(
      "/v1/data/entities?limit=50&offset=0",
    );
    expect(entitiesPath({ kind: "place", q: "cafe", offset: 50 })).toBe(
      "/v1/data/entities?q=cafe&kind=place&limit=50&offset=50",
    );
    expect(() => entitiesPath({ kind: null, q: "x".repeat(2049) })).toThrow();
    expect(entityPath("ent-sample")).toBe("/v1/data/entities/ent-sample");
    for (const id of ["a/b", "../x", "", "-lead", "x".repeat(129)])
      expect(() => entityPath(id)).toThrow();
  });

  it("serves the synthetic wiki through the same parsers", async () => {
    const reader = createFixtureKnowledgeReader(
      dataFixture.knowledge as KnowledgeFixture,
    );
    const all = await reader.list({ kind: null, q: "" });
    expect(all.total).toBe(8);
    const places = await reader.list({ kind: "place", q: "" });
    expect(places.items.map((item) => item.kind)).toEqual(["place", "place"]);
    expect((await reader.list({ kind: null, q: "cafe" })).items).toHaveLength(
      1,
    );
    const robin = await reader.get("ent-robin-example");
    const records = new Set(dataFixture.records.map((item) => item.record_id));
    // Every fixture link lands on a fixture record.
    for (const id of [
      ...robin!.backlinks,
      ...robin!.facts.flatMap((fact) => fact.recordId ?? []),
      ...robin!.timeline.flatMap((event) => event.recordId ?? []),
    ])
      expect(records.has(id), id).toBe(true);
    expect(await reader.get("ent-missing")).toBeNull();
  });

  it("reads through the Data session and answers null for an unknown entity", async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://admin.anipotts.com");
      if (url.pathname === "/api/private-reader/credential") {
        const now = Math.floor(Date.now() / 1000);
        return json({
          credential: "synthetic.jws",
          scope: ["data:read", "activity:read"],
          expiresAt: now + 60,
        });
      }
      if (url.pathname === "/v1/data/entities") return json(page([summary()]));
      if (url.pathname === "/v1/data/entities/ent-sample")
        return json(envelope(entity()));
      return json({ error: "not_found" }, 404);
    });
    const session = createPrivateReaderSession({
      fetch: fetcher as unknown as typeof fetch,
      csrf: async () => "c".repeat(64),
    });
    await session.start();
    const reader = createPrivateKnowledgeReader(session, {
      fetch: fetcher as unknown as typeof fetch,
    });
    expect((await reader.list({ kind: "person", q: "" })).items).toHaveLength(
      1,
    );
    expect(String(fetcher.mock.calls.at(-1)![0])).toBe(
      `${PRIVATE_READER_ORIGIN}/v1/data/entities?kind=person&limit=50&offset=0`,
    );
    expect((await reader.get("ent-sample"))?.name).toBe("Sample Person");
    expect(await reader.get("ent-gone")).toBeNull();
  });
});
