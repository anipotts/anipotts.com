import { textDiff, type DiffPart } from "./text-diff";

export type ReviewDiffLine = {
  number: number;
  text: string;
  ending: string;
  parts: DiffPart[];
  endingChanged?: boolean;
};

export type ReviewDiffHunk = {
  kind: "equal" | "changed";
  before: ReviewDiffLine[];
  after: ReviewDiffLine[];
};

const MATRIX_BUDGET = 250_000;

/** Keep line endings separately so CRLF and missing-final-newline edits survive. */
function lines(source: string): ReviewDiffLine[] {
  return (source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/gu) ?? []).map(
    (value, index) => {
      const ending = value.match(/(?:\r\n|\r|\n)$/u)?.[0] ?? "";
      const text = value.slice(0, value.length - ending.length);
      return {
        number: index + 1,
        text,
        ending,
        parts: [{ kind: "equal", text }],
      };
    },
  );
}

/**
 * Line-first review with a bounded LCS matrix and one shared inline-work budget.
 * Large replacements remain complete; only matching context may be collapsed by
 * the view. Joining each side's text + ending reconstructs the exact input.
 */
export function reviewDiff(before: string, after: string): ReviewDiffHunk[] {
  const a = lines(before);
  const b = lines(after);
  const equal = (i: number, j: number) =>
    a[i]!.text === b[j]!.text && a[i]!.ending === b[j]!.ending;
  const hunks: ReviewDiffHunk[] = [];
  const append = (
    kind: ReviewDiffHunk["kind"],
    left?: ReviewDiffLine,
    right?: ReviewDiffLine,
  ) => {
    let hunk = hunks.at(-1);
    if (!hunk || hunk.kind !== kind) {
      hunk = { kind, before: [], after: [] };
      hunks.push(hunk);
    }
    if (left) hunk.before.push(left);
    if (right) hunk.after.push(right);
  };
  let start = 0;
  while (start < a.length && start < b.length && equal(start, start)) {
    append("equal", a[start], b[start]);
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && equal(endA - 1, endB - 1)) {
    endA--;
    endB--;
  }
  const rows = endA - start;
  const cols = endB - start;
  if (!rows || !cols || (rows + 1) * (cols + 1) > MATRIX_BUDGET) {
    for (let i = start; i < endA; i++) append("changed", a[i]);
    for (let j = start; j < endB; j++) append("changed", undefined, b[j]);
  } else {
    const stride = cols + 1;
    const table = new Uint32Array((rows + 1) * stride);
    for (let i = rows - 1; i >= 0; i--)
      for (let j = cols - 1; j >= 0; j--)
        table[i * stride + j] = equal(start + i, start + j)
          ? 1 + table[(i + 1) * stride + j + 1]!
          : Math.max(table[(i + 1) * stride + j]!, table[i * stride + j + 1]!);
    let i = 0;
    let j = 0;
    while (i < rows || j < cols) {
      if (i < rows && j < cols && equal(start + i, start + j)) {
        append("equal", a[start + i++], b[start + j++]);
      } else if (
        i < rows &&
        (j === cols ||
          table[(i + 1) * stride + j]! >= table[i * stride + j + 1]!)
      ) {
        append("changed", a[start + i++]);
      } else {
        append("changed", undefined, b[start + j++]);
      }
    }
  }
  while (endA < a.length && endB < b.length)
    append("equal", a[endA++], b[endB++]);

  let inlineBudget = MATRIX_BUDGET;
  for (const hunk of hunks) {
    if (hunk.kind === "equal") continue;
    for (
      let index = 0;
      index < Math.max(hunk.before.length, hunk.after.length);
      index++
    ) {
      const left = hunk.before[index];
      const right = hunk.after[index];
      // String lengths bound token counts; total word-diff matrix work is capped.
      const cost = (left?.text.length ?? 0) * (right?.text.length ?? 0);
      const parts =
        left && right && left.text === right.text
          ? [{ kind: "equal" as const, text: left.text }]
          : left && right && cost <= inlineBudget
            ? textDiff(left.text, right.text)
            : [
                ...(left
                  ? [{ kind: "removed" as const, text: left.text }]
                  : []),
                ...(right
                  ? [{ kind: "added" as const, text: right.text }]
                  : []),
              ];
      inlineBudget -= Math.min(cost, inlineBudget);
      if (left) {
        left.parts = parts.filter((part) => part.kind !== "added");
        left.endingChanged = Boolean(right && left.ending !== right.ending);
      }
      if (right) {
        right.parts = parts.filter((part) => part.kind !== "removed");
        right.endingChanged = Boolean(left && left.ending !== right.ending);
      }
    }
  }
  return hunks;
}
