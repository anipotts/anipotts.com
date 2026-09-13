import { describe, expect, it } from "vitest";
import { compactDiff, textDiff } from "./text-diff";

describe("publication text diff", () => {
  it.each([
    ["artist discovery", "music artist discovery"],
    ["our bad habit", "our bad habits"],
    ["AI (YC F25)", "ai (YC F25)."],
    ["same", "same"],
    ["", "new"],
    ["old", ""],
    ["", "added words ".repeat(10000)],
    ["removed words ".repeat(10000), ""],
    ["café 👋\n你好", "café! 👋\n你好"],
    ["[link](/old)", "[link](/new)"],
    ["**bold**", "bold"],
    ["a ".repeat(1100), "b ".repeat(1100)],
  ])("reconstructs both versions exactly: %s", (before, after) => {
    const parts = textDiff(before, after);
    expect(
      parts
        .filter((p) => p.kind !== "added")
        .map((p) => p.text)
        .join(""),
    ).toBe(before);
    expect(
      parts
        .filter((p) => p.kind !== "removed")
        .map((p) => p.text)
        .join(""),
    ).toBe(after);
  });
  it("isolates an added word", () => {
    expect(
      textDiff("and artist discovery", "and music artist discovery"),
    ).toEqual([
      { kind: "equal", text: "and " },
      { kind: "added", text: "music " },
      { kind: "equal", text: "artist discovery" },
    ]);
  });
  it("compacts only unchanged context", () => {
    const parts = textDiff(
      `${"context ".repeat(60)}old${" tail".repeat(60)}`,
      `${"context ".repeat(60)}new${" tail".repeat(60)}`,
    );
    const compact = compactDiff(parts);
    expect(compact.filter((p) => p.kind !== "equal")).toEqual(
      parts.filter((p) => p.kind !== "equal"),
    );
    expect(compact.map((p) => p.text).join("").length).toBeLessThan(220);
  });
});
