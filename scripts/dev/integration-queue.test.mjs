import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  validateQueue,
  updateItem,
  parseArgs,
  listQueue,
} from "./integration-queue.mjs";
const revision = "a".repeat(40);
const make = (lane = "code") => ({
  version: 1,
  items: [
    {
      id: "example",
      title: "Example",
      lane,
      state: "implementing",
      revision,
      approvals: {},
    },
  ],
});
test("maintained queue is valid and distinguishes historical deployment targets", () => {
  const queue = validateQueue(
    JSON.parse(
      readFileSync(
        new URL("../../docs/integration-queue.json", import.meta.url),
      ),
    ),
  );
  assert.equal(
    queue.items.find((item) => item.id === "pr-488-www").deployment.target,
    "www and admin",
  );
  for (const item of queue.items) assert.ok(listQueue(queue).includes(item.id));
});
test("code approval does not approve content or production deployment", () => {
  const args = {
    id: "example",
    revision,
    approval: "code",
    by: "Ani",
    evidence: "review reference",
  };
  const queue = updateItem(make(), { ...args, state: "approved" });
  assert.throws(
    () =>
      updateItem(queue, {
        id: "example",
        revision,
        state: "deployed",
        target: "www",
        evidence: "CI passed",
      }),
    /separate/,
  );
  assert.throws(
    () => updateItem(make("content"), { ...args, state: "approved" }),
    /Lane/,
  );
});
test("new revisions invalidate approvals and deployment evidence", () => {
  let queue = updateItem(make(), {
    id: "example",
    revision,
    approval: "code",
    by: "Ani",
    evidence: "review",
    state: "approved",
  });
  queue = updateItem(queue, {
    id: "example",
    revision,
    approval: "production",
    by: "Ani",
    evidence: "release approval",
  });
  queue = updateItem(queue, {
    id: "example",
    revision,
    state: "deployed",
    target: "www",
    evidence: "provider run and live release proof",
  });
  assert.equal(queue.items[0].state, "deployed");
  const changed = updateItem(queue, {
    id: "example",
    revision: "b".repeat(40),
  });
  assert.deepEqual(changed.items[0].approvals, {});
  assert.equal(changed.items[0].deployment, undefined);
  assert.equal(changed.items[0].state, "implementing");
  assert.equal(queue.items[0].state, "deployed");
});
test("rejects stale approvals, duplicate ids and abbreviated revisions", () => {
  const queue = make();
  queue.items[0].approvals.code = {
    revision: "b".repeat(40),
    by: "Ani",
    at: "now",
    evidence: "review",
  };
  assert.throws(() => validateQueue(queue), /exact revision/);
  const duplicate = make();
  duplicate.items.push({ ...duplicate.items[0] });
  assert.throws(() => validateQueue(duplicate), /duplicate/);
  assert.throws(
    () => updateItem(make(), { id: "example", revision: "abc123" }),
    /full revision/,
  );
});
test("CLI rejects typos, duplicate options and missing values", () => {
  for (const args of [
    ["approve"],
    ["list", "--id", "example"],
    ["update", "--id"],
    ["update", "--id", "example", "--state", "approved", "--state", "deployed"],
    ["update", "--id", "example", "--typo", "x"],
  ])
    assert.throws(() => parseArgs(args));
  assert.equal(
    parseArgs(["update", "--id", "example", "--state", "awaiting-review"])
      .state,
    "awaiting-review",
  );
});
test("unknown items and states fail without mutating the original queue", () => {
  const queue = make();
  assert.throws(
    () => updateItem(queue, { id: "missing", state: "approved" }),
    /Unknown id/,
  );
  assert.throws(
    () => updateItem(queue, { id: "example", state: "CI-passed" }),
    /Unknown state/,
  );
  assert.equal(queue.items[0].state, "implementing");
});

test("verified merge mapping retains reviewed approvals and records the shipped SHA", () => {
  let queue = make();
  for (const approval of ["code", "production"])
    queue = updateItem(queue, {
      id: "example",
      revision,
      approval,
      by: "Ani",
      evidence: "review",
    });
  const release = "b".repeat(40);
  assert.throws(
    () => updateItem(queue, { id: "example", "release-revision": release }),
    /mapping/,
  );
  queue = updateItem(queue, {
    id: "example",
    "release-revision": release,
    "reviewed-revision": revision,
    "mapping-evidence": "verified tree diff and provider checks",
  });
  queue = updateItem(queue, {
    id: "example",
    state: "deployed",
    target: "www",
    evidence: "provider and route proof",
  });
  assert.equal(queue.items[0].revision, revision);
  assert.equal(queue.items[0].approvals.code.revision, revision);
  assert.equal(queue.items[0].deployment.revision, release);
  const changed = updateItem(queue, {
    id: "example",
    revision: "c".repeat(40),
  });
  assert.deepEqual(changed.items[0].approvals, {});
  assert.equal(changed.items[0].release, undefined);
  assert.equal(changed.items[0].deployment, undefined);
  assert.throws(
    () =>
      updateItem(changed, {
        id: "example",
        "release-revision": release,
        "reviewed-revision": revision,
        "mapping-evidence": "stale mapping",
      }),
    /mapping/,
  );
});
