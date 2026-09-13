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
