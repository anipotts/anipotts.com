import type { LifeRead, LifeResult } from "../data/personal-context";

export type LifeReader = (request: LifeRead) => Promise<LifeResult>;

/** One independent instance per list/detail view; late responses cannot replace newer reads. */
export class LifeReadSession {
  private generation = 0;
  private pending?: { reader: LifeReader; key: string; generation: number };
  invalidate() {
    this.generation += 1;
    this.pending = undefined;
  }
  async run(reader: LifeReader, request: LifeRead): Promise<LifeResult | null> {
    const key = JSON.stringify(request);
    if (this.pending?.reader === reader && this.pending.key === key)
      return null;
    const generation = ++this.generation;
    this.pending = { reader, key, generation };
    let result: LifeResult;
    try {
      result = await reader(request);
    } catch {
      result = {
        state: "unavailable",
        message: "The read could not be completed.",
      };
    }
    if (this.pending?.generation === generation) this.pending = undefined;
    return generation === this.generation ? result : null;
  }
}

/** Append only a contiguous chunk of the same canonical revision. */
export function appendLifeBody(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const offset = current.next_body_offset;
  const validOffset = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 10_000_000;
  if (
    !validOffset(offset) ||
    next.record_id !== current.record_id ||
    next.revision_id !== current.revision_id ||
    next.body_offset !== offset ||
    typeof current.body !== "string" ||
    typeof next.body !== "string" ||
    (next.next_body_offset !== null &&
      (!validOffset(next.next_body_offset) || next.next_body_offset <= offset))
  ) {
    throw new Error("This record changed. Reload it before reading further.");
  }
  const body = current.body + next.body;
  if (new TextEncoder().encode(body).byteLength > 1024 * 1024)
    throw new Error("This reading view has reached its text limit.");
  return {
    ...current,
    body,
    next_body_offset: next.next_body_offset,
    body_truncated: next.next_body_offset !== null,
  };
}
