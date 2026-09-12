export type DiffPart = { kind: "equal" | "added" | "removed"; text: string };

/** Word-level diff, preserving punctuation and whitespace exactly. */
export function textDiff(before: string, after: string): DiffPart[] {
  const tokenize = (value: string) =>
    value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
  const a = tokenize(before);
  const b = tokenize(after);
  const result: DiffPart[] = [];
  const append = (kind: DiffPart["kind"], text: string) => {
    if (!text) return;
    const last = result.at(-1);
    if (last?.kind === kind) last.text += text;
    else result.push({ kind, text });
  };
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  append("equal", a.slice(0, start).join(""));
  const rows = endA - start,
    cols = endB - start;
  // Insertions/deletions need no matrix. Large replacements use a bounded coarse diff.
  if (rows === 0 || cols === 0 || rows * cols > 1_000_000) {
    append("removed", a.slice(start, endA).join(""));
    append("added", b.slice(start, endB).join(""));
  } else {
    const table = Array.from(
      { length: rows + 1 },
      () => new Uint32Array(cols + 1),
    );
    for (let i = rows - 1; i >= 0; i--)
      for (let j = cols - 1; j >= 0; j--)
        table[i]![j] =
          a[start + i] === b[start + j]
            ? 1 + table[i + 1]![j + 1]!
            : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    let i = 0,
      j = 0;
    while (i < rows || j < cols) {
      if (i < rows && j < cols && a[start + i] === b[start + j]) {
        append("equal", a[start + i++]!);
        j++;
      } else if (
        i < rows &&
        (j === cols || table[i + 1]![j]! >= table[i]![j + 1]!)
      ) {
        append("removed", a[start + i++]!);
      } else append("added", b[start + j++]!);
    }
  }
  append("equal", a.slice(endA).join(""));
  return result;
}

/** Hide only unchanged context; changed text always remains complete. */
export function compactDiff(parts: DiffPart[], context = 72): DiffPart[] {
  return parts.map((part, index) => {
    if (part.kind !== "equal" || part.text.length <= context * 2) return part;
    const head = part.text.slice(0, context).replace(/\S+$/u, "");
    const tail = part.text.slice(-context).replace(/^\S+/u, "");
    return {
      ...part,
      text:
        index === 0
          ? `…${tail}`
          : index === parts.length - 1
            ? `${head}…`
            : `${head} … ${tail}`,
    };
  });
}
