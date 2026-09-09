import { describe, expect, it } from "vitest";
import { createPrivateKey } from "node:crypto";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { publisherInstallationToken } from "../../src/editorial/github-app";
import { EditorialGitHub, GitHubFailure } from "../../src/editorial/github";

const now = Date.parse("2026-09-08T12:00:00Z");
const token = "synthetic-installation-token-for-tests";
async function fixture() {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const pem = await exportPKCS8(keys.privateKey);
  const app = {
    issuer: "Iv1.test",
    installationId: 123,
    repositoryId: 456,
    privateKey: pem,
  };
  const response = () => ({
    token,
    expires_at: new Date(now + 3_600_000).toISOString(),
    repositories: [{ id: 456, full_name: "anipotts/anipotts.com" }],
    permissions: {
      contents: "write",
      pull_requests: "write",
      checks: "read",
      statuses: "read",
      deployments: "read",
      actions: "read",
      administration: "read",
      metadata: "read",
    },
  });
  return { keys, app, response };
}
describe("server publisher installation authentication", () => {
  it("signs verifiable short-lived JWTs for both RSA PEM formats and restricts the grant", async () => {
    const { keys, app, response } = await fixture();
    for (const pem of [
      app.privateKey,
      String(
        createPrivateKey(app.privateKey).export({
          type: "pkcs1",
          format: "pem",
        }),
      ),
    ]) {
      const result = await publisherInstallationToken(
        { ...app, privateKey: pem },
        async (url, init) => {
          expect(String(url)).toBe(
            "https://api.github.com/app/installations/123/access_tokens",
          );
          expect(init?.redirect).toBe("error");
          const jwt = new Headers(init?.headers).get("Authorization")!.slice(7);
          const verified = await jwtVerify(jwt, keys.publicKey, {
            issuer: app.issuer,
            algorithms: ["RS256"],
            currentDate: new Date(now),
          });
          expect(verified.payload.iat).toBe(now / 1000 - 60);
          expect(verified.payload.exp).toBe(now / 1000 + 540);
          expect(JSON.parse(String(init?.body))).toEqual({
            repository_ids: [456],
            permissions: response().permissions,
          });
          return Response.json(response(), { status: 201 });
        },
        now,
      );
      expect(result).toBe(token);
    }
  });
  it("rejects invalid credentials before making a provider request", async () => {
    const { app } = await fixture();
    let calls = 0;
    for (const bad of [
      { ...app, privateKey: "invalid" },
      { ...app, installationId: -1 },
    ]) {
      await expect(
        publisherInstallationToken(
          bad,
          async () => {
            calls++;
            throw new Error();
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "unauthorized" });
    }
    expect(calls).toBe(0);
  });
  it("fails closed on expired, oversized, foreign or excessive grants", async () => {
    const { app, response } = await fixture();
    for (const data of [
      { ...response(), expires_at: new Date(now).toISOString() },
      { ...response(), repositories: [{ id: 999, full_name: "someone/else" }] },
      {
        ...response(),
        permissions: { ...response().permissions, workflows: "write" },
      },
      { ...response(), token: "x".repeat(70_000) },
    ]) {
      await expect(
        publisherInstallationToken(
          app,
          async () => Response.json(data, { status: 201 }),
          now,
        ),
      ).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
  it("sanitizes provider failures and preserves rate limits through the repository adapter", async () => {
    const { app } = await fixture();
    for (const [status, code] of [
      [401, "unauthorized"],
      [503, "unavailable"],
      [422, "rejected"],
    ] as const) {
      await expect(
        publisherInstallationToken(
          app,
          async () => new Response("private provider detail", { status }),
          now,
        ),
      ).rejects.toMatchObject({ message: code });
    }
    const client = new EditorialGitHub(
      async () => {
        throw new GitHubFailure("rate_limited", 120_000);
      },
      async () => {
        throw new Error("must not send");
      },
    );
    await expect(
      client.branchHead("40c949e1-0e1e-40a1-8eca-2b1b0202a1e5"),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 120_000 });
    await expect(
      publisherInstallationToken(
        app,
        async () =>
          new Response(null, {
            status: 429,
            headers: { "Retry-After": "120" },
          }),
        now,
      ),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 120_000 });
  });
});
