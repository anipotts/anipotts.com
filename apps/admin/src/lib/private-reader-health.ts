import {
  createPrivateReaderSession,
  type PrivateReaderSession,
} from "./private-reader-client";
import {
  PRIVATE_READER_BOUNDS,
  PRIVATE_READER_ROUTES,
  PrivateReaderError,
  readerFetch,
} from "./private-reader-fetch";
import { readEditorialCsrf } from "./editorial-client";
import { trackPrivateSession } from "./private-session-store";
import { strictReaders } from "./strict-json";

/**
 * Browser reads of System's daily health summary, `GET /v1/health/daily`
 * under the `health:read` scope (System 688b81a, memory/personal_context
 * store.health_daily). The credential comes from its own issuance route,
 * which carries only `health:read`; a credential with any other scope is
 * refused before it is sent. Readings live in memory only, like every
 * private read (lib/private-reader-fetch.ts), and go with the session.
 *
 * Nothing here runs unless PRIVATE_READER_ENABLED and
 * PRIVATE_READER_HEALTH_ENABLED are both exactly "true" on the server;
 * production sets neither health flag, and development reads a synthetic
 * fixture.
 *
 * The parser is strict: the envelope, the page and every day have exactly
 * the fields System serves, each value is a number in range or null, and
 * anything else rejects the whole reply. No other health field is ever read.
 */
export const HEALTH_DAILY_PATH = PRIVATE_READER_ROUTES.health;
/** Mirrors PRIVATE_READER_HEALTH_PATH without pulling signing code into the
 * client. */
export const HEALTH_CREDENTIAL_ENDPOINT =
  "/api/private-reader/health-credential";
export const HEALTH_SCOPE = "health:read";
/** The ranges the view offers, in days. System serves 1 to 90. */
export const HEALTH_RANGES = [7, 30, 90] as const;
export type HealthRange = (typeof HEALTH_RANGES)[number];
export const HEALTH_DEFAULT_RANGE: HealthRange = 30;

/** One day, as System's summary gives it. Null is a reading System does not
 * have for that day. */
export type HealthDay = {
  date: string;
  steps: number | null;
  sleepHours: number | null;
  restingHeartRate: number | null;
  hrv: number | null;
  weightLbs: number | null;
};

export type HealthDaily = {
  /** When the reader answered. */
  observedAt: string;
  /** The range asked for. */
  days: number;
  /** Newest first, as System orders them; one row per date. */
  items: HealthDay[];
};

/** A reply that breaks the contract. It never carries the reply's text. */
export class HealthDailyError extends Error {
  constructor() {
    super("Health reply outside the contract");
    this.name = "HealthDailyError";
  }
}

const ENVELOPE_KEYS = ["data", "response_observed_at", "schema"];
/** store.health_daily's page is exactly these, plus an optional
 * `last_push_at`, which is checked and never read: the last phone sync
 * comes from the ops snapshot (lib/health-metrics.ts). The parser stays
 * this shape until System ships health_daily_v1 together with an admin
 * parser change. */
const PAGE_KEYS = ["days", "items"];
const PAGE_OPTIONAL = ["last_push_at"];
const DAY_KEYS = [
  "date",
  "hrv_avg_ms",
  "resting_hr_bpm",
  "sleep_h",
  "steps",
  "weight_lbs",
];

/** Each reading's type and range. The ranges only bound a contract break
 * (a unit mix-up, a stray value); they judge nothing. */
const READINGS = {
  steps: { key: "steps", max: 1_000_000, integer: true },
  sleepHours: { key: "sleep_h", max: 24, integer: false },
  restingHeartRate: { key: "resting_hr_bpm", max: 300, integer: false },
  hrv: { key: "hrv_avg_ms", max: 2000, integer: false },
  weightLbs: { key: "weight_lbs", max: 1500, integer: false },
} as const;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const {
  plain,
  exactKeys,
  time: timestamp,
} = strictReaders(() => {
  throw new HealthDailyError();
});

function calendarDate(value: unknown): string {
  const match = typeof value === "string" ? DATE.exec(value) : null;
  if (!match) throw new HealthDailyError();
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    throw new HealthDailyError();
  return value as string;
}

function reading(
  value: unknown,
  { max, integer }: { max: number; integer: boolean },
): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new HealthDailyError();
  return value;
}

export function validHealthDays(days: number): boolean {
  const { min, max } = PRIVATE_READER_BOUNDS.healthDays;
  return Number.isSafeInteger(days) && days >= min && days <= max;
}

/** The one path the view reads. */
export function healthDailyPath(days: number): string {
  if (!validHealthDays(days)) throw new Error("Out of bounds");
  return `${HEALTH_DAILY_PATH}?days=${days}`;
}

/** System's reply for `days`, strictly. */
export function parseHealthDaily(value: unknown, days: number): HealthDaily {
  const envelope = plain(value);
  exactKeys(envelope, ENVELOPE_KEYS);
  if (envelope.schema !== "personal_context_data_v1")
    throw new HealthDailyError();
  const observedAt = timestamp(envelope.response_observed_at);
  const page = plain(envelope.data);
  exactKeys(page, PAGE_KEYS, PAGE_OPTIONAL);
  if (page.last_push_at !== undefined && page.last_push_at !== null)
    timestamp(page.last_push_at);
  if (page.days !== days || !Array.isArray(page.items))
    throw new HealthDailyError();
  if (page.items.length > days) throw new HealthDailyError();
  const seen = new Set<string>();
  const items: HealthDay[] = [];
  for (const entry of page.items) {
    const day = plain(entry);
    exactKeys(day, DAY_KEYS);
    const date = calendarDate(day.date);
    const parsed: HealthDay = {
      date,
      steps: reading(day[READINGS.steps.key], READINGS.steps),
      sleepHours: reading(day[READINGS.sleepHours.key], READINGS.sleepHours),
      restingHeartRate: reading(
        day[READINGS.restingHeartRate.key],
        READINGS.restingHeartRate,
      ),
      hrv: reading(day[READINGS.hrv.key], READINGS.hrv),
      weightLbs: reading(day[READINGS.weightLbs.key], READINGS.weightLbs),
    };
    // Two sources can summarise one date; the first, in System's order, is
    // the row.
    if (seen.has(date)) continue;
    seen.add(date);
    items.push(parsed);
  }
  return { observedAt, days, items };
}

type BearerSource = Pick<
  PrivateReaderSession,
  "bearer" | "renew" | "deny" | "getState"
>;

/** True only for a credential whose scope is exactly `health:read`. */
function healthScoped(session: BearerSource): boolean {
  const state = session.getState();
  return (
    state.status === "ready" &&
    state.credential.scope.length === 1 &&
    state.credential.scope[0] === HEALTH_SCOPE
  );
}

/**
 * One `GET /v1/health/daily?days=` through the shared reader fetch (one
 * bearer, CORS, no-store, no referrer, a 401 renews once). Before every
 * send, the renewed one included, a credential that is not exactly
 * `health:read` is refused and cleared, so no other scope ever leaves.
 */
export async function readHealthDaily(
  session: BearerSource,
  days: number,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<HealthDaily> {
  const path = healthDailyPath(days);
  const body = await readerFetch(session, path, {
    ...options,
    beforeSend: () => {
      if (session.getState().status === "ready" && !healthScoped(session)) {
        session.deny();
        throw new PrivateReaderError(403, "forbidden");
      }
    },
  });
  return parseHealthDaily(body, days);
}

let shared: PrivateReaderSession | null = null;

/** The document's health session: its own credential, under the same idle
 * rule, page-hide logout and memory-only custody as the Data session. */
export function sharedHealthSession(): PrivateReaderSession {
  if (!shared) {
    shared = createPrivateReaderSession({
      fetch: (...args) => globalThis.fetch(...args),
      csrf: readEditorialCsrf,
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
    trackPrivateSession(shared);
  }
  return shared;
}
