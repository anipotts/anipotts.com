/**
 * The kit's text formats, pure so every cell and test reads the same clock
 * the same way. Units are compact and never spaced, matching the relative
 * times ("12s ago"): "84ms", "8.4s", "1m 24s", "in 12m", "3m overdue".
 */

/** A duration in milliseconds: "84ms", "8.4s", "45s", "1m 24s", "2h 5m",
 * "3d 4h". Null for no duration. */
export function durationText(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 10) {
    const tenths = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)}s`;
  }
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const pair = (big: number, small: number, a: string, b: string) =>
    small ? `${big}${a} ${small}${b}` : `${big}${a}`;
  if (whole < 3600) return pair(Math.floor(whole / 60), whole % 60, "m", "s");
  if (whole < 86400)
    return pair(
      Math.floor(whole / 3600),
      Math.floor((whole % 3600) / 60),
      "h",
      "m",
    );
  return pair(
    Math.floor(whole / 86400),
    Math.floor((whole % 86400) / 3600),
    "d",
    "h",
  );
}

/** A span given in seconds (a freshness budget, an uptime), in the same
 * units as every other duration: "45s", "1h 15m", "1d 2h". */
export function secondsText(seconds: number): string {
  return durationText(Math.max(0, Math.floor(seconds)) * 1000) ?? "0s";
}

/** A span in one unit, as relative times use: "45s", "12m", "3h", "2d". */
function span(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** When something is next due: "in 12m" ahead, "due now" within `graceS`
 * after, then "12m overdue". */
export function dueText(
  at: number,
  now: number,
  graceS = 60,
): { text: string; overdue: boolean } {
  const seconds = Math.round((at - now) / 1000);
  if (seconds > 0) return { text: `in ${span(seconds)}`, overdue: false };
  if (-seconds < graceS) return { text: "due now", overdue: false };
  return { text: `${span(-seconds)} overdue`, overdue: true };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Every absolute time admin shows reads in Eastern Time, the zone of the
 * page's live clock, on the server and in the browser alike: a table's
 * "07:04" never disagrees with the "3:04:12 AM ET" beside it, and a first
 * paint is never rewritten. */
export const ADMIN_TIME_ZONE = "America/New_York";

const EASTERN_FIELDS = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

/** A moment's calendar fields in Eastern Time (month 1 to 12). */
export function easternParts(ms: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts: Record<string, string> = {};
  for (const part of EASTERN_FIELDS.formatToParts(ms))
    parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some engines write midnight as "24" under h23.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

const keyOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** The Eastern calendar day of a time, as "YYYY-MM-DD", for grouping by day.
 * An unreadable time is "". */
export function dayKey(value: string | number | null | undefined): string {
  const ms = typeof value === "number" ? value : Date.parse(value ?? "");
  if (!Number.isFinite(ms)) return "";
  const { year, month, day } = easternParts(ms);
  return keyOf(year, month, day);
}

const WEEKDAY_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** A day key as a heading: "Today", "Yesterday", "Mon, Sep 21", or "Sep 21,
 * 2025" in another year, judged on the Eastern calendar. */
export function dayLabel(key: string, now: number = Date.now()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return "Undated";
  // A calendar date, drawn at noon UTC so no zone moves it.
  const day = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  const today = easternParts(now);
  if (key === keyOf(today.year, today.month, today.day)) return "Today";
  const before = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
  if (
    key ===
    keyOf(
      before.getUTCFullYear(),
      before.getUTCMonth() + 1,
      before.getUTCDate(),
    )
  )
    return "Yesterday";
  return Number(match[1]) === today.year
    ? WEEKDAY_DAY.format(day)
    : DAY_YEAR.format(day);
}

const MONTHS = [
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

/** A month's short name, 1 to 12. */
export const monthName = (month: number) => MONTHS[month - 1];

/**
 * A moment on a timeline: "Sep 22, 11:30" on a 24-hour clock in Eastern
 * Time, with the year when it is not this year's ("Jan 2, 2025, 09:05").
 * Composed by hand, not by Intl, so every engine writes the same text (ICU
 * builds disagree on the joiner), and the server writes what the browser
 * keeps.
 */
export function clockText(ms: number, now: number = Date.now()): string {
  const at = easternParts(ms);
  const thisYear = easternParts(now).year;
  const month = MONTHS[at.month - 1];
  const date =
    at.year === thisYear
      ? `${month} ${at.day}`
      : `${month} ${at.day}, ${at.year}`;
  return `${date}, ${pad(at.hour)}:${pad(at.minute)}`;
}

/** Only the clock of clockText, "16:02", for rows under a day heading. */
export function hourText(ms: number): string {
  const at = easternParts(ms);
  return `${pad(at.hour)}:${pad(at.minute)}`;
}

/** A hash or long id as a row shows it: a digest loses its algorithm prefix
 * and keeps its first 12 characters; anything up to 16 characters stays
 * whole. Everything else is left to the cell's ellipsis. */
export function shortValue(value: string): string {
  const digest = /^(?:sha(?:1|256|512)[:-])?([0-9a-f]{17,})$/i.exec(value);
  return digest ? digest[1]!.slice(0, 12) : value;
}

const NUMBER = new Intl.NumberFormat("en-US");

/** A count with its noun: "1 visit", "44 visits", "1,204 visits". */
export function countText(
  value: number,
  noun?: readonly [one: string, many: string] | null,
): string {
  const figure = NUMBER.format(value);
  if (!noun) return figure;
  return `${figure} ${value === 1 ? noun[0] : noun[1]}`;
}
