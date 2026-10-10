import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditorialClient, ORIGIN, reviewDigest } from "./client.mjs";
import { main } from "./editorial.mjs";

const ownerSession = "CF_Authorization=synthetic.owner.session";
const record = { kind: "writing", id: "synthetic-article" };
const requestId = "c56a4180-65aa-413b-9c46-cc399e8cd442";
const token = "a".repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (value, init) => Response.json(value, init);
function snapshot() {
  return {
    base: {
      source: "---\nstatus: published\n---\nEarlier source.\n",
      publicationId: "public.synthetic",
      inventoryVersion: 3,
    },
    draft: {
      source:
        "\uFEFF---\r\nstatus: published\r\n---\r\nNew source. café 🌱\r\n",
      revision: 7,
      discardedAt: null,
    },
    publicationMode: "direct",
    publishing: "ready",
    publication: null,
  };
}
function transport(handler) {
  const calls = [];
  const client = createEditorialClient({
    ownerSession,
    fetch: async (url, init) => {
      const call = { url: new URL(url), ...init };
      calls.push(call);
      assert.equal(call.url.origin, ORIGIN);
      assert.equal(init.redirect, "manual");
      assert.equal(init.headers.get("X-Requested-With"), "XMLHttpRequest");
      if (call.url.pathname.endsWith("/csrf")) {
        assert.equal(init.method, "GET");
        return json(
          { csrf: token },
          {
            headers: {
              "Set-Cookie": `__Host-editorial-csrf=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
            },
          },
        );
      }
      return handler(call);
    },
  });
  return { client, calls };
}

test("requires only an explicit owner session cookie, never service-token headers", () => {
  for (const invalid of [
    undefined,
    "",
    "a-token",
    "CF_Authorization=a; other=b",
    "CF_Authorization=x\nprivate",
    "CF-Access-Client-Secret=secret",
  ])
    assert.throws(
      () => createEditorialClient({ ownerSession: invalid }),
      /owner_session_required/u,
    );
});

test("redirects and redirected login HTML never reach a follow-up request", async () => {
  const followed = json({ base: {} });
  Object.defineProperty(followed, "redirected", { value: true });
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { Location: "https://login.example/" },
    }),
    new Response("<html>login</html>", {
      headers: { "Content-Type": "text/html" },
    }),
    followed,
  ]) {
    let calls = 0;
    const client = createEditorialClient({
      ownerSession,
      fetch: async (_, init) => {
        calls++;
        assert.equal(init.redirect, "manual");
        return response;
      },
    });
    await assert.rejects(
      client.read(record),
      /owner_session_reentry_required|non_json_response/u,
    );
    assert.equal(calls, 1);
  }
});

test("never sends credentials after a response URL changes host or path", async () => {
  const response = json({});
  Object.defineProperty(response, "url", { value: "https://login.example/" });
  const client = createEditorialClient({
    ownerSession,
    fetch: async () => response,
  });
  await assert.rejects(client.read(record), /owner_session_reentry_required/u);
});

test("source read preserves BOM, CRLF and Unicode without mutation", async () => {
  const value = snapshot();
  const { client, calls } = transport(() => json(value));
  assert.deepEqual(await client.read(record), value);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
});
test("bounded record responses accommodate JSON expansion of allowed draft and baseline source", async () => {
  const value = snapshot();
  value.base.source = "\u0000".repeat(500_000);
  value.draft.source = "\u0000".repeat(500_000);
  const { client } = transport(() => json(value));
  assert.deepEqual(await client.read(record), value);
});

test("save uses paired CSRF cookie/header, fixed Origin, supplied revision and retry identity", async () => {
  const value = snapshot();
  const { client, calls } = transport((call) => {
    assert.equal(call.method, "POST");
    assert.equal(
      call.headers.get("Cookie"),
      `${ownerSession}; __Host-editorial-csrf=${token}`,
    );
    assert.equal(call.headers.get("X-Editorial-CSRF"), token);
    assert.equal(call.headers.get("Origin"), ORIGIN);
    assert.deepEqual(JSON.parse(call.body), {
      source: value.draft.source,
      expectedRevision: 7,
      requestId,
    });
    return json({
      ok: true,
      draft: { ...value.draft, revision: 8 },
      valid: true,
    });
  });
  await client.save(record, value.draft.source, 7, requestId);
  await client.save(record, value.draft.source, 7, requestId);
  assert.equal(calls[1].body, calls[3].body);
});

test("CSRF cookie mismatch and missing cookie stop before any mutation", async () => {
  for (const cookie of [undefined, `__Host-editorial-csrf=${"b".repeat(64)}`]) {
    let calls = 0;
    const client = createEditorialClient({
      ownerSession,
      fetch: async () => {
        calls++;
        return json(
          { csrf: token },
          { headers: cookie ? { "Set-Cookie": cookie } : {} },
        );
      },
    });
    await assert.rejects(
      client.save(record, "private synthetic text", 7, requestId),
      /csrf_unavailable/u,
    );
    assert.equal(calls, 1);
  }
});

test("revision conflict fails without retries or disclosure of returned source", async () => {
  const { client, calls } = transport(() =>
    json(
      {
        ok: false,
        code: "revision_conflict",
        current: { source: "private conflicting source" },
      },
      { status: 409 },
    ),
  );
  await assert.rejects(
    client.save(record, "private synthetic text", 7, requestId),
    { message: "server_revision_conflict" },
  );
  assert.equal(calls.length, 2);
});

test("publication review is separate, source-bound, and read-only", async () => {
  const value = snapshot();
  const { client, calls } = transport(() => json(value));
  const review = await client.review(record);
  assert.equal(review.expectedRevision, 7);
  assert.equal(review.reviewedSourceSha256, hash(value.draft.source));
  assert.equal(review.expectedBaselineSha256, hash(value.base.source));
  assert.equal(review.expectedPublicationId, value.base.publicationId);
  assert.equal(review.source, value.draft.source);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
});

test("publish requires digest confirmation and rejects invalid optional references before network I/O", async () => {
  const { client, calls } = transport(() => json(snapshot()));
  const review = await client.review(record);
  for (const [digest, approval] of [
    ["wrong", "chat reference"],
    [reviewDigest(review), ""],
  ])
    await assert.rejects(
      client.publish(review, digest, approval),
      /explicit_review_confirmation_required/u,
    );
  assert.equal(calls.length, 1);
});

test("existing human cloudflared token uses its header and separate CSRF cookie at the fixed origin", async () => {
  const ownerToken = "synthetic.human.jwt";
  let calls = 0;
  const client = createEditorialClient({
    ownerToken,
    fetch: async (url, init) => {
      calls++;
      assert.equal(new URL(url).origin, ORIGIN);
      assert.equal(init.headers.get("Cf-Access-Token"), ownerToken);
      assert.equal(init.redirect, "manual");
      if (init.method === "GET") {
        assert.equal(init.headers.get("Cookie"), null);
        return json(
          { csrf: token },
          {
            headers: {
              "Set-Cookie": `__Host-editorial-csrf=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
            },
          },
        );
      }
      assert.equal(
        init.headers.get("Cookie"),
        `__Host-editorial-csrf=${token}`,
      );
      assert.equal(init.headers.get("X-Editorial-CSRF"), token);
      return json({ ok: true, draft: { revision: 8 } });
    },
  });
  await client.save(record, "synthetic source", 7, requestId);
  assert.equal(calls, 2);
  assert.throws(
    () => createEditorialClient({ ownerSession, ownerToken }),
    /choose_one_owner_session/u,
  );
  for (const invalid of [
    "",
    "Bearer a.b.c",
    "a.b.c\nsecret",
    "a.b.c;",
    "a.b",
    "a.b.c/d",
    "a".repeat(16385),
  ])
    assert.throws(() => createEditorialClient({ ownerToken: invalid }), {
      message: "owner_session_required",
    });
});

test("CLI token authentication never prints the token or private source", async () => {
  const ownerToken = "synthetic.human.jwt";
  const outputs = [];
  await main(["read", "--kind", record.kind, "--id", record.id], {
    env: { ANIPOTTS_EDITORIAL_ACCESS_TOKEN: ownerToken },
    fetch: async (url, init) => {
      assert.equal(new URL(url).origin, ORIGIN);
      assert.equal(init.headers.get("Cf-Access-Token"), ownerToken);
      return json(snapshot());
    },
    output: (value) => outputs.push(value),
  });
  assert.ok(!outputs.join("").includes(ownerToken));
  assert.ok(!outputs.join("").includes("New source"));
});

test("modified source in review is rejected before network I/O", async () => {
  const { client, calls } = transport(() => json(snapshot()));
  const review = await client.review(record);
  review.source += " changed";
  await assert.rejects(
    client.publish(review, reviewDigest(review), "human approval"),
    /invalid_review/u,
  );
  assert.equal(calls.length, 1);
});

test("new draft revision, edited source, public hash or public pointer makes review stale", async () => {
  for (const change of [
    (value) => {
      value.draft.revision++;
    },
    (value) => {
      value.draft.source += " newer";
    },
    (value) => {
      value.base.source += " newer";
    },
    (value) => {
      value.base.publicationId = "public.newer";
    },
  ]) {
    const value = snapshot();
    const { client, calls } = transport(() => json(value));
    const review = await client.review(record);
    change(value);
    await assert.rejects(
      client.publish(review, reviewDigest(review), "human approval"),
      /review_stale/u,
    );
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.method === "GET"));
  }
});

test("publish transmits only immutable reviewed identity and does not claim live verification", async () => {
  let review;
  const { client, calls } = transport((call) => {
    if (call.method === "GET") return json(snapshot());
    assert.deepEqual(JSON.parse(call.body), {
      expectedRevision: 7,
      operationId: review.operationId,
      discloseSource: true,
      reviewedSourceSha256: review.reviewedSourceSha256,
      expectedBaselineSha256: review.expectedBaselineSha256,
      expectedPublicationId: "public.synthetic",
    });
    return json(
      {
        publication: {
          id: review.operationId,
          phase: "validate",
          verifiedAt: null,
        },
      },
      { status: 202 },
    );
  });
  review = await client.review(record);
  const result = await client.publish(review, reviewDigest(review));
  assert.equal(result.publication.phase, "validate");
  assert.equal(calls.length, 4);
});

test("status requests the exact operation after an interruption", async () => {
  const { client } = transport((call) => {
    assert.equal(call.url.searchParams.get("operationId"), requestId);
    assert.equal(call.method, "GET");
    return json({ publication: null });
  });
  assert.deepEqual(await client.status(record, requestId), {
    publication: null,
  });
});

test("history paging and private creation use existing endpoints only", async () => {
  const { client } = transport((call) => {
    if (call.method === "GET") {
      assert.equal(call.url.pathname, "/api/editorial/history");
      assert.equal(call.url.searchParams.get("beforeRevision"), "100");
      assert.equal(call.url.searchParams.get("limit"), "1");
      return json({ history: [], nextBeforeRevision: null });
    }
    assert.equal(call.url.pathname, "/api/editorial/create");
    assert.deepEqual(JSON.parse(call.body), {
      title: "Synthetic draft",
      expectedRevision: 0,
      requestId,
    });
    return json({ ok: true, draft: { revision: 1 } }, { status: 201 });
  });
  await client.history(record, 100);
  await client.create(record, "Synthetic draft", requestId);
});

test("CLI metadata omits private sources; exports are exclusive and owner-readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "editorial-cli-test-"));
  try {
    const outputs = [];
    const options = {
      env: { ANIPOTTS_EDITORIAL_OWNER_COOKIE: ownerSession },
      fetch: async () => json(snapshot()),
      output: (value) => outputs.push(value),
    };
    await main(["read", "--kind", record.kind, "--id", record.id], options);
    assert.ok(!outputs[0].includes("New source"));
    const path = join(directory, "draft.md");
    const command = [
      "export",
      "--kind",
      record.kind,
      "--id",
      record.id,
      "--out",
      path,
    ];
    await main(command, options);
    assert.equal(await readFile(path, "utf8"), snapshot().draft.source);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(main(command, options), /private_output_failed/u);
    assert.equal(await readFile(path, "utf8"), snapshot().draft.source);
    await assert.rejects(
      main(["publish", "--token", "secret"], options),
      /invalid_arguments/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI publication result retains the discussion reference without sending it as API authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "editorial-cli-test-"));
  try {
    const { client } = transport(() => json(snapshot()));
    const review = await client.review(record);
    const path = join(directory, "review.json");
    await writeFile(path, JSON.stringify(review), { mode: 0o600 });
    const outputs = [];
    await main(
      [
        "publish",
        "--review",
        path,
        "--confirm",
        reviewDigest(review),
        "--approval-ref",
        "synthetic human discussion",
      ],
      {
        env: { ANIPOTTS_EDITORIAL_OWNER_COOKIE: ownerSession },
        fetch: async (url, init) => {
          if (new URL(url).pathname.endsWith("/csrf"))
            return json(
              { csrf: token },
              {
                headers: {
                  "Set-Cookie": `__Host-editorial-csrf=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
                },
              },
            );
          if (init.method === "GET") return json(snapshot());
          assert.equal(JSON.parse(init.body).approvalRef, undefined);
          return json(
            { publication: { id: review.operationId, phase: "validate" } },
            { status: 202 },
          );
        },
        output: (value) => outputs.push(value),
      },
    );
    assert.equal(
      JSON.parse(outputs[0]).approvalRef,
      "synthetic human discussion",
    );
    assert.ok(!outputs[0].includes(snapshot().draft.source));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
