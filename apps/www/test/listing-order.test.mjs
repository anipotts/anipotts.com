import assert from "node:assert/strict";
import test from "node:test";
import {
  byNewestThenSlug,
  byRankThenSlug,
  compareSlug,
} from "../src/lib/listing-order.ts";

const time = (entry) => entry.date?.getTime();
const slug = (entry) => entry.slug;

// Every permutation must land in the same order, so input order cannot leak
// through a tie (the Git glob and a CMS overlay hand entries over differently).
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

test("writing on the same date orders by slug", () => {
  const entries = [
    { slug: "zeta", date: new Date("2026-04-07") },
    { slug: "alpha", date: new Date("2026-04-07") },
    { slug: "newer", date: new Date("2026-07-14") },
    { slug: "undated" },
    { slug: "older", date: new Date("2026-01-31") },
  ];
  const expected = ["newer", "alpha", "zeta", "older", "undated"];
  for (const order of permutations(entries))
    assert.deepEqual(
      order.toSorted(byNewestThenSlug(time, slug)).map(slug),
      expected,
    );
});

test("work and home placements with equal rank order by slug", () => {
  const rank = (entry) => entry.rank;
  const entries = [
    { slug: "structured-ai", rank: 100 },
    { slug: "quantercise", rank: 100 },
    { slug: "imessage-mcp", rank: 90 },
    { slug: "saeshify", rank: 0 },
    { slug: "chainedchat", rank: 0 },
  ];
  const expected = [
    "quantercise",
    "structured-ai",
    "imessage-mcp",
    "chainedchat",
    "saeshify",
  ];
  for (const order of permutations(entries))
    assert.deepEqual(
      order.toSorted(byRankThenSlug(rank, slug)).map(slug),
      expected,
    );
});

test("slug tie-break is code point order, not locale order", () => {
  assert.equal(compareSlug("a-b", "a-b"), 0);
  assert.ok(compareSlug("Zed", "apple") < 0);
  assert.ok(compareSlug("a-b", "ab") < 0);
});
