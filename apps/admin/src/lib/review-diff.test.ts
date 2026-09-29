import { describe, expect, it } from "vitest";
import { reviewDiff } from "./review-diff";

function roundTrip(before: string, after: string) {
  const hunks = reviewDiff(before, after);
  for (const [side, original] of [
    ["before", before],
    ["after", after],
  ] as const) {
    const lines = hunks.flatMap((hunk) => hunk[side]);
    expect(lines.map((line) => line.text + line.ending).join("")).toBe(
      original,
    );
    expect(lines.map((line) => line.number)).toEqual(
      lines.map((_, i) => i + 1),
    );
    for (const line of lines) {
      expect(line.parts.map((part) => part.text).join("")).toBe(line.text);
      expect(
        line.parts.some(
          (part) => part.kind === (side === "before" ? "added" : "removed"),
        ),
      ).toBe(false);
    }
  }
  return hunks;
}

describe("conventional review line diff", () => {
  it.each([
    ["", ""],
    ["", "added"],
    ["removed\n", ""],
    ["old copy", "new copy"],
    [" old  \tcopy\r\n\nend", " new \t copy\n\nend\n"],
    ["a\nb\nc\nd\n", "a\nB\nc\nD\n"],
    ["a\nrepeat\nrepeat\nz", "a\nrepeat\nz"],
    ["👩🏽‍💻 café é\n你好", "👩🏽‍💻 cafés é\n再见"],
    ["\n\n", "\r\n\r\n"],
    ["a\rb", "a\nb"],
  ])("reconstructs both revisions exactly: %j → %j", (before, after) => {
    roundTrip(before, after);
  });

  it("keeps context between independent edits and original line numbering", () => {
    const hunks = roundTrip(
      "same\nold\ncontext\nmore old\nend\n",
      "same\nnew\ncontext\nmore new\nend\n",
    );
    expect(hunks.map((hunk) => hunk.kind)).toEqual([
      "equal",
      "changed",
      "equal",
      "changed",
      "equal",
    ]);
    expect(hunks[3]!.before[0]!.number).toBe(4);
    expect(hunks[3]!.after[0]!.parts).toContainEqual({
      kind: "added",
      text: "new",
    });
  });

  it("identifies final-newline and line-ending changes even with identical words", () => {
    const hunks = roundTrip("same\r\nfinal", "same\nfinal\n");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.before.every((line) => line.endingChanged)).toBe(true);
    expect(hunks[0]!.after.every((line) => line.endingChanged)).toBe(true);
  });

  it("keeps large replacements complete using bounded coarse comparison", () => {
    const before =
      "unchanged\n" +
      Array.from(
        { length: 1800 },
        (_, i) => `before ${i} ` + "x".repeat(100),
      ).join("\n") +
      "\nend";
    const after =
      "unchanged\n" +
      Array.from(
        { length: 1800 },
        (_, i) => `after ${i} ` + "y".repeat(100),
      ).join("\n") +
      "\nend";
    const hunks = roundTrip(before, after);
    expect(hunks.map((hunk) => hunk.kind)).toEqual([
      "equal",
      "changed",
      "equal",
    ]);
    expect(hunks[1]!.before).toHaveLength(1800);
    expect(hunks[1]!.after).toHaveLength(1800);
  });

  it.each([498, 798])(
    "retains %i internal unchanged lines between two edits above the matrix budget",
    (count) => {
      const context = Array.from(
        { length: count },
        (_, index) => `context ${index}\n`,
      ).join("");
      const hunks = roundTrip(
        `old first\n${context}old last\n`,
        `new first\n${context}new last\n`,
      );
      expect(hunks.map((hunk) => hunk.kind)).toEqual([
        "changed",
        "equal",
        "changed",
      ]);
      expect(hunks[1]!.before).toHaveLength(count);
      expect(hunks[1]!.after).toHaveLength(count);
      expect(
        hunks
          .filter((hunk) => hunk.kind === "changed")
          .flatMap((hunk) => hunk.before),
      ).toHaveLength(2);
      expect(
        hunks
          .filter((hunk) => hunk.kind === "changed")
          .flatMap((hunk) => hunk.after),
      ).toHaveLength(2);
    },
  );

  it("finds internal context after inserted lines shift large-document positions", () => {
    const context = Array.from(
      { length: 700 },
      (_, index) => `context ${index}\n`,
    ).join("");
    const hunks = roundTrip(
      `old first\n${context}old last\n`,
      `new first\ninserted\n${context}new last\n`,
    );
    expect(hunks.map((hunk) => hunk.kind)).toEqual([
      "changed",
      "equal",
      "changed",
    ]);
    expect(hunks[1]!.before).toHaveLength(700);
    expect(hunks[1]!.before[0]!.number).toBe(2);
    expect(hunks[1]!.after[0]!.number).toBe(3);
  });

  it("retains aligned repeated context even when no unique anchor exists", () => {
    const context = "repeated\n".repeat(600);
    const hunks = roundTrip(
      `old first\n${context}old last\n`,
      `new first\n${context}new last\n`,
    );
    expect(hunks.map((hunk) => hunk.kind)).toEqual([
      "changed",
      "equal",
      "changed",
    ]);
    expect(hunks[1]!.before).toHaveLength(600);
  });

  it("keeps moved anchors monotonic and never marks unequal source lines as context", () => {
    const first = Array.from(
      { length: 350 },
      (_, index) => `first ${index}\n`,
    ).join("");
    const second = Array.from(
      { length: 350 },
      (_, index) => `second ${index}\r\n`,
    ).join("");
    const hunks = roundTrip(first + second, second + first);
    const equal = hunks.filter((hunk) => hunk.kind === "equal");
    expect(equal.flatMap((hunk) => hunk.before).length).toBeGreaterThan(0);
    for (const hunk of equal) {
      expect(hunk.before.map((line) => line.text + line.ending)).toEqual(
        hunk.after.map((line) => line.text + line.ending),
      );
    }
  });

  it("round-trips deterministic mixed insertion, deletion and whitespace edits", () => {
    let seed = 912;
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
    const values = ["", "one", "two", "\tthree ", "四", " a  b "];
    const endings = ["\r\n", "\n", "\r"];
    for (let sample = 0; sample < 100; sample++) {
      const source = () =>
        Array.from(
          { length: next() % 16 },
          () =>
            values[next() % values.length]! + endings[next() % endings.length]!,
        ).join("");
      roundTrip(source(), source());
    }
  });
});
