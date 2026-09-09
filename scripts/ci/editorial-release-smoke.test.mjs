import assert from "node:assert/strict";
import { test } from "node:test";
import {
  verifyEditorialBoundary,
  verifyEditorialVersion,
} from "./editorial-release-smoke.mjs";
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
    annotations: { "workers/message": `release:${head}` },
  };
  assert.equal(
    verifyEditorialVersion(deployment, version, head).release_sha,
    head,
  );
  assert.throws(
    () => verifyEditorialVersion(deployment, version, "b".repeat(40)),
    /identity mismatch/,
  );
  assert.throws(() =>
    verifyEditorialVersion(
      { versions: [{ version_id: "version-1", percentage: 50 }] },
      version,
      head,
    ),
  );
});
