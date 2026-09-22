/**
 * The brand mark registry: every brand, app and device mark, with the name it
 * stands for, how it sits in a tile and where its artwork lives. Artwork is
 * vendored in `packages/brand/marks` with its provenance in `MARKS.md`; the
 * URLs come from `marks.generated.ts`, so a mark is fetched only when a page
 * shows it and never inlined into a bundle.
 */
import { MARK_FILES, MARK_GLYPHS, MARK_SPRITE } from "./marks.generated";

export { MARK_FILES, MARK_GLYPHS, MARK_SPRITE };

/** `fill`: the artwork is the tile (an app plate or a device render).
 * `glyph`: the artwork sits inside the neutral tile at glyph size. */
export type MarkFit = "fill" | "glyph";
export type MarkKind = "app" | "brand" | "device";

type Entry = {
  /** The name the mark stands for: its tooltip and accessible name. */
  label: string;
  kind: MarkKind;
  fit: MarkFit;
  /** Sprite glyphs only: the brand colour, and the dark-theme swap black
   * brands need to stay visible. */
  color?: string;
  dark?: string;
  /** Lowercase words a row can drop because the tile already says them.
   * The label, lowercased, is always one. */
  aliases?: readonly string[];
};

/** Black brands switch to the dark theme's primary ink. */
const INK_DARK = "#EEF0F4";

const ENTRIES = {
  "1password": {
    label: "1Password",
    kind: "app",
    fit: "fill",
    aliases: ["onepassword"],
  },
  "ap-mini": { label: "ap-mini", kind: "device", fit: "fill" },
  "ap-phone": { label: "ap-phone", kind: "device", fit: "fill" },
  "ap-plus": { label: "ap-plus", kind: "device", fit: "fill" },
  "ap-pro": { label: "ap-pro", kind: "device", fit: "fill" },
  buttondown: {
    label: "Buttondown",
    kind: "brand",
    fit: "glyph",
    color: "#0069FF",
  },
  calendar: { label: "Calendar", kind: "app", fit: "fill" },
  chatgpt: {
    label: "ChatGPT",
    kind: "app",
    fit: "fill",
    aliases: ["openai"],
  },
  chrome: {
    label: "Chrome",
    kind: "app",
    fit: "glyph",
    aliases: ["google chrome"],
  },
  claude: {
    label: "Claude",
    kind: "app",
    fit: "fill",
    aliases: ["claude code"],
  },
  cloudflare: {
    label: "Cloudflare",
    kind: "brand",
    fit: "glyph",
    color: "#F38020",
  },
  codex: { label: "Codex", kind: "app", fit: "fill" },
  contacts: { label: "Contacts", kind: "app", fit: "fill" },
  github: {
    label: "GitHub",
    kind: "brand",
    fit: "glyph",
    color: "#181717",
    dark: INK_DARK,
  },
  gmail: { label: "Gmail", kind: "app", fit: "fill" },
  googlecalendar: {
    label: "Google Calendar",
    kind: "app",
    fit: "fill",
  },
  googledrive: {
    label: "Google Drive",
    kind: "app",
    fit: "fill",
    aliases: ["drive"],
  },
  granola: { label: "Granola", kind: "app", fit: "fill" },
  instagram: { label: "Instagram", kind: "app", fit: "fill" },
  lexar: { label: "Lexar", kind: "brand", fit: "fill" },
  linear: { label: "Linear", kind: "brand", fit: "glyph", color: "#5E6AD2" },
  linkedin: { label: "LinkedIn", kind: "app", fit: "fill" },
  mercury: { label: "Mercury", kind: "app", fit: "fill" },
  messages: {
    label: "Messages",
    kind: "app",
    fit: "fill",
    aliases: ["imessage"],
  },
  notes: { label: "Notes", kind: "app", fit: "fill", aliases: ["apple notes"] },
  npm: { label: "npm", kind: "brand", fit: "glyph", color: "#CB3837" },
  obsidian: { label: "Obsidian", kind: "app", fit: "fill" },
  resend: {
    label: "Resend",
    kind: "brand",
    fit: "glyph",
    color: "#000000",
    dark: INK_DARK,
  },
  safari: { label: "Safari", kind: "app", fit: "fill" },
  spotify: { label: "Spotify", kind: "app", fit: "fill" },
  stripe: { label: "Stripe", kind: "app", fit: "fill" },
  tailscale: {
    label: "Tailscale",
    kind: "app",
    fit: "fill",
    aliases: ["tailnet"],
  },
  vercel: {
    label: "Vercel",
    kind: "brand",
    fit: "glyph",
    color: "#000000",
    dark: INK_DARK,
  },
  voicememos: {
    label: "Voice Memos",
    kind: "app",
    fit: "fill",
    aliases: ["voice memo"],
  },
  whatsapp: { label: "WhatsApp", kind: "app", fit: "fill" },
  x: {
    label: "X",
    kind: "brand",
    fit: "glyph",
    color: "#000000",
    dark: INK_DARK,
  },
  youtube: { label: "YouTube", kind: "brand", fit: "glyph", color: "#FF0000" },
} as const satisfies Record<string, Entry>;

export type MarkId = keyof typeof ENTRIES;

/** Where a mark's artwork comes from. */
export type MarkArt =
  /** A flat glyph in the shared sprite, painted in `color`. */
  | { type: "symbol"; href: string }
  /** Raster artwork: WebP at 2x and 4x of the 28px tile, PNG fallback. */
  | { type: "raster"; webp56: string; webp112: string; png: string }
  /** One standalone vector that needs its own document. */
  | { type: "vector"; src: string };

export type BrandMark = Entry & { id: MarkId; art: MarkArt };

const GLYPHS: ReadonlySet<string> = new Set(MARK_GLYPHS);
const FILES: Readonly<
  Record<
    string,
    { webp56?: string; webp112?: string; png?: string; svg?: string }
  >
> = MARK_FILES;

function art(id: MarkId): MarkArt {
  if (GLYPHS.has(id)) return { type: "symbol", href: `${MARK_SPRITE}#${id}` };
  const file = FILES[id];
  if (file?.svg) return { type: "vector", src: file.svg };
  if (file?.webp56 && file.webp112 && file.png)
    return {
      type: "raster",
      webp56: file.webp56,
      webp112: file.webp112,
      png: file.png,
    };
  throw new Error(`brand mark ${id} has no vendored artwork`);
}

export const MARK_IDS = Object.keys(ENTRIES).sort() as MarkId[];

export const MARKS: Readonly<Record<MarkId, BrandMark>> = Object.freeze(
  Object.fromEntries(
    MARK_IDS.map((id) => [id, { ...ENTRIES[id], id, art: art(id) }]),
  ) as Record<MarkId, BrandMark>,
);

export function isMarkId(value: unknown): value is MarkId {
  return typeof value === "string" && Object.hasOwn(ENTRIES, value);
}

/** The mark for an id, or null when the registry has none. */
export function brandMark(id: string | null | undefined): BrandMark | null {
  return isMarkId(id) ? MARKS[id] : null;
}

/**
 * A name with the brand word dropped when the tile beside it already says the
 * brand: "1password connect" beside the 1Password tile reads "Connect". A name
 * that is only the brand keeps the brand's label.
 */
export function shortName(name: string, id: string | null | undefined): string {
  const mark = brandMark(id);
  if (!mark) return name;
  const words = [mark.label.toLowerCase(), ...(mark.aliases ?? [])].sort(
    (a, b) => b.length - a.length,
  );
  let rest = name;
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rest = rest.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "gi"), " ");
  }
  if (rest === name) return name;
  rest = rest.replace(/\s+/g, " ").trim();
  if (!rest) return mark.label;
  return `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}
