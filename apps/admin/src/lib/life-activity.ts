const stages = new Set([
  "discovered",
  "available",
  "captured",
  "validated",
  "recorded",
  "indexed",
  "identity_changed",
  "wiki_updated",
  "wiki_published",
  "source_observed",
  "source_registered",
  "failed",
  "excluded",
  "retried",
  "quarantined",
]);
const states = new Set([
  "observed",
  "succeeded",
  "failed",
  "pending",
  "blocked",
  "skipped",
  "excluded",
]);
const fields = [
  "change_id",
  "trace_id",
  "stage",
  "state",
  "record_count",
  "observed_at",
];
export type LifeActivity = {
  change_id: number;
  trace_id: string;
  stage: string;
  state: string;
  record_count: number;
  observed_at: string;
};
export type ActivityWindow = {
  cursor: number;
  items: LifeActivity[];
  catchingUp: boolean;
};
export const emptyActivity = (): ActivityWindow => ({
  cursor: 0,
  items: [],
  catchingUp: false,
});
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function checkpoint(value: unknown): LifeActivity {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid activity");
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(item, field)) ||
    !count(item.change_id) ||
    !count(item.record_count) ||
    typeof item.trace_id !== "string" ||
    !/^[0-9a-f]{32}$/i.test(item.trace_id) ||
    /^0+$/.test(item.trace_id) ||
    typeof item.stage !== "string" ||
    !stages.has(item.stage) ||
    typeof item.state !== "string" ||
    !states.has(item.state) ||
    typeof item.observed_at !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(item.observed_at) ||
    !Number.isFinite(Date.parse(item.observed_at))
  )
    throw new Error("Invalid activity metadata");
  return item as LifeActivity;
}
/** Transactional projection: malformed pages never advance the resume cursor. */
export function applyActivityPage(
  current: ActivityWindow,
  data: Record<string, unknown>,
): ActivityWindow {
  if (
    !Array.isArray(data.items) ||
    data.items.length > 100 ||
    !count(data.next_cursor)
  )
    throw new Error("Invalid activity page");
  const incoming = data.items.map(checkpoint);
  const cursor = incoming.at(-1)?.change_id ?? current.cursor;
  if (
    data.next_cursor !== cursor ||
    cursor < current.cursor ||
    incoming.some(
      (item, index) =>
        index > 0 && item.change_id <= incoming[index - 1]!.change_id,
    )
  )
    throw new Error("Inconsistent activity cursor");
  const known = new Map(current.items.map((item) => [item.change_id, item]));
  for (const item of incoming) {
    const previous = known.get(item.change_id);
    if (
      previous &&
      fields.some(
        (field) =>
          previous[field as keyof LifeActivity] !==
          item[field as keyof LifeActivity],
      )
    )
      throw new Error("Activity checkpoint changed");
    if (item.change_id > current.cursor) known.set(item.change_id, item);
  }
  if (incoming.length === 100 && cursor === current.cursor)
    throw new Error("Activity cursor did not advance");
  return {
    cursor,
    items: [...known.values()]
      .sort((a, b) => a.change_id - b.change_id)
      .slice(-100),
    catchingUp: incoming.length === 100,
  };
}
