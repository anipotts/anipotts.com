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

/** The local calendar day of a time, as "YYYY-MM-DD", for grouping by day.
 * An unreadable time is "". */
export function dayKey(value: string | number | null | undefined): string {
  const ms = typeof value === "number" ? value : Date.parse(value ?? "");
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const WEEKDAY_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** A day key as a heading: "Today", "Yesterday", "Mon, Sep 21", or "Sep 21,
 * 2025" in another year. */
export function dayLabel(key: string, now: number = Date.now()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return "Undated";
  const day = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now).setDate(new Date(now).getDate() - 1)))
    return "Yesterday";
  return day.getFullYear() === new Date(now).getFullYear()
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

/**
 * A moment on a timeline: "Sep 22, 11:30" on a 24-hour clock, with the year
 * when it is not this year's ("Jan 2, 2025, 09:05"). Composed by hand, not by
 * Intl, so every engine writes the same text (ICU builds disagree on the
 * joiner). `utc` reads the UTC clock: a server render's text, which the
 * browser then replaces with its own local one.
 */
export function clockText(
  ms: number,
  now: number = Date.now(),
  utc = false,
): string {
  const at = new Date(ms);
  const year = utc ? at.getUTCFullYear() : at.getFullYear();
  const thisYear = utc
    ? new Date(now).getUTCFullYear()
    : new Date(now).getFullYear();
  const month = MONTHS[utc ? at.getUTCMonth() : at.getMonth()];
  const day = utc ? at.getUTCDate() : at.getDate();
  const hours = pad(utc ? at.getUTCHours() : at.getHours());
  const minutes = pad(utc ? at.getUTCMinutes() : at.getMinutes());
  const date =
    year === thisYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
  return `${date}, ${hours}:${minutes}`;
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
