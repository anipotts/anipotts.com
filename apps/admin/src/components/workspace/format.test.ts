import { describe, expect, it } from "vitest";
import {
  clockText,
  hourText,
  countText,
  dayKey,
  dayLabel,
  dueText,
  durationText,
  secondsText,
  shortValue,
} from "./format";

describe("durations", () => {
  it("reads a span in seconds in the same units, budgets and incidents alike", () => {
    // One formatter for every surface: a 30h budget and a 30h incident
    // read the same.
    expect(
      [45, 300, 4500, 93_600, 3 * 86_400, 30 * 3600].map(secondsText),
    ).toEqual(["45s", "5m", "1h 15m", "1d 2h", "3d", "1d 6h"]);
    expect(secondsText(30 * 3600)).toBe(durationText(30 * 3600 * 1000));
  });

  it("reads compact, in the largest two units", () => {
    expect(durationText(84)).toBe("84ms");
    expect(durationText(2000)).toBe("2s");
    expect(durationText(8420)).toBe("8.4s");
    expect(durationText(83_900)).toBe("1m 24s");
    expect(durationText(112_700)).toBe("1m 53s");
    expect(durationText(120_000)).toBe("2m");
    expect(durationText(7_500_000)).toBe("2h 5m");
    expect(durationText(3 * 86_400_000 + 4 * 3_600_000)).toBe("3d 4h");
    expect(durationText(null)).toBeNull();
    expect(durationText(-1)).toBeNull();
    expect(durationText(Number.NaN)).toBeNull();
  });
});

describe("due times", () => {
  const now = Date.parse("2026-09-22T18:01:39Z");
  it("counts down, holds for the grace, then counts overdue", () => {
    expect(dueText(Date.parse("2026-09-22T18:46:17Z"), now)).toEqual({
      text: "in 44m",
      overdue: false,
    });
    expect(dueText(now + 45_000, now).text).toBe("in 45s");
    expect(dueText(now - 30_000, now)).toEqual({
      text: "due now",
      overdue: false,
    });
    expect(dueText(now - 3 * 60_000, now)).toEqual({
      text: "3m overdue",
      overdue: true,
    });
    expect(dueText(now - 5_000, now, 0).overdue).toBe(true);
    expect(dueText(now + 26 * 3_600_000, now).text).toBe("in 1d");
  });
});

describe("days", () => {
  // 18:00 UTC is 14:00 EDT on Sep 22.
  const now = Date.UTC(2026, 8, 22, 18, 0);
  it("keys by the Eastern day and heads with Today, Yesterday or the date", () => {
    // 04:05 UTC on Sep 22 is still Sep 22 00:05 in New York...
    expect(dayKey(Date.UTC(2026, 8, 22, 4, 5))).toBe("2026-09-22");
    // ...and 03:55 UTC is Sep 21, 23:55 there, whatever the runtime's zone.
    expect(dayKey(Date.UTC(2026, 8, 22, 3, 55))).toBe("2026-09-21");
    expect(dayKey("not a time")).toBe("");
    expect(dayLabel("2026-09-22", now)).toBe("Today");
    expect(dayLabel("2026-09-21", now)).toBe("Yesterday");
    expect(dayLabel("2026-09-19", now)).toBe("Sat, Sep 19");
    expect(dayLabel("2025-12-31", now)).toBe("Dec 31, 2025");
    expect(dayLabel("", now)).toBe("Undated");
    // Just after midnight in New York, Yesterday is the Eastern one.
    const early = Date.UTC(2026, 8, 22, 4, 30);
    expect(dayLabel("2026-09-22", early)).toBe("Today");
    expect(dayLabel("2026-09-21", early)).toBe("Yesterday");
  });

  it("reads a timeline moment on a 24-hour Eastern clock, on any runtime", () => {
    expect(clockText(Date.UTC(2026, 8, 22, 15, 30), now)).toBe("Sep 22, 11:30");
    // Winter is EST, five hours behind UTC.
    expect(clockText(Date.UTC(2025, 0, 2, 14, 5), now)).toBe(
      "Jan 2, 2025, 09:05",
    );
    // The Worker renders in UTC: the text is still the Eastern one.
    expect(clockText(Date.UTC(2026, 8, 22, 21, 26), now)).toBe("Sep 22, 17:26");
    expect(hourText(Date.UTC(2026, 8, 23, 4, 7))).toBe("00:07");
  });
});

describe("values", () => {
  it("shortens digests and leaves short ids whole", () => {
    const digest =
      "3f2a9c1b7d4e5f60718293a4b5c6d7e8f9011223344556677889900aabbccdd";
    expect(shortValue(digest)).toBe("3f2a9c1b7d4e");
    expect(shortValue(`sha256:${digest}`)).toBe("3f2a9c1b7d4e");
    expect(shortValue("rec_1234")).toBe("rec_1234");
    expect(shortValue("browsing-day:2026-09-22")).toBe(
      "browsing-day:2026-09-22",
    );
  });

  it("counts with a noun", () => {
    expect(countText(44, ["visit", "visits"])).toBe("44 visits");
    expect(countText(1, ["visit", "visits"])).toBe("1 visit");
    expect(countText(1204)).toBe("1,204");
  });
});
