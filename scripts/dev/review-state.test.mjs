import { test } from "node:test";
import assert from "node:assert/strict";
import { syncHealth, nodeSupported } from "./review-state.mjs";
test("sync freshness depends on checked time, not publication age", () => {
  const now = Date.now();
  assert.equal(
    syncHealth(
      {
        version: 12,
        syncedAt: "2020-01-01",
        checkedAt: new Date(now - 1000).toISOString(),
      },
      now,
    ).state,
    "current",
  );
  assert.equal(
    syncHealth({ checkedAt: new Date(now - 31000).toISOString() }, now).state,
    "stale",
  );
  assert.equal(
    syncHealth(
      {
        checkedAt: new Date(now).toISOString(),
        error: "authorization unavailable",
      },
      now,
    ).state,
    "error",
  );
  assert.equal(syncHealth(null, now).state, "unavailable");
});
test("runtime gate matches supported engines", () => {
  for (const v of ["24.19.0", "24.20.0", "25.0.0"])
    assert.equal(nodeSupported(v), true);
  for (const v of ["22.0.0", "24.18.9", "26.0.0"])
    assert.equal(nodeSupported(v), false);
});
