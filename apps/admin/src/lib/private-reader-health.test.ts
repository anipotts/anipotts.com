import { describe, expect, it, vi } from "vitest";
import { createPrivateReaderSession } from "./private-reader-client";
import { PRIVATE_READER_HEALTH_PATH } from "./private-reader-credential";
import { PRIVATE_READER_ORIGIN } from "./private-reader-fetch";
import {
  HEALTH_CREDENTIAL_ENDPOINT,
  HealthDailyError,
  healthDailyPath,
  parseHealthDaily,
  readHealthDaily,
} from "./private-reader-health";

// Synthetic values only, in System's exact shape (store.health_daily behind
// the personal_context_data_v1 envelope, System 688b81a).
const day = (date: string, extra: Record<string, unknown> = {}) => ({
  date,
  sleep_h: null,
  steps: 1000,
  resting_hr_bpm: null,
  hrv_avg_ms: null,
  weight_lbs: null,
  ...extra,
});
const reply = (
  items: unknown[],
  days = 30,
  page: Record<string, unknown> = {},
  envelope: Record<string, unknown> = {},
) => ({
  schema: "personal_context_data_v1",
  response_observed_at: "2026-09-22T19:00:00Z",
  data: { items, days, ...page },
  ...envelope,
});

describe("the daily health contract", () => {
  it("reads System's own shape, nulls included", () => {
    const parsed = parseHealthDaily(
      reply([
        day("2026-09-21", { sleep_h: 7.5, steps: 1001, resting_hr_bpm: 55 }),
        day("2026-09-20", { steps: null, hrv_avg_ms: 60, weight_lbs: 150 }),
      ]),
      30,
    );
    expect(parsed).toEqual({
      observedAt: "2026-09-22T19:00:00Z",
      days: 30,
      lastPushAt: null,
      items: [
        {
          date: "2026-09-21",
          steps: 1001,
          sleepHours: 7.5,
          restingHeartRate: 55,
          hrv: null,
          weightLbs: null,
        },
        {
          date: "2026-09-20",
          steps: null,
          sleepHours: null,
          restingHeartRate: null,
          hrv: 60,
          weightLbs: 150,
        },
      ],
    });
  });

  it("accepts System's proposed last phone push, and only as a time", () => {
    expect(
      parseHealthDaily(
        reply([], 7, { last_push_at: "2026-09-22T18:40:00Z" }),
        7,
      ).lastPushAt,
    ).toBe("2026-09-22T18:40:00Z");
    expect(
      parseHealthDaily(reply([], 7, { last_push_at: null }), 7).lastPushAt,
    ).toBeNull();
    expect(() =>
      parseHealthDaily(reply([], 7, { last_push_at: "yesterday" }), 7),
    ).toThrow(HealthDailyError);
  });

  it.each([
    ["another health field", reply([day("2026-09-21", { spo2_avg_pct: 97 })])],
    ["a missing field", reply([{ date: "2026-09-21", steps: 1 }])],
    ["a private kind's field", reply([day("2026-09-21", { mood: "x" })])],
    ["an unknown page field", reply([], 30, { workouts: [] })],
    ["an unknown envelope field", reply([], 30, {}, { debug: true })],
    ["another schema", reply([], 30, {}, { schema: "health_daily_v1" })],
    ["a range other than asked", reply([], 7)],
    [
      "more days than the range",
      reply([day("2026-09-21"), day("2026-09-20")], 1),
    ],
    ["a string reading", reply([day("2026-09-21", { steps: "1000" })])],
    ["fractional steps", reply([day("2026-09-21", { steps: 10.5 })])],
    ["a negative reading", reply([day("2026-09-21", { resting_hr_bpm: -1 })])],
    ["an impossible sleep", reply([day("2026-09-21", { sleep_h: 25 })])],
    [
      "a non-finite reading",
      reply([day("2026-09-21", { hrv_avg_ms: Infinity })]),
    ],
    ["an impossible date", reply([day("2026-02-30")])],
    ["a timestamp for a date", reply([day("2026-09-21T00:00:00Z")])],
    [
      "an unreadable observation time",
      reply([], 30, {}, { response_observed_at: "now" }),
    ],
    ["items that are not objects", reply([["2026-09-21", 1]])],
  ])("rejects the whole reply for %s", (_name, value) => {
    expect(() => parseHealthDaily(value, 30)).toThrow(HealthDailyError);
  });

  it("keeps one row per date, the first in System's order", () => {
    const parsed = parseHealthDaily(
      reply([day("2026-09-21", { steps: 5 }), day("2026-09-21", { steps: 9 })]),
      30,
    );
    expect(parsed.items.map((item) => item.steps)).toEqual([5]);
  });

  it("asks only for a range System serves", () => {
    expect(healthDailyPath(30)).toBe("/v1/health/daily?days=30");
    for (const days of [0, 91, 1.5, -1, Number.NaN])
      expect(() => healthDailyPath(days)).toThrow();
    expect(HEALTH_CREDENTIAL_ENDPOINT).toBe(PRIVATE_READER_HEALTH_PATH);
  });
});

describe("the health read", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const session = (_scope: string[], fetcher: typeof fetch) =>
    createPrivateReaderSession({
      fetch: fetcher,
      csrf: async () => "c".repeat(64),
      endpoint: HEALTH_CREDENTIAL_ENDPOINT,
    });
  const issuing = (scope: string[]) =>
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), "https://admin.anipotts.com");
      if (url.pathname === HEALTH_CREDENTIAL_ENDPOINT) {
        const now = Math.floor(Date.now() / 1000);
        return json({
          credential: "synthetic.jws",
          scope,
          expiresAt: now + 60,
        });
      }
      return json(reply([day("2026-09-21")], 7));
    });

  it("sends one bearer to the exact route, nothing stored", async () => {
    const fetcher = issuing(["health:read"]);
    const health = session(["health:read"], fetcher as unknown as typeof fetch);
    await health.start();
    const data = await readHealthDaily(health, 7, {
      fetch: fetcher as unknown as typeof fetch,
    });
    expect(data.items).toHaveLength(1);
    const [input, init] = fetcher.mock.calls.at(-1)!;
    expect(String(input)).toBe(
      `${PRIVATE_READER_ORIGIN}/v1/health/daily?days=7`,
    );
    expect(init).toMatchObject({
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Authorization: "Bearer synthetic.jws" },
    });
  });

  it("refuses and clears a credential with any other scope before sending", async () => {
    for (const scope of [["data:read"], ["health:read", "data:read"], []]) {
      const fetcher = issuing(scope);
      const health = session(scope, fetcher as unknown as typeof fetch);
      await health.start();
      const before = fetcher.mock.calls.length;
      await expect(
        readHealthDaily(health, 7, {
          fetch: fetcher as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ failure: "forbidden" });
      expect(fetcher.mock.calls.length).toBe(before);
      expect(health.getState()).toEqual({
        status: "cleared",
        reason: "denied",
      });
    }
  });
});
