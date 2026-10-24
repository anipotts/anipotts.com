import assert from "node:assert/strict";
import { test } from "node:test";
import { workStatusLabel } from "../src/lib/work-status.ts";

test("completed experience does not inherit archived, live or in-progress project labels", () => {
  for (const status of ["archived", "live", "wip"]) {
    assert.equal(
      workStatusLabel({ kind: "experience", catalogGroup: "past", status }),
      "past experience",
    );
  }
});

test("an experience without confirmed temporal grouping does not imply current tenure", () => {
  assert.equal(
    workStatusLabel({
      kind: "experience",
      catalogGroup: "active",
      status: "live",
    }),
    undefined,
  );
});

test("retired and in-progress projects retain their lifecycle labels", () => {
  assert.equal(
    workStatusLabel({ kind: "project", status: "archived" }),
    "archived",
  );
  assert.equal(
    workStatusLabel({ kind: "project", status: "wip" }),
    "in progress",
  );
  assert.equal(workStatusLabel({ kind: "project", status: "live" }), "live");
});
