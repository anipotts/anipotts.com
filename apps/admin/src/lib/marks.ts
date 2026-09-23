/**
 * Admin names to marks. Every ops id, device, data source and link host the
 * admin shows maps to a brand mark from `@anipotts/brand/marks`, or to a named
 * Phosphor glyph when the thing has no brand (or its official mark is not
 * vendored yet). `BrandTile` renders either in the same tile.
 *
 * The tables are exact: a new id that should carry a brand gets a row here and
 * an exact-key test, rather than being guessed from its spelling. Only data
 * source ids and link hosts fall back to word and domain matching, since those
 * arrive from outside with forms this file cannot list.
 */
import {
  brandMark,
  isMarkId,
  shortName,
  type MarkId,
} from "@anipotts/brand/marks";

export { shortName };

/** The Phosphor fallbacks a tile can draw, by name. The kind names come from
 * the ops contract; the rest name unbranded things in this admin. */
export const GLYPH_KINDS = [
  "agenda",
  "backup",
  "browser",
  "checkout",
  "desktop",
  "device",
  "handoff",
  "health",
  "host",
  "inference",
  "job",
  "key",
  "loopback",
  "sampler",
  "service",
  "snapshot",
  "source",
  "unknown",
  "web",
  "writer",
] as const;
export type GlyphKind = (typeof GLYPH_KINDS)[number];

/** What a tile draws: a brand mark when one resolves, otherwise the glyph. */
export type TileRef = { id: MarkId | null; kind: GlyphKind };

type Ref = MarkId | GlyphKind;

export function isGlyphKind(value: unknown): value is GlyphKind {
  return GLYPH_KINDS.includes(value as GlyphKind);
}

/** An own-key read, so "constructor" or "toString" never resolve. */
function lookup<T extends Record<string, Ref>>(
  table: T,
  key: string,
): Ref | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function tile(ref: Ref | undefined, fallback: GlyphKind): TileRef {
  if (ref === undefined) return { id: null, kind: fallback };
  return isMarkId(ref) ? { id: ref, kind: fallback } : { id: null, kind: ref };
}

/** The name a mark stands for, for a tooltip or accessible name. */
export function markLabel(ref: TileRef): string | null {
  return brandMark(ref.id)?.label ?? null;
}

/** ops_v1 catalog ids. Hosts resolve through `deviceMark`. A backup shows
 * where it lands; a sync or agent shows the app it serves. */
export const OPS_MARKS = {
  "agents.sync": "claude",
  // The D1 content export lands on the Lexar drive on ap-mini.
  "content.d1-export": "lexar",
  // Declared credentials and their expiry dates, of several providers.
  "cred.expiry": "key",
  "health.api": "health",
  // Apple Health data the phone pushes.
  "health.ingest": "applehealth",
  "imessage.agent": "messages",
  "keepalive.chatgpt": "chatgpt",
  "keepalive.chrome-agent": "chrome",
  "keepalive.onepassword-connect": "1password",
  "ops.sampler": "sampler",
  "pc.browser": "browser",
  "pc.inference": "inference",
  "pc.reader": "tailscale",
  // The key admin reader credentials are issued with.
  "pc.reader-key": "key",
  // Encrypted snapshot to the offsite remote; its provider is not settled.
  "pc.snapshot": "snapshot",
  // The personal context store's record count against its floor.
  "pc.store-floors": "source",
  "pc.writer": "writer",
  // The ~/System checkout on each Mac against origin/main.
  "pro.checkout": "checkout",
  // ap-pro's rclone sync to the memory-offsite remote on Cloudflare R2.
  "pro.lake-backup": "cloudflare",
  // ap-pro's intake to ap-mini: several apps, so the handoff glyph.
  "pro.pc-send": "handoff",
  "pro.transcripts": "cloudflare",
  "pro.voicememos": "voicememos",
  "pro.whatsapp": "whatsapp",
  "system.checkout": "checkout",
  // Session transcripts go to Cloudflare R2.
  "transcripts.upload": "cloudflare",
} as const satisfies Record<string, Ref>;

/** ops kinds, as the fallback when an id has no row. */
const OPS_KIND_GLYPHS = {
  backup: "backup",
  host: "host",
  job: "job",
  service: "service",
  web: "web",
} as const satisfies Record<string, GlyphKind>;

export function opsMark(entry: { id: string; kind?: string | null }): TileRef {
  const kind = lookup(OPS_KIND_GLYPHS, entry.kind ?? "");
  const fallback: GlyphKind = isGlyphKind(kind) ? kind : "unknown";
  if (entry.id.startsWith("host.")) {
    return tile(lookup(DEVICE_MARKS, entry.id.slice(5)), "host");
  }
  return tile(lookup(OPS_MARKS, entry.id), fallback);
}

/** Devices on access rows and ops hosts. */
export const DEVICE_MARKS = {
  "ap-alienware": "desktop",
  "ap-mini": "ap-mini",
  "ap-phone": "ap-phone",
  "ap-plus": "ap-plus",
  "ap-pro": "ap-pro",
  cloudflare: "cloudflare",
  loopback: "loopback",
  other: "device",
} as const satisfies Record<string, Ref>;

export function deviceMark(device: string | null | undefined): TileRef {
  return tile(lookup(DEVICE_MARKS, device ?? "other"), "device");
}

/** Data source ids and the operator-work providers, exactly. */
export const SOURCE_MARKS = {
  "apple.notes": "notes",
  "apple.voice_memos": "voicememos",
  "browser.history": "browser",
  chatgpt: "chatgpt",
  claude: "claude",
  "claude.native": "claude",
  codex: "codex",
  "codex.native": "codex",
  github: "github",
  handoff: "handoff",
  manual: "writer",
  // A health source is not Apple's unless System says it is the phone's
  // export (see sourceNaming); its id alone never credits Apple Health.
  "health.daily": "health",
} as const satisfies Record<string, Ref>;

/** Words inside other source ids ("apple.messages", "legacy.brain",
 * "ani-voice-memos"). The synthetic fixture's ids resolve through these
 * too, so no fixture id ships in the tables above. Google or Apple is not
 * settled for calendars, so they keep the neutral glyph. */
export const SOURCE_WORDS = {
  atlas: "chatgpt-atlas",
  browsing: "browser",
  calendar: "agenda",
  chatgpt: "chatgpt",
  chrome: "chrome",
  claude: "claude",
  codex: "codex",
  contacts: "contacts",
  drive: "googledrive",
  github: "github",
  gmail: "gmail",
  granola: "granola",
  health: "health",
  imessage: "messages",
  legacy: "backup",
  manual: "writer",
  memos: "voicememos",
  messages: "messages",
  notes: "notes",
  obsidian: "obsidian",
  safari: "safari",
  spotify: "spotify",
  voice: "voicememos",
  whatsapp: "whatsapp",
} as const satisfies Record<string, Ref>;

export function sourceMark(sourceId: string | null | undefined): TileRef {
  const id = (sourceId ?? "").toLowerCase();
  const exact = lookup(SOURCE_MARKS, id);
  if (exact) return tile(exact, "source");
  for (const word of id.split(/[^a-z0-9]+/)) {
    const ref = lookup(SOURCE_WORDS, word);
    if (ref) return tile(ref, "source");
  }
  return tile(undefined, "source");
}

/** Link hosts. A subdomain resolves through its parent ("www.npmjs.com",
 * "ap-mini.tail060490.ts.net"). */
export const LINK_MARKS = {
  "1password.com": "1password",
  "buttondown.com": "buttondown",
  "buttondown.email": "buttondown",
  "calendar.google.com": "googlecalendar",
  "chatgpt.com": "chatgpt",
  "claude.ai": "claude",
  "cloudflare.com": "cloudflare",
  "drive.google.com": "googledrive",
  "github.com": "github",
  "granola.ai": "granola",
  "instagram.com": "instagram",
  "lexar.com": "lexar",
  "linear.app": "linear",
  "linkedin.com": "linkedin",
  "mail.google.com": "gmail",
  "mercury.com": "mercury",
  "npmjs.com": "npm",
  "obsidian.md": "obsidian",
  "pages.dev": "cloudflare",
  "resend.com": "resend",
  "spotify.com": "spotify",
  "stripe.com": "stripe",
  "tailscale.com": "tailscale",
  "ts.net": "tailscale",
  "twitter.com": "x",
  "vercel.app": "vercel",
  "vercel.com": "vercel",
  "wa.me": "whatsapp",
  "whatsapp.com": "whatsapp",
  "workers.dev": "cloudflare",
  "x.com": "x",
  "youtu.be": "youtube",
  "youtube.com": "youtube",
} as const satisfies Record<string, Ref>;

export function linkMark(href: string | null | undefined): TileRef {
  let host: string;
  try {
    host = new URL(href ?? "").hostname.toLowerCase();
  } catch {
    return tile(undefined, "web");
  }
  const labels = host.split(".");
  for (let start = 0; start < labels.length - 1; start += 1) {
    const ref = lookup(LINK_MARKS, labels.slice(start).join("."));
    if (ref) return tile(ref, "web");
  }
  return tile(undefined, "web");
}
