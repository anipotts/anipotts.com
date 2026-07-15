import { describe, expect, it } from "vitest";
import {
  ADMIN_EVENT_SCHEMA_VERSION,
  adminMcpManifest,
  buildSentMailAwareness,
  buildSentMailMetadata,
  gmailSentDedupeKey,
  handleAdminMcpRequest,
  loadAdminControlSnapshot,
  type AdminControlDatabase,
} from "./index";

describe("admin-control", () => {
  it("loads fixture projections with schema version and event refs", async () => {
    const snapshot = await loadAdminControlSnapshot(null);

    expect(snapshot.schema_version).toBe(ADMIN_EVENT_SCHEMA_VERSION);
    expect(snapshot.source_mode).toBe("fixture");
    expect(snapshot.projections.inbox_items.length).toBeGreaterThan(0);
    expect(snapshot.projections.project_states.length).toBeGreaterThan(0);
    expect(snapshot.projections.task_states.length).toBeGreaterThan(0);
    expect(snapshot.projections.task_lineage.length).toBeGreaterThan(0);
    expect(
      snapshot.projections.inbox_items[0]?.event_refs.length,
    ).toBeGreaterThan(0);
    expect(snapshot.retention.payload_store).toBe("r2");
  });

  it("extends inbox cards with domain, entity ref, and attention kind", async () => {
    const snapshot = await loadAdminControlSnapshot(null);
    const card = snapshot.projections.inbox_items.find(
      (item) => item.item_id === "inbox-admin-contract-review",
    );

    expect(snapshot.contracts.inbox_card_fields).toEqual(
      expect.arrayContaining(["domain", "entity_ref", "attention_kind"]),
    );
    expect(card?.domain).toBe("admin");
    expect(card?.entity_ref).toBe("admin-control:event-api-mcp-contract");
    expect(card?.attention_kind).toBe("review");
    expect(card?.event_refs).toEqual(["evt-admin-contract-2026-07-02"]);
  });

  it("keeps lifecycle, attention, and native runtime status separate", async () => {
    const snapshot = await loadAdminControlSnapshot(null);
    const project = snapshot.projections.project_states.find(
      (item) => item.project_id === "project-admin-control-plane",
    );
    const task = snapshot.projections.task_states.find(
      (item) => item.task_id === "task-admin-work-core-contract",
    );

    expect(snapshot.contracts.project_state_fields).toEqual(
      expect.arrayContaining([
        "lifecycle",
        "attention_kind",
        "native_runtime_status",
        "agent_source",
      ]),
    );
    expect(project?.lifecycle).toBe("active");
    expect(project?.attention_kind).toBe("review");
    expect(project?.native_runtime_status).toBe("deployed");
    expect(task?.agent_source).toBe("codex");
  });

  it("keeps task lineage resolvable to task states", async () => {
    const snapshot = await loadAdminControlSnapshot(null);
    const taskIds = new Set(
      snapshot.projections.task_states.map((item) => item.task_id),
    );

    for (const lineage of snapshot.projections.task_lineage) {
      expect(taskIds.has(lineage.task_ref)).toBe(true);
      expect(taskIds.has(lineage.root_task_ref)).toBe(true);
      if (lineage.parent_task_ref) {
        expect(taskIds.has(lineage.parent_task_ref)).toBe(true);
      }
      expect(lineage.agent_source.length).toBeGreaterThan(0);
      expect(lineage.event_refs.length).toBeGreaterThan(0);
    }
  });

  it("keeps checkpoint out of the piece statechart", async () => {
    const snapshot = await loadAdminControlSnapshot(null);

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
    expect(snapshot.projections.project_states).toEqual([]);
    expect(snapshot.projections.task_states).toEqual([]);
    expect(snapshot.projections.task_lineage).toEqual([]);
    expect(snapshot.errors).toEqual([]);
  });

  it("dedupes live rows before rebuilding projections", async () => {
    const db: AdminControlDatabase = {
      prepare(query: string) {
        return {
          bind() {
            return this;
          },
          async all<T = unknown>() {
            let rows: unknown[] = [];
            if (query.includes("FROM admin_events")) {
              rows = [
                fixtureEventRow("first duplicate"),
                fixtureEventRow("second duplicate"),
              ];
            } else if (query.includes("FROM admin_inbox_items")) {
              rows = [
                fixtureInboxRow("duplicate inbox"),
                fixtureInboxRow("latest duplicate inbox"),
              ];
            }
            return { results: rows as T[] };
          },
        };
      },
    };

    const snapshot = await loadAdminControlSnapshot(db);

    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.title).toBe("second duplicate");
    expect(snapshot.projections.inbox_items).toHaveLength(1);
    expect(snapshot.projections.inbox_items[0]?.title).toBe(
      "latest duplicate inbox",
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
    expect(snapshot.projections.project_states).toEqual([]);
    expect(snapshot.projections.task_states).toEqual([]);
    expect(snapshot.projections.task_lineage).toEqual([]);
    expect(snapshot.errors.length).toBeGreaterThan(0);
    expect(snapshot.errors.join(" ")).toContain("read unavailable");
  });

  it("exposes read-only mcp tools over the same projections", async () => {
    const snapshot = await loadAdminControlSnapshot(null);
    const manifest = adminMcpManifest(snapshot);

    expect(manifest.write_tools).toBe(
      "disabled-until-broker-and-signed-connect-diff",
    );

    const response = handleAdminMcpRequest(snapshot, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "admin.get_projection",
        arguments: { projection: "inbox_items" },
      },
    });

    expect(JSON.stringify(response)).toContain("inbox-admin-contract-review");
  });

  it("exposes project, task, and lineage api/mcp parity projections", async () => {
    const snapshot = await loadAdminControlSnapshot(null);
    const manifest = adminMcpManifest(snapshot);

    expect(manifest.resources).toEqual(
      expect.arrayContaining([
        "admin://projections/project_states",
        "admin://projections/task_states",
        "admin://projections/task_lineage",
      ]),
    );
    expect(manifest.tools).toEqual(
      expect.arrayContaining([
        "admin.get_projects",
        "admin.get_tasks",
        "admin.get_task_lineage",
      ]),
    );

    const projectionResponse = handleAdminMcpRequest(snapshot, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "admin.get_projection",
        arguments: { projection: "project_states" },
      },
    });
    const directToolResponse = handleAdminMcpRequest(snapshot, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "admin.get_projects",
        arguments: {},
      },
    });
    const resourceResponse = handleAdminMcpRequest(snapshot, {
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
      params: {
        uri: "admin://projections/project_states",
      },
    });

    expect(JSON.stringify(projectionResponse)).toContain(
      "project-admin-control-plane",
    );
    expect(JSON.stringify(directToolResponse)).toContain(
      "project-admin-control-plane",
    );
    expect(JSON.stringify(resourceResponse)).toContain(
      "project-admin-control-plane",
    );
  });

  it("keeps transcript and tool-output payloads out of the core contract", async () => {
    const snapshot = await loadAdminControlSnapshot(null);
    const serialized = JSON.stringify(snapshot).toLowerCase();

    for (const unsafe of [
      "tool_output",
      "tool output",
      "transcript_body",
      "full_transcript",
      "message_id",
      "thread_id",
      "recipients",
      "snippet",
    ]) {
      expect(serialized).not.toContain(unsafe);
    }
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
    expect(awareness.inbox_item?.domain).toBe("mail");
    expect(awareness.inbox_item?.entity_ref).toBe(
      "gmail:sent:rayban-30-day-analytics-2026-07-08",
    );
    expect(awareness.inbox_item?.attention_kind).toBe("waiting");
  });

  it("contains Ray-Ban sent proof but not the completed analytics obligation", async () => {
    const snapshot = await loadAdminControlSnapshot(null);

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

function fixtureEventRow(title: string) {
  return {
    schema_version: 1,
    event_id: `evt-${title.replaceAll(" ", "-")}`,
    dedupe_key: "dedupe:duplicate-event",
    source: "fleet",
    provider: "admin",
    account: "admin.anipotts.com",
    actor: "codex",
    kind: "review.required",
    ts: "2026-07-15T00:00:00.000Z",
    privacy: "internal",
    title,
    summary: "duplicate event row",
    href: null,
    payload_ref: null,
    created_by: "codex",
  };
}

function fixtureInboxRow(title: string) {
  return {
    item_id: `inbox-${title.replaceAll(" ", "-")}`,
    dedupe_key: "dedupe:duplicate-inbox",
    event_refs: JSON.stringify(["evt-duplicate"]),
    domain: "fleet",
    entity_ref: "task:duplicate",
    attention_kind: "review",
    source: "fleet",
    account: "admin.anipotts.com",
    title,
    summary: "duplicate inbox row",
    href: "/api/admin/projections",
    status: "review",
    urgency: "normal",
    owner: "chief/infra",
    action_kind: "review",
    expires_at: null,
    last_seen_at: null,
  };
}
