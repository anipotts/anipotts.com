/**
 * Display names, in one place. Every row that names an ops entry, a data
 * source, a record, a device or an app takes its short name, its tiles and
 * its tooltip from here, so one thing reads the same on every page:
 *
 * - the owner's name never leads a label: "ani-browsing" and "Ani browsing"
 *   both read "Browsing";
 * - a brand word the tile already says is dropped ("1password connect"
 *   beside the 1Password tile reads "Connect"), and so is a device word the
 *   device tile says ("pro session transcripts to R2" beside the MacBook
 *   reads "Session transcripts to R2");
 * - the app tile and the device tile resolve from the id, the host and the
 *   record's metadata, and render without a device when none resolves;
 * - the full technical id goes to the tooltip, never into the row.
 *
 * Marks come from lib/marks.ts; this file only decides what a row says.
 */
import {
  MARKS,
  MARK_IDS,
  brandMark,
  isMarkId,
  type MarkId,
} from "@anipotts/brand/marks";
import {
  deviceMark,
  opsMark,
  shortName,
  sourceMark,
  type TileRef,
} from "./marks";
import { sentenceCase } from "./sentence-case";

/** What a row shows for one thing. */
export type Naming = {
  /** The short name beside the tiles. */
  name: string;
  /** The app or brand tile, or the glyph for the thing's kind. */
  tile: TileRef;
  /** The device the thing runs on or came from, when one resolves. */
  device: TileRef | null;
  /** The full technical id, for the tooltip. */
  tooltip: string;
};

const OWNER = /^(?:ani(?:'s)?)(?:[\s._-]+|$)/i;

/** A label without the owner's name in front: "Ani browsing" reads
 * "browsing", "ani-messages-1to1" reads "messages-1to1". A label that is only
 * the owner's name stays as it is. */
export function withoutOwner(label: string): string {
  const rest = label.replace(OWNER, "");
  return rest.trim() ? rest : label;
}

/** Words System writes in lowercase that read better cased, or spelled out. */
const WORDS: Readonly<Record<string, string>> = {
  "1to1": "1:1",
  api: "API",
  d1: "D1",
  html: "HTML",
  id: "ID",
  ids: "IDs",
  nyu: "NYU",
  os: "OS",
  r2: "R2",
  url: "URL",
};

/** The word a device tile makes redundant, by device. */
const DEVICE_WORDS: Readonly<Record<string, string>> = {
  "ap-mini": "mini",
  "ap-phone": "phone",
  "ap-plus": "plus",
  "ap-pro": "pro",
};

/** Device words an id can carry ("codex-mini", "brain-pro-vault"). "plus"
 * is left out: in an id it is more often a word than the phone. */
const ID_DEVICES: Readonly<Record<string, string>> = {
  mini: "ap-mini",
  phone: "ap-phone",
  pro: "ap-pro",
};

/** Whether a word in an id names one of the owner's devices. */
export function isDeviceWord(word: string): boolean {
  return Object.hasOwn(ID_DEVICES, word.toLowerCase());
}

/** The device a device word in an id names, or null. */
export function idDevice(id: string): string | null {
  for (const word of withoutOwner(id.toLowerCase()).split(/[^a-z0-9]+/))
    if (isDeviceWord(word)) return ID_DEVICES[word]!;
  return null;
}

/** Words cased as the admin writes them: "html" reads "HTML", "nyu" "NYU". */
export function caseWords(text: string): string {
  return text
    .split(" ")
    .map((word) =>
      Object.hasOwn(WORDS, word.toLowerCase())
        ? WORDS[word.toLowerCase()]!
        : word,
    )
    .join(" ");
}

/**
 * A name as a row shows it: no owner prefix, separators as spaces, the
 * brand word the tile says and the device word the device tile says dropped
 * wherever it sits ("legacy silver pro" beside the MacBook reads "Legacy
 * silver"), then sentence case. A name that is only the brand reads as the
 * brand's own label ("messages" beside Messages reads "Messages").
 */
export function displayName(
  raw: string,
  tiles: { tile?: TileRef | null; device?: TileRef | null } = {},
): string {
  const base = withoutOwner(raw.trim())
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const brand = tiles.tile?.id ?? null;
  let name = brand ? shortName(base, brand) : base;
  const label = brand ? brandMark(brand)?.label : undefined;
  if (label && name === label) return label;
  // What is left once the brand goes must still say something: "messages
  // 1to1" beside Messages keeps its brand word ("Messages 1:1"), not "1:1".
  if (name !== base && !/[a-z]{3,}/i.test(caseWords(name))) name = base;
  const device = tiles.device?.id ?? null;
  const word =
    device && Object.hasOwn(DEVICE_WORDS, device) && DEVICE_WORDS[device];
  if (word) {
    const rest = name
      .split(" ")
      .filter((part) => part.toLowerCase() !== word)
      .join(" ");
    if (rest) name = rest;
  }
  return sentenceCase(caseWords(name || base));
}

/** The device tile for a host or device name, only when it is one of the
 * owner's devices (ap-pro, ap-mini, ap-phone, ap-plus). Anything else, or
 * nothing, is no device tile. */
export function hostDevice(host: string | null | undefined): TileRef | null {
  const tile = deviceMark(host ?? "");
  return tile.id && brandMark(tile.id)?.kind === "device" ? tile : null;
}

/** A device as a row names it, for access rows: the device's own name, or
 * what an unnamed caller is. */
export function deviceName(device: string | null | undefined): string {
  if (!device) return "Unknown device";
  if (device === "loopback") return "Local";
  if (device === "other") return "Other device";
  return brandMark(hostDevice(device)?.id)?.label ?? device;
}

type OpsEntry = {
  id: string;
  name: string;
  kind?: string | null;
  host?: string | null;
};

/** An ops_v1 catalog entry. A host row's tile is its device, so it gets no
 * second device tile and keeps its own name. */
export function opsNaming(entry: OpsEntry): Naming {
  const tile = opsMark(entry);
  if (entry.id.startsWith("host.") || entry.kind === "host")
    return { name: entry.name, tile, device: null, tooltip: entry.id };
  const device =
    hostDevice(entry.host) ??
    (entry.id.startsWith("pro.") ? hostDevice("ap-pro") : null);
  return {
    name: displayName(entry.name, { tile, device }),
    tile,
    device,
    tooltip: entry.id,
  };
}

/**
 * A data source, the same on every page. `displayName` is the catalog's own
 * label (System's `display_name`), and wins; otherwise the name comes from
 * the id. The device is System's `host`, else a device word in the id
 * ("codex-mini"), so the name drops that word wherever the source shows.
 */
export function sourceNaming(source: {
  id: string;
  host?: string | null;
  displayName?: string | null;
  /** System's `connector` and `transport`: Apple Health is credited only to
   * a health source System says the phone pushes. */
  connector?: string | null;
  transport?: string | null;
}): Naming {
  const phoneExport =
    source.connector === "health" && source.transport === "push";
  const tile: TileRef = phoneExport
    ? { id: "applehealth", kind: "health" }
    : sourceMark(withoutOwner(source.id));
  const device = source.host
    ? hostDevice(source.host)
    : hostDevice(idDevice(source.id));
  return {
    name: source.displayName || displayName(source.id, { tile, device }),
    tile,
    device,
    tooltip: source.id,
  };
}

/** Browser keys as record metadata writes them (`browser_visits`). */
const APP_KEYS: Readonly<Record<string, MarkId>> = {
  atlas: "chatgpt-atlas",
  "google chrome": "chrome",
};

/** The app mark for a metadata key such as "chrome", "safari" or "atlas":
 * a mark id, a mark's label or alias, or a known browser key. Devices are
 * never apps. */
export function appMark(key: string): MarkId | null {
  const word = key.trim().toLowerCase().replace(/[-_]+/g, " ");
  // A one- or two-letter key ("x", "id") is a coordinate or a code, never
  // an app.
  if (word.length < 3) return null;
  if (Object.hasOwn(APP_KEYS, word)) return APP_KEYS[word]!;
  const id = word.replace(/\s+/g, "");
  if (isMarkId(id) && brandMark(id)?.kind !== "device") return id;
  return MARKS_BY_WORD.get(word) ?? null;
}

/** Every app and brand mark by its lowercase label and aliases. */
const MARKS_BY_WORD: ReadonlyMap<string, MarkId> = new Map(
  MARK_IDS.filter((id) => MARKS[id].kind !== "device").flatMap((id) =>
    [MARKS[id].label.toLowerCase(), ...(MARKS[id].aliases ?? [])].map(
      (word) => [word, id] as const,
    ),
  ),
);

/** The count per app in an object such as `browser_visits`, largest first,
 * with the app mark each key resolves to (null for a key with no mark). */
export function appCounts(
  value: unknown,
): Array<{ key: string; id: MarkId | null; count: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    )
    .map(([key, count]) => ({ key, id: appMark(key), count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** A calendar date in a title as people read it: "Sep 22" this year, "Sep
 * 22, 2025" in another. A trailing date follows a comma. */
export function readableDates(title: string, now: number): string {
  const year = new Date(now).getFullYear();
  return title.replace(
    /(\s*)\b(\d{4})-(\d{2})-(\d{2})\b(\s*)/g,
    (
      match,
      before: string,
      y: string,
      m: string,
      d: string,
      after: string,
      at: number,
    ) => {
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(m) - 1)
        return match;
      const text = (Number(y) === year ? MONTH_DAY : MONTH_DAY_YEAR).format(
        date,
      );
      const trailing = at + match.length === title.length;
      if (trailing && before && at > 0) return `, ${text}`;
      return `${before}${text}${after}`;
    },
  );
}

/**
 * A record: its title without the owner's name and with readable dates, its
 * app tile (the app most of a browsing day came from, else its source's), and
 * its device from System's optional `host` in the record or its metadata.
 * "Browsing 2026-09-22" from Chrome on ap-pro reads [Chrome][MacBook]
 * "Browsing, Sep 22".
 */
export function recordNaming(
  record: {
    id: string;
    title?: string | null;
    source?: string | null;
    metadata?: unknown;
    host?: string | null;
  },
  now: number = Date.now(),
): Naming {
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : {};
  const lead = appCounts(metadata.browser_visits).find((entry) => entry.id);
  const tile: TileRef = lead?.id
    ? { id: lead.id, kind: "browser" }
    : sourceMark(withoutOwner(record.source ?? ""));
  const host =
    record.host ?? (typeof metadata.host === "string" ? metadata.host : null);
  const title = withoutOwner((record.title ?? "").trim()) || "Untitled";
  return {
    // A title is the record's own text: only the owner prefix and the dates
    // change, never its words or case.
    name: readableDates(title, now),
    tile,
    device: hostDevice(host),
    tooltip: record.id,
  };
}

/** A metadata key as a label: "browser_visits" reads "Browser visits". */
export function keyLabel(key: string): string {
  return sentenceCase(caseWords(key.replace(/[-_.]+/g, " ").trim()));
}

/** The noun a key's counts are in, from its last word when that is a plural:
 * "browser_visits" counts visits, so 44 reads "44 visits" and 1 "1 visit". */
export function countNoun(key: string): [one: string, many: string] | null {
  const last =
    key
      .split(/[-_.\s]+/)
      .at(-1)
      ?.toLowerCase() ?? "";
  if (!/^[a-z]{3,}s$/.test(last) || last.endsWith("ss")) return null;
  return [last.replace(/(?:ie)?s$/, (end) => (end === "ies" ? "y" : "")), last];
}

/**
 * The apps each sync carries, by ops catalog id; the first app is the tile.
 * Sync freshness lists these rows with the app's mark. Data sources resolve
 * their app through `sourceNaming` (the messages sources read Messages) and
 * browsing days through `appCounts(metadata.browser_visits)` (Chrome, Safari
 * or Atlas), so no source is listed twice.
 */
export const SYNCED_APPS = {
  "health.ingest": ["applehealth"],
  "pro.transcripts": ["claude"],
  "pro.voicememos": ["voicememos"],
  "pro.whatsapp": ["whatsapp"],
  "transcripts.upload": ["claude"],
} as const satisfies Record<string, readonly MarkId[]>;

/**
 * Syncs that move many apps' data in one pass, shown as their own job. Their
 * receipt proves a pass finished, not that any one app's data arrived
 * (pro.pc-send's pass completes while Messages holds nothing past May 2024),
 * so no app mark borrows their freshness. Apps come back once System's
 * sources carry their own job and `held_to`.
 */
export const SYNC_JOBS: readonly string[] = ["pro.pc-send"];

/** The apps a sync carries, or null when the id is not a sync. */
export function syncedApps(id: string): readonly MarkId[] | null {
  return Object.hasOwn(SYNCED_APPS, id)
    ? SYNCED_APPS[id as keyof typeof SYNCED_APPS]
    : null;
}
