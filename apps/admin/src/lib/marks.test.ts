import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MARKS,
  MARK_FILES,
  MARK_IDS,
  MARK_SPRITE,
  brandMark,
  isMarkId,
  shortName,
} from "@anipotts/brand/marks";
import {
  buildMarks,
  HIDDEN_SIMPLE_ICONS,
  sourceProblems,
} from "../../../../scripts/brand/build-marks.mjs";
import dataFixture from "../fixtures/data_v1.synthetic.json";
import eventsFixture from "../fixtures/ops_events_v1.synthetic.json";
import opsFixture from "../fixtures/ops_v1.sample.json";
import { OPS_DEVICES } from "./ops-events";
import { OPS_V1_HOSTS } from "./ops-v1";
import {
  DEVICE_MARKS,
  GLYPH_KINDS,
  LINK_MARKS,
  OPS_MARKS,
  SOURCE_MARKS,
  SOURCE_WORDS,
  deviceMark,
  isGlyphKind,
  linkMark,
  markLabel,
  opsMark,
  sourceMark,
} from "./marks";

const ADMIN_SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = join(ADMIN_SRC, "../../..");

describe("brand mark registry", () => {
  it("lists exactly the vendored marks", () => {
    expect(MARK_IDS).toEqual([
      "1password",
      "ap-mini",
      "ap-phone",
      "ap-plus",
      "ap-pro",
      "buttondown",
      "calendar",
      "chatgpt",
      "chrome",
      "claude",
      "cloudflare",
      "codex",
      "contacts",
      "github",
      "gmail",
      "googlecalendar",
      "googledrive",
      "granola",
      "instagram",
      "lexar",
      "linear",
      "linkedin",
      "mercury",
      "messages",
      "notes",
      "npm",
      "obsidian",
      "resend",
      "safari",
      "spotify",
      "stripe",
      "tailscale",
      "vercel",
      "voicememos",
      "whatsapp",
      "x",
      "youtube",
    ]);
  });

  it("gives every sprite glyph a brand colour and every black one a dark ink", () => {
    for (const mark of Object.values(MARKS)) {
      if (mark.art.type !== "symbol") {
        expect(mark.color, mark.id).toBeUndefined();
        continue;
      }
      expect(mark.fit, mark.id).toBe("glyph");
      expect(mark.color, mark.id).toMatch(/^#[0-9A-F]{6}$/);
      const black = ["#000000", "#181717"].includes(mark.color ?? "");
      expect(mark.dark, mark.id).toBe(black ? "#EEF0F4" : undefined);
    }
  });

  it("renders devices edge to edge in their shared box", () => {
    const devices = MARK_IDS.filter((id) => MARKS[id].kind === "device");
    expect(devices).toEqual(["ap-mini", "ap-phone", "ap-plus", "ap-pro"]);
    for (const id of devices) {
      expect(MARKS[id].fit).toBe("fill");
      expect(MARKS[id].art.type).toBe("raster");
    }
  });

  it("serves artwork as files, never as inline data", () => {
    expect(MARK_SPRITE).toMatch(/sprite[^/]*\.svg(?:\?[^/]*)?$/);
    for (const set of Object.values(MARK_FILES))
      for (const url of Object.values(set)) {
        expect(url).not.toMatch(/^data:/);
        expect(url).toMatch(/\.(?:webp|png|svg)(?:\?[^/]*)?$/);
      }
  });

  it("matches the vendored files, the sprite and the ledger", async () => {
    const { problems } = await buildMarks({ check: true });
    expect(problems).toEqual([]);
  });

  it("rejects a hidden simple-icons id and a file without provenance", () => {
    const ledger = [
      "## Sources",
      "",
      "| mark | source | retrieved | source sha256 |",
      "| --- | --- | --- | --- |",
      `| linkedin | \`simple-icons@16.32.0\` \`icons/linkedin.svg\` | 2026-09-21 | \`${"a".repeat(64)}\` |`,
    ].join("\n");
    expect(HIDDEN_SIMPLE_ICONS).toEqual([
      "linkedin",
      "microsoft",
      "openai",
      "sandisk",
      "slack",
      "windows",
    ]);
    expect(sourceProblems(ledger, ["linkedin", "github"])).toEqual([
      "linkedin uses the hidden simple-icons id linkedin; use the owner's kit",
      "github has no source row in MARKS.md",
    ]);
  });

  it("drops the brand word the tile already says", () => {
    expect(shortName("1password connect", "1password")).toBe("Connect");
    expect(shortName("chatgpt session", "chatgpt")).toBe("Session");
    expect(shortName("chrome agent profile", "chrome")).toBe("Agent profile");
    expect(shortName("imessage agent", "messages")).toBe("Agent");
    expect(shortName("claude code transcripts", "claude")).toBe("Transcripts");
    expect(shortName("messages", "messages")).toBe("Messages");
    expect(shortName("ops sampler", null)).toBe("ops sampler");
    expect(shortName("github-actions", "github")).toBe("github-actions");
  });
});

describe("admin mark maps", () => {
  it("never names a glyph like a mark", () => {
    for (const kind of GLYPH_KINDS) expect(isMarkId(kind), kind).toBe(false);
  });

  it.each([
    ["OPS_MARKS", OPS_MARKS],
    ["DEVICE_MARKS", DEVICE_MARKS],
    ["SOURCE_MARKS", SOURCE_MARKS],
    ["SOURCE_WORDS", SOURCE_WORDS],
    ["LINK_MARKS", LINK_MARKS],
  ] as const)("%s points only at marks and glyphs", (_, table) => {
    for (const [key, ref] of Object.entries(table))
      expect(isMarkId(ref) || isGlyphKind(ref), key).toBe(true);
  });

  it("maps exactly the ops ids", () => {
    expect(Object.keys(OPS_MARKS).sort()).toEqual([
      "agents.sync",
      "health.api",
      "health.ingest",
      "imessage.agent",
      "keepalive.chatgpt",
      "keepalive.chrome-agent",
      "keepalive.onepassword-connect",
      "ops.sampler",
      "pc.browser",
      "pc.inference",
      "pc.reader",
      "pc.snapshot",
      "pc.writer",
      "transcripts.upload",
    ]);
  });

  it("maps exactly the devices and hosts", () => {
    expect(Object.keys(DEVICE_MARKS).sort()).toEqual([
      "ap-alienware",
      "ap-mini",
      "ap-phone",
      "ap-plus",
      "ap-pro",
      "cloudflare",
      "loopback",
      "other",
    ]);
  });

  it("maps exactly the source ids and words", () => {
    expect(Object.keys(SOURCE_MARKS).sort()).toEqual([
      "apple.notes",
      "apple.voice_memos",
      "browser.history",
      "chatgpt",
      "claude",
      "claude.native",
      "codex",
      "codex.native",
      "github",
      "handoff",
      "health.daily",
      "synthetic-calendar",
      "synthetic-contacts",
      "synthetic-health",
      "synthetic-notes",
    ]);
    expect(Object.keys(SOURCE_WORDS).sort()).toEqual([
      "calendar",
      "chrome",
      "contacts",
      "drive",
      "github",
      "gmail",
      "granola",
      "health",
      "imessage",
      "legacy",
      "messages",
      "notes",
      "obsidian",
      "safari",
      "spotify",
      "whatsapp",
    ]);
  });

  it("maps exactly the link hosts", () => {
    expect(Object.keys(LINK_MARKS).sort()).toEqual([
      "1password.com",
      "buttondown.com",
      "buttondown.email",
      "calendar.google.com",
      "chatgpt.com",
      "claude.ai",
      "cloudflare.com",
      "drive.google.com",
      "github.com",
      "granola.ai",
      "instagram.com",
      "lexar.com",
      "linear.app",
      "linkedin.com",
      "mail.google.com",
      "mercury.com",
      "npmjs.com",
      "obsidian.md",
      "pages.dev",
      "resend.com",
      "spotify.com",
      "stripe.com",
      "tailscale.com",
      "ts.net",
      "twitter.com",
      "vercel.app",
      "vercel.com",
      "wa.me",
      "whatsapp.com",
      "workers.dev",
      "x.com",
      "youtu.be",
      "youtube.com",
    ]);
  });

  it("resolves every fixture ops id to its own mark or glyph", () => {
    const ids = new Set(opsFixture.catalog.map((entry) => entry.id));
    for (const item of eventsFixture.items)
      if (item.kind === "transition") ids.add(item.subject);
    for (const entry of opsFixture.catalog) {
      const tile = opsMark(entry);
      if (entry.id.startsWith("host.")) {
        expect(tile.id, entry.id).toBe(entry.host);
      } else {
        expect(Object.hasOwn(OPS_MARKS, entry.id), entry.id).toBe(true);
        expect(tile.kind === "unknown" && tile.id === null, entry.id).toBe(
          false,
        );
      }
    }
    for (const id of ids)
      expect(
        Object.hasOwn(OPS_MARKS, id) || id.startsWith("host."),
        `${id} needs an OPS_MARKS row`,
      ).toBe(true);
  });

  it("resolves every device and ops host", () => {
    for (const device of [...OPS_DEVICES, ...OPS_V1_HOSTS])
      expect(Object.hasOwn(DEVICE_MARKS, device), device).toBe(true);
    expect(deviceMark("ap-mini")).toEqual({ id: "ap-mini", kind: "device" });
    expect(deviceMark("ap-phone").id).toBe("ap-phone");
    expect(deviceMark("loopback")).toEqual({ id: null, kind: "loopback" });
    expect(deviceMark(null)).toEqual({ id: null, kind: "device" });
    expect(opsMark({ id: "host.ap-pro", kind: "host" }).id).toBe("ap-pro");
    expect(opsMark({ id: "host.unknown", kind: "host" })).toEqual({
      id: null,
      kind: "host",
    });
  });

  it("resolves every fixture data source exactly", () => {
    const sources = new Set<string>();
    for (const source of dataFixture.sources) sources.add(source.source_id);
    for (const record of dataFixture.records) sources.add(record.source_id);
    for (const card of [
      ...dataFixture.extras.health,
      ...dataFixture.extras.knowledge,
    ])
      sources.add(card.source);
    for (const source of sources)
      expect(Object.hasOwn(SOURCE_MARKS, source), source).toBe(true);
  });

  it("falls back by kind and never resolves inherited keys", () => {
    expect(opsMark({ id: "weather.daily", kind: "job" })).toEqual({
      id: null,
      kind: "job",
    });
    expect(opsMark({ id: "toString", kind: "constructor" })).toEqual({
      id: null,
      kind: "unknown",
    });
    expect(sourceMark("constructor")).toEqual({ id: null, kind: "source" });
    expect(sourceMark("apple.messages").id).toBe("messages");
    expect(sourceMark("legacy.brain")).toEqual({ id: null, kind: "backup" });
    expect(deviceMark("__proto__")).toEqual({ id: null, kind: "device" });
  });

  it("resolves link hosts by domain boundary", () => {
    expect(linkMark("https://github.com/anipotts/anipotts.com").id).toBe(
      "github",
    );
    expect(linkMark("https://www.npmjs.com/package/x").id).toBe("npm");
    expect(linkMark("https://demo.vercel.app").id).toBe("vercel");
    expect(linkMark("https://ap-mini.tail060490.ts.net/v1").id).toBe(
      "tailscale",
    );
    expect(linkMark("https://evil-github.com")).toEqual({
      id: null,
      kind: "web",
    });
    expect(linkMark("not a url")).toEqual({ id: null, kind: "web" });
    expect(linkMark("https://anipotts.com")).toEqual({ id: null, kind: "web" });
  });

  it("labels a mark by its brand", () => {
    expect(markLabel(opsMark({ id: "keepalive.onepassword-connect" }))).toBe(
      "1Password",
    );
    expect(markLabel(sourceMark("handoff"))).toBeNull();
    expect(brandMark("voicememos")?.label).toBe("Voice Memos");
  });
});

describe("mark guards", () => {
  const files = collect(ADMIN_SRC).concat(
    collect(join(REPO, "packages/brand/src")),
  );

  it("never imports a Phosphor redraw of a brand", () => {
    const offenders = files.filter((file) => {
      if (![".ts", ".tsx", ".astro"].includes(extname(file))) return false;
      const source = readFileSync(file, "utf8");
      const phosphor = [
        ...source.matchAll(
          /import\s*\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react[^"']*["']/g,
        ),
      ].flatMap((match) => match[1].split(","));
      return (
        phosphor.some((name) =>
          /Logo(?:Icon)?\s*(?:as\s+\w+)?\s*$/.test(name),
        ) || /["']ph:[a-z-]*-logo["']/.test(source)
      );
    });
    expect(offenders.map((file) => relative(REPO, file))).toEqual([]);
  });

  it("never rounds a mark into a circle", () => {
    const circle =
      /border-radius:\s*(?:50%|9999px|999px|var\(--radius-full[^)]*\))/;
    const markSelector =
      /mark|tile|logo|glyph|icon|provider|brand|avatar|source/i;
    const offenders: string[] = [];
    for (const file of files) {
      if (extname(file) === ".css") {
        const source = readFileSync(file, "utf8");
        for (const [, selector, body] of source.matchAll(
          /([^{}]+)\{([^{}]*)\}/g,
        ))
          if (markSelector.test(selector) && circle.test(body))
            offenders.push(`${relative(REPO, file)}: ${selector.trim()}`);
      } else if ([".ts", ".tsx"].includes(extname(file))) {
        const source = readFileSync(file, "utf8");
        if (/borderRadius:\s*["'](?:50%|9999px)["']/.test(source))
          offenders.push(relative(REPO, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

function collect(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return [path];
  });
}
