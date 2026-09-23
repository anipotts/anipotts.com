/**
 * A reader record as the record panel reads it, readable first: the body as
 * paragraphs, lists and label pairs; the structured metadata under human
 * labels; the technical fields (ids, hashes, references, versions) apart;
 * and the history as timeline entries. Pure, so the panel and its tests read
 * one projection of the reader's object.
 *
 * Nothing here invents a field. A key System adds later reads under its own
 * key as a label, formatted by its value's type; only keys that look
 * technical (ids, hashes, paths, references) move to the technical list.
 * Nothing raw reaches the page as JSON: an object is chips, an array of
 * values is chips, and an array of objects is its count.
 */
import {
  appMark,
  hostDevice,
  keyLabel,
  readableDates,
  withoutOwner,
} from "./naming";
import { clockText } from "../components/workspace/format";
import { relativeAgo } from "./live-clock";
import type { MarkId } from "@anipotts/brand/marks";

type Item = Record<string, unknown>;

const object = (value: unknown): Item | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Item)
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/** An effective date at its own precision: a day, a month or a year, read in
 * UTC so a date never shifts across a timezone. A time of day, when the value
 * carries one, reads in the viewer's zone. */
export function effectiveDate(
  value: string | null,
  precision: string | null,
): string | null {
  if (!value) return null;
  if (/T\d{2}:\d{2}/.test(value) && precision !== "day") {
    const ms = Date.parse(value);
    // Composed by hand, so every engine writes the same text.
    if (Number.isFinite(ms)) return clockText(ms);
  }
  const ms = Date.parse(value.length === 4 ? `${value}-01-01` : value);
  if (!Number.isFinite(ms)) return value;
  const options: Intl.DateTimeFormatOptions =
    precision === "year" || value.length === 4
      ? { year: "numeric" }
      : precision === "month" || value.length === 7
        ? { year: "numeric", month: "long" }
        : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(ms);
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * A record's occurred date as a list's time column shows it, the date the
 * list is sorted by (ledger A-28). A time within the last day reads
 * relative ("3h ago"); anything else reads at the precision System holds:
 * "Sep 20" this year, "Sep 20, 2025" before it, "Sep 2026" for a month and
 * "2025" for a year, so a month is never drawn as a day. Null when there is
 * no occurred date.
 */
export function occurredText(
  value: string | null,
  precision: string | null,
  now: number,
): string | null {
  if (!value) return null;
  if (/T\d{2}:\d{2}/.test(value) && precision !== "day") {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    if (now - ms < 24 * 3600_000) return relativeAgo(ms, now);
    const at = new Date(ms);
    const date = `${SHORT_MONTHS[at.getMonth()]} ${at.getDate()}`;
    return at.getFullYear() === new Date(now).getFullYear()
      ? date
      : `${date}, ${at.getFullYear()}`;
  }
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  if (precision === "year" || !month) return year!;
  const name = SHORT_MONTHS[Number(month) - 1];
  if (!name) return null;
  if (precision === "month" || !day) return `${name} ${year}`;
  const date = `${name} ${Number(day)}`;
  return Number(year) === new Date(now).getFullYear()
    ? date
    : `${date}, ${year}`;
}

// The body.

/** One line of a list, with a trailing count set apart ("github.com: 12"
 * reads "github.com" and "12"). */
export type SummaryItem = { text: string; figure: string | null };

/** A readable part of a record's body. */
export type SummaryBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | {
      type: "list";
      title: string | null;
      ordered: boolean;
      items: SummaryItem[];
    }
  | { type: "fields"; items: Array<{ label: string; value: string }> };

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const LEAD_IN = /^(.{1,80}):$/;
/** "Organization: Example": a short label, a colon and a value. */
const FIELD = /^([A-Z][A-Za-z0-9 ()/'&-]{0,39}):\s+(\S.*)$/;
const FIGURE = /^(.*\S):\s*([\d,]+(?:\.\d+)?)$/;
/** "Sample article (2)": a count in brackets at the end. */
const COUNT = /^(.*\S)\s+\(([\d,]+)\)$/;

function listItem(line: string): SummaryItem {
  const match = FIGURE.exec(line) ?? COUNT.exec(line);
  return match
    ? { text: match[1]!, figure: match[2]! }
    : { text: line, figure: null };
}

/**
 * A body as readable blocks. A JSON body (a manual assertion's value) reads
 * as its values, never as JSON. Otherwise: `#` lines are headings, `-`, `*`
 * and numbered lines are lists (a "Label:" line just before one is its
 * title), a run of two or more "Label: value" lines is a label list, and
 * other lines are paragraphs that keep their line breaks.
 */
export function summaryBlocks(body: string | null | undefined): SummaryBlock[] {
  if (!body || !body.trim()) return [];
  const json = jsonBody(body);
  if (json) return json;
  const blocks: SummaryBlock[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (!lines.length) return;
    const fields = lines.map((line) => FIELD.exec(line));
    if (lines.length >= 2 && fields.every(Boolean))
      blocks.push({
        type: "fields",
        items: fields.map((match) => ({
          label: match![1]!,
          value: match![2]!,
        })),
      });
    else blocks.push({ type: "paragraph", lines });
    lines = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = listItem((bullet ?? numbered)![1]!.trim());
      const last = blocks.at(-1);
      if (!lines.length && last?.type === "list" && last.ordered === ordered) {
        last.items.push(item);
        continue;
      }
      // A "Top domains:" line just before the list names it.
      const lead = lines.length ? LEAD_IN.exec(lines.at(-1)!.trim()) : null;
      if (lead) lines.pop();
      flush();
      blocks.push({
        type: "list",
        title: lead ? lead[1]! : null,
        ordered,
        items: [item],
      });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", text: heading[1]! });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    lines.push(line.trim());
  }
  flush();
  return blocks;
}

/** A body's blocks with calendar dates as people read them ("2026-09-21"
 * reads "Sep 21"), as titles show them. Only the dates change. */
export function readableBlocks(
  blocks: SummaryBlock[],
  now: number = Date.now(),
): SummaryBlock[] {
  const read = (value: string) => readableDates(value, now);
  return blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return { ...block, lines: block.lines.map(read) };
      case "heading":
        return { ...block, text: read(block.text) };
      case "fields":
        return {
          ...block,
          items: block.items.map((item) => ({
            ...item,
            value: read(item.value),
          })),
        };
      case "list":
        return {
          ...block,
          title: block.title && read(block.title),
          items: block.items.map((item) => ({
            ...item,
            text: read(item.text),
          })),
        };
    }
  });
}

function jsonBody(body: string): SummaryBlock[] | null {
  const trimmed = body.trim();
  if (!/^[[{"]/.test(trimmed)) return null;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof value === "string")
    return value.trim() ? summaryBlocks(value) : [];
  if (Array.isArray(value))
    return value.length
      ? [
          {
            type: "list",
            title: null,
            ordered: false,
            items: value.map((entry) => ({
              text: valueText(entry),
              figure: null,
            })),
          },
        ]
      : [];
  const fields = object(value);
  if (!fields) return null;
  const items = Object.entries(fields).flatMap(([key, entry]) => {
    const inner = object(entry);
    if (inner)
      return Object.entries(inner).map(([child, value]) => ({
        label: `${keyLabel(key)} ${keyLabel(child).toLowerCase()}`,
        value: valueText(value),
      }));
    return [{ label: keyLabel(key), value: valueText(entry) }];
  });
  return items.length ? [{ type: "fields", items }] : [];
}

/** A value as one line of text: lists joined, objects as their size. */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return NUMBER.format(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.every((entry) => object(entry) === null)
      ? value.map(valueText).join(", ")
      : countText(value.length, "item");
  return countText(Object.keys(value as Item).length, "field");
}

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const countText = (count: number, noun: string) =>
  `${NUMBER.format(count)} ${count === 1 ? noun : `${noun}s`}`;

// The details.

/** A detail's value, typed so the panel draws each kind its own way. */
export type DetailValue =
  | { type: "text"; text: string }
  | { type: "figure"; text: string }
  | { type: "time"; ms: number }
  | { type: "duration"; ms: number }
  | {
      type: "chips";
      field: string;
      value: Record<string, unknown>;
      /** Keys are names as written (domains, repositories), not labels. */
      raw: boolean;
    }
  | { type: "list"; items: string[] }
  | { type: "device"; host: string }
  | { type: "app"; id: MarkId; text: string };

export type Detail = { key: string; label: string; value: DetailValue };

/** A technical field: a value to copy, a short text, or chips. */
export type TechnicalValue =
  | { type: "copy"; value: string; display?: string }
  | { type: "text"; text: string }
  | { type: "chips"; field: string; value: Record<string, unknown> };

export type Technical = { key: string; label: string; value: TechnicalValue };

/** Labels for keys whose own words read poorly. Every other key reads as
 * its words ("job_title" is "Job title"). */
const LABELS: Readonly<Record<string, string>> = {
  active_kcal: "Active energy",
  attachment_count: "Attachments",
  audio_included: "Audio included",
  avg_hr_bpm: "Average heart rate",
  body_fat_pct: "Body fat",
  browser_visits: "Browser visits",
  container: "Format",
  current_as_of: "Current as of",
  current_as_of_status: "Verification",
  date_format_gaps: "Date gaps",
  day_state: "Day",
  device_source: "Recorded by",
  domain_count: "Domains",
  dropped_visits: "Dropped visits",
  duration_min: "Duration",
  duration_seconds: "Duration",
  edited_at: "Edited",
  effective_from: "Effective from",
  hrv_avg_ms: "Heart rate variability",
  is_me_card: "My card",
  is_retracted: "Retracted",
  merged_prs: "Merged PRs",
  omitted_fields: "Omitted from view",
  other_domain_visits: "Other domain visits",
  profile_count: "Profiles",
  reported_plaintext_length: "Text length",
  remote_reference_count: "Remote references",
  repos_created: "Repositories created",
  resting_hr_bpm: "Resting heart rate",
  retracted_at: "Retracted",
  sender_handle: "Sender",
  size_bytes: "Size",
  sleep_h: "Sleep",
  source_modified_at: "Modified",
  speaker_role: "Speaker",
  temporal_status: "Temporal status",
  temporal_warnings: "Temporal warnings",
  timezone: "Time zone",
  total_visits: "Visits",
  unnormalized_handle_count: "Unnormalized handles",
  visible_text_available: "Visible text",
  weight_lbs: "Weight",
  workout_type: "Workout",
  wrist_temp_delta_c: "Wrist temperature",
};

/** Objects whose fields are the record's own details, read without the
 * container's name in front ("vitals.steps" is "Steps"). */
const CONTAINERS: ReadonlySet<string> = new Set([
  "private",
  "vitals",
  "workout",
]);

/** Vital signs a health day could carry. No collector feeds any of them
 * (Ani's watch has never sent vitals; the Withings events carry no weight),
 * and System marks no vital feed as collected, so a health day never shows
 * one: whatever number a record holds came from somewhere else. It reads
 * "No vitals collected" instead. Activity (steps, distance, flights, active
 * energy) is collected and shows. */
const VITALS: ReadonlySet<string> = new Set([
  "avg_hr_bpm",
  "body_fat_pct",
  "hrv_avg_ms",
  "resting_hr_bpm",
  "sleep_h",
  "weight_lbs",
  "wrist_temp_delta_c",
]);
const HEALTH_DAYS: ReadonlySet<string> = new Set([
  "health_day",
  "health_day_private",
]);

/** Keys that repeat what the panel already shows: the tier glyph and the
 * device tile in its facts, the record's title and date, and lists the body
 * spells out. */
const SHOWN: ReadonlySet<string> = new Set([
  "agent_summary",
  "audience",
  "host",
  "summary_authority",
  "tier",
]);
const IN_BODY: Readonly<Record<string, readonly string[]>> = {
  browsing_day: ["local_date", "titles", "top_domains"],
  contact: ["display_name", "handles"],
  health_day: ["date"],
  health_day_private: ["date"],
  work_day: ["date"],
};

/** Keys that are about the capture rather than the thing: identities,
 * digests, paths, extractor versions and the reader's own bookkeeping. */
const TECHNICAL_KEY = /^(?:native_|source_(?!modified_at$))/;
const TECHNICAL: ReadonlySet<string> = new Set([
  "aggregation",
  "associated_message_type",
  "attachment_bytes_captured",
  "created_precision",
  "decoder_status",
  "duration_source",
  "export_representation",
  "extraction_schema_version",
  "historical_source",
  "html_preserved_at_source",
  "identity_basis",
  "identity_merge",
  "modified_precision",
  "nontext_content_preserved_at_source",
  "occurred_at_semantics",
  "organization_only",
  "original_occurrence_date",
  "original_source_modified_date",
  "recorded_date_source",
  "requires_fact_extraction",
]);

/** Values that are a fixed vocabulary, read in sentence case: "not_mirrored"
 * is "Not mirrored", "public" is "Public". Other one-word values (a login, a
 * label) keep their case. */
const ENUMS: ReadonlySet<string> = new Set([
  "availability",
  "current_as_of_status",
  "day_state",
  "direction",
  "speaker_role",
  "temporal_status",
  "transcription",
  "visibility",
  "workout_type",
]);

/** Keys whose value names an app: its tile, then its name. */
const APP_KEYS: ReadonlySet<string> = new Set([
  "app",
  "browser",
  "platform",
  "service",
]);

/** Counts that say nothing at zero. */
const QUIET_ZERO: ReadonlySet<string> = new Set([
  "other_domain_visits",
  "remote_reference_count",
  "unnormalized_handle_count",
]);

/** How a figure's unit reads, by the key's last word. */
const UNITS: Readonly<Record<string, (value: number) => DetailValue>> = {
  bytes: (value) => ({ type: "figure", text: bytesText(value) }),
  bpm: (value) => ({ type: "figure", text: `${NUMBER.format(value)} bpm` }),
  c: (value) => ({
    type: "figure",
    text: `${value > 0 ? "+" : ""}${NUMBER.format(value)} °C`,
  }),
  h: (value) => ({ type: "duration", ms: value * 3_600_000 }),
  kcal: (value) => ({ type: "figure", text: `${NUMBER.format(value)} kcal` }),
  lbs: (value) => ({ type: "figure", text: `${NUMBER.format(value)} lbs` }),
  m: (value) => ({
    type: "figure",
    text:
      value >= 1000
        ? `${NUMBER.format(value / 1000)} km`
        : `${NUMBER.format(value)} m`,
  }),
  min: (value) => ({ type: "duration", ms: value * 60_000 }),
  // Under a second it is a measurement ("48 ms", like "56 bpm"), not a wait.
  ms: (value) =>
    Math.abs(value) < 1000
      ? { type: "figure", text: `${NUMBER.format(value)} ms` }
      : { type: "duration", ms: value },
  pct: (value) => ({ type: "figure", text: `${NUMBER.format(value)}%` }),
  s: (value) => ({ type: "duration", ms: value * 1000 }),
  seconds: (value) => ({ type: "duration", ms: value * 1000 }),
};

function bytesText(value: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return unit === 0
    ? countText(value, "byte")
    : `${NUMBER.format(Math.round(size * 10) / 10)} ${units[unit]}`;
}

/** Words System writes in lowercase that read better cased. */
const WORDS: Readonly<Record<string, string>> = {
  hr: "HR",
  hrv: "HRV",
  prs: "PRs",
};

/** A key as a label: its entry in LABELS, or its words in sentence case.
 * A unit the value already says goes ("distance_m" reads "Distance"). */
export function detailLabel(key: string): string {
  if (Object.hasOwn(LABELS, key)) return LABELS[key]!;
  const words = key.split("_");
  const bare =
    words.length > 1 && Object.hasOwn(UNITS, words.at(-1)!)
      ? words.slice(0, -1).join("_")
      : key;
  return keyLabel(withoutOwner(bare))
    .split(" ")
    .map((word) => WORDS[word.toLowerCase()] ?? word)
    .join(" ");
}

const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}(?:-\d{2})?$/;
const SNAKE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/;

/** A fixed-vocabulary value in sentence case, known words cased ("html"
 * reads "HTML"). */
const enumText = (value: string) => keyLabel(value);

/** Assertion authorities, named for what they are. */
const AUTHORITIES: Readonly<Record<string, string>> = {
  agent_inference: "Agent inference",
  ani_direct: "Direct statement",
  verified_source: "Verified source",
};

function stringValue(key: string, value: string): DetailValue {
  if (key === "authority" || key === "current_as_of_authority")
    return {
      type: "text",
      text: AUTHORITIES[value] ?? enumText(value),
    };
  if (key === "container") return { type: "text", text: value.toUpperCase() };
  if (APP_KEYS.has(key)) {
    const id = appMark(value);
    if (id) return { type: "app", id, text: value };
  }
  if (ISO_TIME.test(value)) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return { type: "time", ms };
  }
  if (ISO_DATE.test(value))
    return {
      type: "text",
      text: effectiveDate(value, value.length === 7 ? "month" : "day")!,
    };
  if (ENUMS.has(key) || SNAKE.test(value))
    return { type: "text", text: enumText(value) };
  return { type: "text", text: value };
}

const scalar = (value: unknown) =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

/** Chip values: lowercase vocabulary words ("captured", "not_verified") in
 * sentence case, other values as written. */
function chipValues(value: Item): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === "string" && (SNAKE.test(entry) || /^[a-z]+$/.test(entry))
        ? enumText(entry)
        : entry,
    ]),
  );
}

/** Keys that are names as written: domains, repositories, people. */
const rawKeys = (value: Item) =>
  Object.keys(value).some((key) => /[./@]|[A-Z]/.test(key));

/** One readable detail, or none when the value says nothing. */
function detailValue(key: string, value: unknown): DetailValue | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") {
    // "is_retracted: false" says nothing; an ordinary flag reads Yes or No.
    if (!value && key.startsWith("is_")) return null;
    return { type: "text", text: value ? "Yes" : "No" };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value === 0 && QUIET_ZERO.has(key)) return null;
    const unit = key.split("_").at(-1) ?? "";
    if (key.includes("_") && Object.hasOwn(UNITS, unit))
      return UNITS[unit]!(value);
    return { type: "figure", text: NUMBER.format(value) };
  }
  if (typeof value === "string") {
    if (key === "host") return { type: "device", host: value };
    return stringValue(key, value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (value.every(scalar))
      return {
        type: "list",
        items: value.map((entry) =>
          typeof entry === "string" && SNAKE.test(entry)
            ? enumText(entry)
            : valueText(entry),
        ),
      };
    return { type: "figure", text: NUMBER.format(value.length) };
  }
  const inner = object(value);
  if (!inner || !Object.keys(inner).length) return null;
  return {
    type: "chips",
    field: key,
    value: chipValues(inner),
    raw: rawKeys(inner),
  };
}

/** An identifier, digest, path or reference: copied, never read. */
const IDENTIFIER =
  /(?:^|_)(?:id|ids|guid|hash|sha1|sha256|digest|uri|url|path|locator|rowid|file)$/;

/** A technical field's value. Identifiers, references and long values get a
 * copy button; a short vocabulary value ("none", "second") or a figure reads
 * as text. */
function technicalValue(key: string, value: unknown): TechnicalValue | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string")
    return IDENTIFIER.test(key) || /[:/\\]/.test(value) || value.length > 24
      ? { type: "copy", value }
      : {
          type: "text",
          text:
            SNAKE.test(value) || /^[a-z]+$/.test(value)
              ? enumText(value)
              : value,
        };
  if (typeof value === "number" || typeof value === "boolean")
    return {
      type: "text",
      text: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
    };
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value.every((entry) => typeof entry === "string")
      ? value.length === 1
        ? { type: "copy", value: value[0] as string }
        : {
            type: "copy",
            value: value.join("\n"),
            display: countText(value.length, "value"),
          }
      : {
          type: "copy",
          value: JSON.stringify(value, null, 2),
          display: countText(value.length, "item"),
        };
  }
  return {
    type: "copy",
    value: JSON.stringify(value, null, 2),
    display: countText(Object.keys(value as Item).length, "field"),
  };
}

function technicalLabel(key: string): string {
  return detailLabel(key)
    .replace(/\b(?:Id|id)\b/g, "ID")
    .replace(/\bIds\b/g, "IDs")
    .replace(/\bUri\b/g, "URI")
    .replace(/\bUrl\b/g, "URL")
    .replace(/\bGuid\b/g, "GUID")
    .replace(/\bSha256\b/gi, "SHA-256");
}

/** A metadata object's fields as details and technical fields. A container
 * ("vitals") reads its fields under their own labels; any other object with
 * nested objects reads each one under "Parent child". */
function readFields(
  fields: Item,
  kind: string | null,
  details: Detail[],
  technical: Technical[],
  prefix: { key: string; label: string } | null = null,
) {
  const skip = new Set([...SHOWN, ...((kind && IN_BODY[kind]) || [])]);
  for (const [key, value] of Object.entries(fields)) {
    if (!prefix && skip.has(key)) continue;
    if (kind && HEALTH_DAYS.has(kind) && VITALS.has(key)) continue;
    const path = prefix ? `${prefix.key}.${key}` : key;
    if (!prefix && key === "coverage") {
      // Coverage is the capture's own receipt; only a note's says what the
      // export held.
      const inner = object(value);
      if (kind === "note" && inner)
        technical.push({
          key: path,
          label: "Coverage",
          value: { type: "chips", field: key, value: chipValues(inner) },
        });
      continue;
    }
    if (TECHNICAL_KEY.test(key) || IDENTIFIER.test(key) || TECHNICAL.has(key)) {
      const entry = technicalValue(key, value);
      if (entry)
        technical.push({
          key: path,
          label: key === "aggregation" ? "Aggregation" : technicalLabel(key),
          value: entry,
        });
      continue;
    }
    const inner = object(value);
    if (
      inner &&
      !prefix &&
      (CONTAINERS.has(key) ||
        Object.values(inner).some((entry) => object(entry) !== null))
    ) {
      readFields(
        inner,
        kind,
        details,
        technical,
        CONTAINERS.has(key)
          ? { key, label: "" }
          : { key, label: detailLabel(key) },
      );
      continue;
    }
    const entry = detailValue(key, value);
    if (!entry) continue;
    const own = detailLabel(key);
    const label = !prefix?.label
      ? own
      : key === "total"
        ? prefix.label
        : `${prefix.label} ${own.charAt(0).toLowerCase()}${own.slice(1)}`;
    details.push({ key: path, label, value: entry });
  }
}

/** The assertion's own fields: what it says, on whose authority, and from
 * when. Its status is the record's state chip; its subject and what it
 * supersedes are technical. */
function readAssertion(
  assertion: Item,
  details: Detail[],
  technical: Technical[],
) {
  const precision = text(assertion.precision);
  for (const [key, value] of Object.entries(assertion)) {
    if (key === "status" || key === "precision") continue;
    const path = `assertion.${key}`;
    if (key === "subject_id" || key === "supersedes") {
      const entry = technicalValue(key, value);
      if (entry)
        technical.push({
          key: path,
          label: key === "subject_id" ? "Subject ID" : "Supersedes",
          value: entry,
        });
      continue;
    }
    if (key === "predicate" && typeof value === "string") {
      details.push({
        key: path,
        label: "Predicate",
        value: { type: "text", text: enumText(value) },
      });
      continue;
    }
    if (key === "effective_from" && typeof value === "string") {
      const date = effectiveDate(value, precision);
      if (date)
        details.push({
          key: path,
          label: "Effective from",
          value: { type: "text", text: date },
        });
      continue;
    }
    if (key === "value") {
      const inner = object(value);
      if (inner && inner.omitted_from_view === true) continue;
      const entry = detailValue(key, value);
      if (entry) details.push({ key: path, label: "Value", value: entry });
      continue;
    }
    if (TECHNICAL_KEY.test(key) || IDENTIFIER.test(key)) {
      const entry = technicalValue(key, value);
      if (entry)
        technical.push({ key: path, label: technicalLabel(key), value: entry });
      continue;
    }
    const entry = detailValue(key, value);
    if (entry)
      details.push({ key: path, label: detailLabel(key), value: entry });
  }
}

/**
 * A record's details and technical fields, from the reader's own object.
 * Details are the metadata, the assertion and the record's own state notes
 * (modified, temporal status, fields the reader left out); the panel adds the
 * kind, observed time and device beside them. Technical fields lead with the
 * record id, revision, source, reference, source version and aggregation.
 */
export function recordDetails(raw: Item): {
  details: Detail[];
  technical: Technical[];
} {
  const details: Detail[] = [];
  const technical: Technical[] = [];
  const kind = text(raw.kind);
  const metadata = object(raw.metadata);
  const provenance = object(raw.provenance);
  const current = Array.isArray(raw.revisions)
    ? raw.revisions
        .map(object)
        .find((revision) => revision?.revision_id === raw.revision_id)
    : undefined;
  const version = text(raw.source_version) ?? text(current?.source_version);
  const aggregation = text(metadata?.aggregation);
  const extractor = text(provenance?.extractor);
  const lead: Array<[key: string, label: string, value: unknown]> = [
    ["record_id", "Record ID", raw.record_id],
    ["revision_id", "Revision ID", raw.revision_id],
    ["source_id", "Source ID", raw.source_id],
    ["source_record_id", "Source record ID", raw.source_record_id],
    ["source_uri", "Source reference", provenance?.source_uri],
    ["source_version", "Source version", version],
    ["aggregation", "Aggregation", aggregation],
    [
      "extractor",
      "Extractor",
      extractor && extractor !== aggregation ? extractor : null,
    ],
    ["entity_id", "Entity ID", raw.entity_id],
  ];
  for (const [key, label, value] of lead) {
    const entry = text(value);
    if (entry)
      technical.push({ key, label, value: { type: "copy", value: entry } });
  }
  if (Array.isArray(raw.origins) && raw.origins.length)
    technical.push({
      key: "origins",
      label: "Observations",
      value: { type: "text", text: NUMBER.format(raw.origins.length) },
    });
  const modified = text(raw.source_modified_at);
  const modifiedMs = modified ? Date.parse(modified) : NaN;
  if (Number.isFinite(modifiedMs))
    details.push({
      key: "source_modified_at",
      label: "Modified",
      value: { type: "time", ms: modifiedMs },
    });
  for (const key of [
    "temporal_status",
    "temporal_warnings",
    "current_as_of",
    "current_as_of_status",
    "omitted_fields",
  ]) {
    const entry = detailValue(key, raw[key]);
    if (entry) details.push({ key, label: detailLabel(key), value: entry });
  }
  const assertion = object(raw.assertion);
  if (assertion) readAssertion(assertion, details, technical);
  if (metadata && metadata.omitted_from_view !== true)
    readFields(
      Object.fromEntries(
        Object.entries(metadata).filter(([key]) => key !== "aggregation"),
      ),
      kind,
      details,
      technical,
    );
  if (kind && HEALTH_DAYS.has(kind))
    details.push({
      key: "vitals",
      label: "Vitals",
      value: { type: "text", text: "No vitals collected" },
    });
  // One entry per label: a time the reader states twice (on the record and
  // in its assertion) reads once.
  const unique = <T extends { label: string }>(entries: T[]) => {
    const seen = new Set<string>();
    return entries.filter((entry) =>
      seen.has(entry.label) ? false : (seen.add(entry.label), true),
    );
  };
  return { details: unique(details), technical: unique(technical) };
}

/** The device a record came from: System's optional `host` on the record or
 * in its metadata, when it names one of the owner's devices. */
export function recordHost(raw: Item): string | null {
  const host = text(raw.host) ?? text(object(raw.metadata)?.host);
  return host && hostDevice(host) ? host : null;
}

// The history.

export type HistoryEntry = {
  id: string;
  title: string;
  at: string | null;
  hash: string | null;
  current: boolean;
};

/**
 * Revisions as timeline entries, newest first as the reader sends them:
 * "Revision 2" for the newest of two, down to "Revision 1". A capped history
 * holds only the latest revisions, so its numbers are unknown and each entry
 * reads "Revision".
 */
export function historyEntries(
  revisions: ReadonlyArray<{
    id: string;
    version: string | null;
    observedAt: string | null;
  }>,
  currentId: string | null,
  capped: boolean,
): HistoryEntry[] {
  return revisions.map((revision, index) => ({
    id: revision.id,
    title: capped ? "Revision" : `Revision ${revisions.length - index}`,
    at: revision.observedAt,
    hash: revision.version,
    current: revision.id === currentId,
  }));
}
