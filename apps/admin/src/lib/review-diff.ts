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

/** Patience anchors: exact unique lines in monotonically increasing order. */
function matchingAnchors(
  before: ReviewDiffLine[],
  after: ReviewDiffLine[],
  start: number,
  endBefore: number,
  endAfter: number,
): [number, number][] {
  const unique = (values: ReviewDiffLine[], end: number) => {
    const positions = new Map<string, number>();
    for (let index = start; index < end; index++) {
      const line = values[index]!;
      const key = line.text + line.ending;
      positions.set(key, positions.has(key) ? -1 : index);
    }
    return positions;
  };
  const left = unique(before, endBefore);
  const right = unique(after, endAfter);
  const candidates: [number, number][] = [];
  for (const [key, index] of left) {
    const match = right.get(key);
    if (index >= 0 && match !== undefined && match >= 0)
      candidates.push([index, match]);
  }

  // Map insertion order is before-line order. LIS prevents moved/reordered
  // anchors from crossing, without allocating an input-sized LCS matrix.
  const tails: number[] = [];
  const previous = new Int32Array(candidates.length).fill(-1);
  for (let index = 0; index < candidates.length; index++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (candidates[tails[middle]!]![1] < candidates[index]![1])
        low = middle + 1;
      else high = middle;
    }
    if (low) previous[index] = tails[low - 1]!;
    tails[low] = index;
  }
  const anchors: [number, number][] = [];
  let index = tails.at(-1) ?? -1;
  while (index >= 0) {
    anchors.push(candidates[index]!);
    index = previous[index]!;
  }
  return anchors.reverse();
}

/**
 * Line-first review with a bounded LCS matrix and one shared inline-work budget.
 * Large regions retain internal matches via O(n log n) patience anchors and
 * linear gap scans. Only matching context may be collapsed by the view. Joining
 * each side's text + ending reconstructs the exact input.
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
    let i = start;
    let j = start;
    const gap = (stopA: number, stopB: number) => {
      while (i < stopA && j < stopB) {
        // Also retain aligned repeated lines, which cannot be unique anchors.
        append(equal(i, j) ? "equal" : "changed", a[i++], b[j++]);
      }
      while (i < stopA) append("changed", a[i++]);
      while (j < stopB) append("changed", undefined, b[j++]);
    };
    for (const [anchorA, anchorB] of matchingAnchors(a, b, start, endA, endB)) {
      gap(anchorA, anchorB);
      append("equal", a[i++], b[j++]);
    }
    gap(endA, endB);
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
