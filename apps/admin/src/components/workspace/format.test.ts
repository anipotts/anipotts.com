import { describe, expect, it } from "vitest";
import {
  clockText,
  countText,
  dayKey,
  dayLabel,
  dueText,
  durationText,
  shortValue,
} from "./format";

describe("durations", () => {
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
  const now = new Date(2026, 8, 22, 14, 0).getTime();
  it("keys by the local day and heads with Today, Yesterday or the date", () => {
    expect(dayKey(new Date(2026, 8, 22, 0, 5).getTime())).toBe("2026-09-22");
    expect(dayKey("not a time")).toBe("");
    expect(dayLabel("2026-09-22", now)).toBe("Today");
    expect(dayLabel("2026-09-21", now)).toBe("Yesterday");
    expect(dayLabel("2026-09-19", now)).toBe("Sat, Sep 19");
    expect(dayLabel("2025-12-31", now)).toBe("Dec 31, 2025");
    expect(dayLabel("", now)).toBe("Undated");
  });

  it("reads a timeline moment on a 24-hour clock", () => {
    const at = new Date(2026, 8, 22, 11, 30).getTime();
    expect(clockText(at, now)).toBe("Sep 22, 11:30");
    expect(clockText(new Date(2025, 0, 2, 9, 5).getTime(), now)).toBe(
      "Jan 2, 2025, 09:05",
    );
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
