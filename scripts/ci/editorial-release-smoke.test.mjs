import assert from "node:assert/strict";
import { test } from "node:test";
import {
  verifyEditorialBoundary,
  verifyEditorialIdentity,
  verifyEditorialVersion,
} from "./editorial-release-smoke.mjs";

const releaseSha = "a".repeat(40);
const schema = "0044";
const providerDetail = "account 0123456789abcdef in provider stderr";

function providerFailure() {
  return Object.assign(
    new Error(`Command failed: pnpm exec wrangler\n${providerDetail}`),
    { status: 1, stderr: providerDetail },
  );
}

/** Answers wrangler calls from a list of per-attempt provider states. Each
 * state is either "fail" or { active, sha } describing the live deployment. */
function fakeProvider(states) {
  const calls = [];
  let attempt = -1;
  const exec = (file, args) => {
    assert.equal(file, "pnpm");
    const command = args.slice(2, 4).join(" ");
    calls.push(command);
    if (command === "deployments status") attempt += 1;
    const state = states[Math.min(attempt, states.length - 1)];
    if (state === "fail") throw providerFailure();
    if (command === "deployments status")
      return JSON.stringify({
        versions: [{ version_id: state.active, percentage: 100 }],
      });
    if (command === "versions view")
      return JSON.stringify({
        id: args[4],
        annotations: {
          "workers/message": `release:${state.sha} schema:${state.schema ?? schema}`,
        },
      });
    throw new Error(`unexpected provider call ${command}`);
  };
  return { exec, calls };
}

function recordingSleep() {
  const waits = [];
  return { waits, sleep: async (ms) => void waits.push(ms) };
}
test("owner smoke accepts only the configured Access denial", async () => {
  assert.equal(
    (
      await verifyEditorialBoundary(
        async () =>
          new Response(null, {
            status: 302,
            headers: {
              Location:
                "https://anipotts.cloudflareaccess.com/cdn-cgi/access/login/admin.anipotts.com",
            },
          }),
      )
    ).length,
    8,
  );
  for (const response of [
    new Response("private page"),
    new Response(null, { status: 302, headers: { Location: "/auth" } }),
    new Response(null, {
      status: 302,
      headers: { Location: "https://evil.example/" },
    }),
  ])
    await assert.rejects(
      verifyEditorialBoundary(async () => response),
      /owner boundary/,
    );
});
test("provider receipt requires one active version with the exact build SHA", () => {
  const head = "a".repeat(40),
    deployment = { versions: [{ version_id: "version-1", percentage: 100 }] };
  const version = {
    id: "version-1",
    annotations: { "workers/message": `release:${head} schema:${schema}` },
  };
  assert.equal(
    verifyEditorialVersion(deployment, version, head, schema).release_sha,
    head,
  );
  assert.throws(
    () => verifyEditorialVersion(deployment, version, "b".repeat(40), schema),
    /identity mismatch/,
  );
  assert.throws(() =>
    verifyEditorialVersion(
      { versions: [{ version_id: "version-1", percentage: 50 }] },
      version,
      head,
      schema,
    ),
  );
});
// A-33: the editorial path cannot read admin's /api/health behind Access,
// so the active version's message carries the schema, and a mismatch fails
// the release.
test("A-33: the editorial path fails on a schema version mismatch", async () => {
  const head = "a".repeat(40),
    deployment = { versions: [{ version_id: "version-1", percentage: 100 }] };
  const stamped = (message) => ({
    id: "version-1",
    annotations: { "workers/message": message },
  });
  assert.deepEqual(
    verifyEditorialVersion(
      deployment,
      stamped(`release:${head} schema:0044`),
      head,
      "0044",
    ),
    { version: "version-1", release_sha: head, schema_version: "0044" },
  );
  for (const message of [
    `release:${head} schema:0043`,
    `release:${head}`,
    `release:${head} schema:unknown`,
    `release:${head} schema:0044 extra`,
  ])
    assert.throws(
      () => verifyEditorialVersion(deployment, stamped(message), head, "0044"),
      /identity mismatch/,
      message,
    );
  // An expected schema that is not a version fails before any provider call.
  for (const expected of [undefined, "", "0042-unverified", "unknown"]) {
    const clock = recordingSleep();
    await assert.rejects(
      verifyEditorialIdentity(head, expected, {
        exec: () => assert.fail("provider must not be called"),
        sleep: clock.sleep,
      }),
      { message: "editorial release identity mismatch" },
    );
  }
  // A version deployed for another schema never resolves: the release fails.
  const provider = fakeProvider([
    { active: "version-3", sha: head, schema: "0043" },
  ]);
  const clock = recordingSleep();
  await assert.rejects(
    verifyEditorialIdentity(head, "0044", {
      exec: provider.exec,
      sleep: clock.sleep,
    }),
    { message: "editorial release identity mismatch" },
  );
});
test("provider identity retries a transient wrangler failure", async () => {
  const provider = fakeProvider([
    "fail",
    { active: "version-2", sha: releaseSha },
  ]);
  const clock = recordingSleep();
  assert.deepEqual(
    await verifyEditorialIdentity(releaseSha, schema, {
      exec: provider.exec,
      sleep: clock.sleep,
    }),
    { version: "version-2", release_sha: releaseSha, schema_version: schema },
  );
  assert.deepEqual(clock.waits, [5_000]);
  assert.deepEqual(provider.calls, [
    "deployments status",
    "deployments status",
    "versions view",
  ]);
});
test("persistent provider failure stops at the bound with a bounded message", async () => {
  const provider = fakeProvider(["fail"]);
  const clock = recordingSleep();
  await assert.rejects(
    verifyEditorialIdentity(releaseSha, schema, {
      exec: provider.exec,
      sleep: clock.sleep,
    }),
    (error) => {
      assert.equal(error.message, "editorial provider verification failed");
      assert.equal(error.stderr, undefined);
      assert.doesNotMatch(String(error.stack), /0123456789abcdef/);
      return true;
    },
  );
  assert.deepEqual(clock.waits, [5_000, 10_000, 20_000]);
  assert.equal(provider.calls.length, 4);
});
test("provider identity waits for the release annotation to propagate", async () => {
  const provider = fakeProvider([
    { active: "version-1", sha: "b".repeat(40) },
    { active: "version-1", sha: "b".repeat(40) },
    { active: "version-2", sha: releaseSha },
  ]);
  const clock = recordingSleep();
  assert.deepEqual(
    await verifyEditorialIdentity(releaseSha, schema, {
      exec: provider.exec,
      sleep: clock.sleep,
    }),
    { version: "version-2", release_sha: releaseSha, schema_version: schema },
  );
  assert.deepEqual(clock.waits, [5_000, 10_000]);
});
test("persistent identity mismatch fails after the bound", async () => {
  const provider = fakeProvider([{ active: "version-1", sha: "b".repeat(40) }]);
  const clock = recordingSleep();
  await assert.rejects(
    verifyEditorialIdentity(releaseSha, schema, {
      exec: provider.exec,
      sleep: clock.sleep,
    }),
    { message: "editorial release identity mismatch" },
  );
  assert.deepEqual(clock.waits, [5_000, 10_000, 20_000]);
  assert.equal(provider.calls.length, 8);
});
test("malformed provider output is reported without echoing it", async () => {
  const clock = recordingSleep();
  await assert.rejects(
    verifyEditorialIdentity(releaseSha, schema, {
      exec: () => `not json ${providerDetail}`,
      sleep: clock.sleep,
    }),
    (error) => {
      assert.equal(error.message, "editorial provider verification failed");
      assert.doesNotMatch(String(error.stack), /0123456789abcdef/);
      return true;
    },
  );
  assert.equal(clock.waits.length, 3);
});
test("an invalid expected release fails before any provider call", async () => {
  const clock = recordingSleep();
  await assert.rejects(
    verifyEditorialIdentity("not-a-sha", schema, {
      exec: () => assert.fail("provider must not be called"),
      sleep: clock.sleep,
    }),
    { message: "editorial release identity mismatch" },
  );
  assert.deepEqual(clock.waits, []);
});
