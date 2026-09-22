import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MARKS, isMarkId } from "@anipotts/brand/marks";
import eventsFixture from "../fixtures/ops_events_v1.synthetic.json";
import opsFixture from "../fixtures/ops_v1.sample.json";
import { OPS_MARKS, deviceMark, isGlyphKind } from "./marks";
import { OPS_DEVICES } from "./ops-events";
import {
  SYNCED_APPS,
  SYNC_JOBS,
  appCounts,
  appMark,
  countNoun,
  deviceName,
  displayName,
  hostDevice,
  keyLabel,
  opsNaming,
  recordNaming,
  sourceNaming,
  syncedApps,
  withoutOwner,
} from "./naming";

const ADMIN = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** The live catalog System served on 2026-09-22: ids and hosts only. */
const LIVE_CATALOG: Array<{ id: string; kind: string; host: string }> = [
  ["host.ap-mini", "host", "ap-mini"],
  ["health.api", "service", "ap-mini"],
  ["health.ingest", "job", "ap-mini"],
  ["imessage.agent", "service", "ap-mini"],
  ["agents.sync", "job", "ap-mini"],
  ["keepalive.chatgpt", "job", "ap-mini"],
  ["keepalive.chrome-agent", "job", "ap-mini"],
  ["keepalive.onepassword-connect", "service", "ap-mini"],
  ["pc.browser", "service", "ap-mini"],
  ["pc.writer", "job", "ap-mini"],
  ["pc.inference", "job", "ap-mini"],
  ["pc.snapshot", "backup", "ap-mini"],
  ["pc.reader", "service", "ap-mini"],
  ["ops.sampler", "job", "ap-mini"],
  ["transcripts.upload", "backup", "ap-mini"],
  ["content.d1-export", "backup", "ap-mini"],
  ["host.ap-pro", "host", "ap-pro"],
  ["pro.lake-backup", "backup", "ap-pro"],
  ["pro.transcripts", "backup", "ap-pro"],
  ["pro.voicememos", "job", "ap-pro"],
  ["pro.whatsapp", "job", "ap-pro"],
  ["pro.pc-send", "job", "ap-pro"],
].map(([id, kind, host]) => ({ id: id!, kind: kind!, host: host! }));

/** A developer's local copy of the live payloads (`.local/` is ignored and
 * never committed), when one exists. */
function replay<T>(name: string): T | null {
  const path = join(ADMIN, ".local/replay", name);
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as T)
    : null;
}
type Catalog = {
  catalog: Array<{ id: string; name: string; kind: string; host: string }>;
};
type Events = {
  items: Array<{ kind: string; subject: string; device?: string | null }>;
};

describe("live catalog guard", () => {
  const catalog = [
    ...LIVE_CATALOG.map((entry) => ({ ...entry, name: entry.id })),
    ...opsFixture.catalog,
    ...(replay<Catalog>("ops_v1.json")?.catalog ?? []),
  ];
  const events: Events["items"] = [
    ...eventsFixture.items,
    ...(replay<Events>("ops_events_v1.json")?.items ?? []),
  ];

  it("resolves every catalog id to its own tile and a device", () => {
    for (const entry of catalog) {
      const naming = opsNaming(entry);
      if (entry.kind === "host") {
        expect(naming.tile.id, entry.id).toBe(entry.host);
        expect(MARKS[naming.tile.id as "ap-mini"].kind, entry.id).toBe(
          "device",
        );
        continue;
      }
      expect(
        Object.hasOwn(OPS_MARKS, entry.id),
        `${entry.id} needs an OPS_MARKS row`,
      ).toBe(true);
      expect(
        naming.tile.id !== null || naming.tile.kind !== "unknown",
        entry.id,
      ).toBe(true);
      expect(naming.device?.id, entry.id).toBe(entry.host);
    }
  });

  it("resolves every event subject and device", () => {
    const ids = new Set(catalog.map((entry) => entry.id));
    for (const event of events) {
      if (event.kind === "access") {
        const device = event.device ?? null;
        if (device === null) continue;
        expect(OPS_DEVICES as readonly string[], device).toContain(device);
        const tile = deviceMark(device);
        expect(tile.id !== null || isGlyphKind(tile.kind), device).toBe(true);
      } else {
        expect(
          ids.has(event.subject),
          `${event.subject} is not in the catalog`,
        ).toBe(true);
      }
    }
    for (const device of OPS_DEVICES) {
      const tile = hostDevice(device);
      if (device === "loopback" || device === "other") expect(tile).toBeNull();
      else expect(tile?.id, device).toBe(device);
    }
  });
});

describe("names", () => {
  it("drops the owner's name from the front of a label", () => {
    expect(withoutOwner("Ani browsing")).toBe("browsing");
    expect(withoutOwner("ani-messages-1to1")).toBe("messages-1to1");
    expect(withoutOwner("Ani's notes")).toBe("notes");
    expect(withoutOwner("Animal notes")).toBe("Animal notes");
    expect(withoutOwner("ani")).toBe("ani");
    expect(displayName("Ani browsing")).toBe("Browsing");
  });

  it("names ops entries by tile, device and short name", () => {
    const named = Object.fromEntries(
      LIVE_CATALOG.map((entry) => {
        const name = (opsFixture.catalog.find((row) => row.id === entry.id)
          ?.name ??
          {
            "content.d1-export": "content database export",
            "pro.lake-backup": "old lake backup",
            "pro.transcripts": "pro session transcripts to R2",
            "pro.voicememos": "voice memos mirror",
            "pro.whatsapp": "whatsapp sync",
            "pro.pc-send": "pro intake and offsite upload",
            "transcripts.upload": "session transcripts to R2",
            "host.ap-pro": "ap-pro",
          }[entry.id])!;
        const naming = opsNaming({ ...entry, name });
        return [
          entry.id,
          [
            naming.tile.id ?? naming.tile.kind,
            naming.device?.id ?? null,
            naming.name,
          ],
        ];
      }),
    );
    expect(named).toEqual({
      "host.ap-mini": ["ap-mini", null, "ap-mini"],
      "health.api": ["health", "ap-mini", "Health API"],
      "health.ingest": ["applehealth", "ap-mini", "Data received"],
      "imessage.agent": ["messages", "ap-mini", "Agent"],
      "agents.sync": ["claude", "ap-mini", "Agent config sync"],
      "keepalive.chatgpt": ["chatgpt", "ap-mini", "Session"],
      "keepalive.chrome-agent": ["chrome", "ap-mini", "Agent profile"],
      "keepalive.onepassword-connect": ["1password", "ap-mini", "Connect"],
      "pc.browser": ["browser", "ap-mini", "Personal context browser"],
      "pc.writer": ["writer", "ap-mini", "Personal context writer"],
      "pc.inference": ["inference", "ap-mini", "Nightly inference"],
      "pc.snapshot": ["snapshot", "ap-mini", "Daily snapshot"],
      "pc.reader": ["tailscale", "ap-mini", "Admin reader"],
      "ops.sampler": ["sampler", "ap-mini", "Ops sampler"],
      "transcripts.upload": [
        "cloudflare",
        "ap-mini",
        "Session transcripts to R2",
      ],
      "content.d1-export": ["lexar", "ap-mini", "Content database export"],
      "host.ap-pro": ["ap-pro", null, "ap-pro"],
      "pro.lake-backup": ["cloudflare", "ap-pro", "Old lake backup"],
      "pro.transcripts": ["cloudflare", "ap-pro", "Session transcripts to R2"],
      "pro.voicememos": ["voicememos", "ap-pro", "Mirror"],
      "pro.whatsapp": ["whatsapp", "ap-pro", "Sync"],
      "pro.pc-send": ["handoff", "ap-pro", "Intake and offsite upload"],
    });
    const chatgpt = opsNaming({
      id: "keepalive.chatgpt",
      name: "chatgpt session",
    });
    expect(chatgpt.tooltip).toBe("keepalive.chatgpt");
  });

  it("names sources without the owner, the brand or the separators", () => {
    const read = (id: string, host?: string) => {
      const naming = sourceNaming({ id, host });
      return [
        naming.tile.id ?? naming.tile.kind,
        naming.device?.id ?? null,
        naming.name,
        naming.tooltip,
      ];
    };
    expect(read("ani-browsing", "ap-pro")).toEqual([
      "browser",
      "ap-pro",
      "Browsing",
      "ani-browsing",
    ]);
    // Stripping the brand would leave only "1:1", so the id's name stays.
    expect(read("ani-messages-1to1")).toEqual([
      "messages",
      null,
      "Messages 1:1",
      "ani-messages-1to1",
    ]);
    expect(read("ani-voice-memos")).toEqual([
      "voicememos",
      null,
      "Voice Memos",
      "ani-voice-memos",
    ]);
    expect(read("ani-github-ledger", "ap-mini")).toEqual([
      "github",
      "ap-mini",
      "Ledger",
      "ani-github-ledger",
    ]);
    expect(read("ani-contacts")).toEqual([
      "contacts",
      null,
      "Contacts",
      "ani-contacts",
    ]);
    expect(read("manual")).toEqual(["writer", null, "Manual", "manual"]);
    expect(read("notes-html-archive")).toEqual([
      "notes",
      null,
      "HTML archive",
      "notes-html-archive",
    ]);
    expect(read("connection-graph", "cloudflare")).toEqual([
      "source",
      null,
      "Connection graph",
      "connection-graph",
    ]);
  });

  it("credits Apple Health only to a health source System says the phone pushes", () => {
    // ani-health held seeded vitals: its id never names Apple.
    const seeded = sourceNaming({ id: "ani-health" });
    expect(seeded.tile).toEqual({ id: null, kind: "health" });
    expect(seeded.name).toBe("Health");
    expect(
      sourceNaming({ id: "health-provider", connector: "health" }).tile.id,
    ).toBeNull();
    expect(
      sourceNaming({
        id: "ani-health",
        connector: "health",
        transport: "launchd",
      }).tile.id,
    ).toBeNull();
    const phone = sourceNaming({
      id: "phone-health-export",
      connector: "health",
      transport: "push",
    });
    expect(phone.tile.id).toBe("applehealth");
  });

  it("names a browsing day by its browser, its day and its device", () => {
    const now = Date.parse("2026-09-22T18:00:00Z");
    const day = recordNaming(
      {
        id: "rec_browsing_0922",
        title: "Browsing 2026-09-22",
        source: "ani-browsing",
        metadata: { browser_visits: { chrome: 44, safari: 3 }, host: "ap-pro" },
      },
      now,
    );
    expect(day).toEqual({
      name: "Browsing, Sep 22",
      tile: { id: "chrome", kind: "browser" },
      device: { id: "ap-pro", kind: "device" },
      tooltip: "rec_browsing_0922",
    });
    const old = recordNaming(
      {
        id: "r",
        title: "Ani notes 2025-03-01 review",
        source: "synthetic-notes",
      },
      now,
    );
    expect(old.name).toBe("notes Mar 1, 2025 review");
    expect(old.tile.id).toBe("notes");
    expect(old.device).toBeNull();
    expect(recordNaming({ id: "r", title: null, source: null }).name).toBe(
      "Untitled",
    );
  });

  it("names devices", () => {
    expect(deviceName("ap-phone")).toBe("ap-phone");
    expect(deviceName("loopback")).toBe("Local");
    expect(deviceName("other")).toBe("Other device");
    expect(deviceName(null)).toBe("Unknown device");
    expect(hostDevice("cloudflare")).toBeNull();
  });

  it("gives a job on an unknown host (OpsHost other) no device tile", () => {
    const naming = opsNaming({
      id: "lab.job",
      name: "lab job",
      kind: "job",
      host: "other",
    });
    expect(naming.device).toBeNull();
    expect(naming.tooltip).toBe("lab.job");
  });
});

describe("apps", () => {
  it("resolves app keys and counts them largest first", () => {
    expect(appMark("chrome")).toBe("chrome");
    expect(appMark("atlas")).toBe("chatgpt-atlas");
    expect(appMark("Voice Memos")).toBe("voicememos");
    expect(appMark("imessage")).toBe("messages");
    expect(appMark("ap-pro")).toBeNull();
    expect(appMark("firefox")).toBeNull();
    expect(appMark("x")).toBeNull();
    expect(appMark("github")).toBe("github");
    expect(appCounts({ safari: 3, chrome: 44, firefox: 2, bad: "x" })).toEqual([
      { key: "chrome", id: "chrome", count: 44 },
      { key: "safari", id: "safari", count: 3 },
      { key: "firefox", id: null, count: 2 },
    ]);
    expect(appCounts([1, 2])).toEqual([]);
  });

  it("labels keys and finds their count noun", () => {
    expect(keyLabel("browser_visits")).toBe("Browser visits");
    expect(keyLabel("source_url")).toBe("Source URL");
    expect(countNoun("browser_visits")).toEqual(["visit", "visits"]);
    expect(countNoun("categories")).toEqual(["category", "categories"]);
    expect(countNoun("domain_count")).toBeNull();
    expect(countNoun("access")).toBeNull();
  });

  it("maps syncs to apps, first app as the tile", () => {
    for (const [id, apps] of Object.entries(SYNCED_APPS)) {
      expect(Object.hasOwn(OPS_MARKS, id), id).toBe(true);
      for (const app of apps) {
        expect(isMarkId(app), app).toBe(true);
        expect(MARKS[app].kind, app).toBe("app");
      }
    }
    expect(syncedApps("pro.whatsapp")).toEqual(["whatsapp"]);
    // Its receipt proves a pass, not that any one app's data arrived.
    expect(syncedApps("pro.pc-send")).toBeNull();
    expect(SYNC_JOBS).toEqual(["pro.pc-send"]);
    expect(syncedApps("health.ingest")).toEqual(["applehealth"]);
    expect(syncedApps("pc.writer")).toBeNull();
    expect(syncedApps("constructor")).toBeNull();
  });
});
