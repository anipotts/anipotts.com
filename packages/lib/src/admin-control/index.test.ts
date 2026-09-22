import { describe, expect, it } from "vitest";
import {
  ADMIN_EVENT_SCHEMA_VERSION,
  buildSentMailAwareness,
  buildSentMailMetadata,
  gmailSentDedupeKey,
  loadAdminControlSnapshot,
} from "./index";
import { adminControlFixtureData } from "./dev-fixtures";

describe("admin-control", () => {
  it("loads fixture projections with schema version and event refs", async () => {
    const snapshot = await loadAdminControlSnapshot(
      null,
      adminControlFixtureData,
    );

    expect(snapshot.schema_version).toBe(ADMIN_EVENT_SCHEMA_VERSION);
    expect(snapshot.source_mode).toBe("fixture");
    expect(snapshot.projections.inbox_items.length).toBeGreaterThan(0);
    expect(
      snapshot.projections.inbox_items[0]?.event_refs.length,
    ).toBeGreaterThan(0);
    expect(snapshot.projections.knowledge_cards.length).toBeGreaterThan(0);
    expect(snapshot.contracts.knowledge_retrieval.query_before_asking).toBe(
      true,
    );
    expect(snapshot.retention.payload_store).toBe("r2");
  });

  it("keeps checkpoint out of the piece statechart", async () => {
    const snapshot = await loadAdminControlSnapshot(
      null,
      adminControlFixtureData,
    );

    expect(snapshot.contracts.piece_states).not.toContain("checkpoint");
    expect(snapshot.contracts.legal_piece_cycles).toEqual([
      "review -> draft",
      "published -> draft",
    ]);
  });

  it("keeps empty production projections empty instead of showing fixtures", async () => {
    const db = {
      prepare: () => ({
        bind() {
          return this;
        },
        async all() {
          return { results: [] };
        },
      }),
    };

    const snapshot = await loadAdminControlSnapshot(db);

    expect(snapshot.source_mode).toBe("d1");
    expect(snapshot.events).toEqual([]);
    expect(snapshot.projections.inbox_items).toEqual([]);
    expect(snapshot.projections.knowledge_cards).toEqual([]);
    expect(snapshot.errors).toEqual([]);
  });

  it("reports a missing production database as disconnected", async () => {
    const snapshot = await loadAdminControlSnapshot(null);

    expect(snapshot.source_mode).toBe("disconnected");
    expect(snapshot.events).toEqual([]);
    expect(snapshot.projections.inbox_items).toEqual([]);
    expect(snapshot.errors).toContain(
      "d1 unavailable; no development fixture was requested",
    );
  });

  it("reports production read failures without substituting fixture work", async () => {
    const db = {
      prepare: () => ({
        bind() {
          return this;
        },
        async all() {
          throw new Error("read unavailable");
        },
      }),
    };

    const snapshot = await loadAdminControlSnapshot(db);

    expect(snapshot.source_mode).toBe("d1");
    expect(snapshot.events).toEqual([]);
    expect(snapshot.projections.inbox_items).toEqual([]);
    expect(snapshot.errors.length).toBeGreaterThan(0);
    expect(snapshot.errors.join(" ")).toContain("read unavailable");
  });

  it("models sent gmail as event proof without an inbox card when complete", () => {
    const metadata = buildSentMailMetadata({
      account: "hello@anipotts.com",
      sent_ref: "rayban-30-day-analytics-2026-07-08",
      subject: "Ray-Ban 30-day analytics",
      sent_at: "2026-07-08T00:00:00.000Z",
      has_attachments: "unknown",
    });
    const awareness = buildSentMailAwareness(metadata, {
      completed: true,
      dedupe_key: gmailSentDedupeKey("rayban-30-day-analytics-2026-07-08"),
    });

    expect(Object.keys(metadata)).not.toContain("message_id");
    expect(Object.keys(metadata)).not.toContain("thread_id");
    expect(Object.keys(metadata)).not.toContain("recipients");
    expect(Object.keys(metadata)).not.toContain("snippet");
    expect(awareness.event.dedupe_key).toBe(
      gmailSentDedupeKey("rayban-30-day-analytics-2026-07-08"),
    );
    expect(awareness.event.payload_ref).toBeNull();
    expect(awareness.event.summary).toContain("metadata-only proof");
    expect(awareness.inbox_item).toBeNull();
  });

  it("keeps payment follow-up separate from the sent gmail dedupe key", () => {
    const metadata = buildSentMailMetadata({
      account: "hello@anipotts.com",
      sent_ref: "rayban-30-day-analytics-2026-07-08",
      subject: "Ray-Ban 30-day analytics",
      sent_at: "2026-07-08T00:00:00.000Z",
    });
    const awareness = buildSentMailAwareness(metadata, {
      completed: true,
      dedupe_key: gmailSentDedupeKey("rayban-30-day-analytics-2026-07-08"),
      follow_up: {
        id: "inbox-rayban-payment-followup",
        dedupe_key: "brand:rayban-meta:payment-followup:2026-07-09",
        kind: "payment",
        title: "ray-ban payment follow-up",
        summary: "payment proof remains separate from sent mail proof.",
        owner: "chief/brand",
      },
    });

    expect(awareness.inbox_item?.dedupe_key).toBe(
      "brand:rayban-meta:payment-followup:2026-07-09",
    );
    expect(awareness.inbox_item?.dedupe_key).not.toBe(
      awareness.event.dedupe_key,
    );
    expect(awareness.inbox_item?.action_kind).toBe("verify");
  });

  it("contains Ray-Ban sent proof but not the completed analytics obligation", async () => {
    const snapshot = await loadAdminControlSnapshot(
      null,
      adminControlFixtureData,
    );

    expect(snapshot.events.map((event) => event.dedupe_key)).toContain(
      "gmail:sent:rayban-30-day-analytics-2026-07-08",
    );
    expect(JSON.stringify(snapshot)).not.toContain("message_id");
    expect(JSON.stringify(snapshot)).not.toContain("thread_id");
    expect(
      snapshot.projections.inbox_items.map((item) => item.item_id),
    ).not.toContain("inbox-rayban-analytics");
    expect(
      snapshot.projections.inbox_items.map((item) => item.item_id),
    ).toContain("inbox-rayban-payment-followup");
  });
});
