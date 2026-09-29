import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import {
  EDITORIAL_OWNER_EMAIL,
  retainedAccessPrincipal,
  verifyEditorialOwner,
} from "./access-identity";

const config = {
  ACCESS_TEAM_DOMAIN: "https://anipotts.cloudflareaccess.com",
  ACCESS_POLICY_AUD: "editorial-test-audience",
};
let privateKey: CryptoKey;
let otherKey: CryptoKey;
let keys: JWTVerifyGetKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test" }],
  });
});

async function assertion(overrides: JWTPayload = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: config.ACCESS_TEAM_DOMAIN,
    aud: config.ACCESS_POLICY_AUD,
    iat: now,
    exp: now + 300,
    sub: "owner-subject",
    email: EDITORIAL_OWNER_EMAIL,
    type: "app",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(signingKey);
}

function request(token?: string) {
  const headers = new Headers({
    "cf-access-authenticated-user-email": EDITORIAL_OWNER_EMAIL,
  });
  if (token) headers.set("cf-access-jwt-assertion", token);
  return new Request("https://admin.anipotts.com/content", { headers });
}

describe("editorial Access identity", () => {
  it.each(["/inbox", "/proof", "/deploys", "/api/admin/control-plane"])(
    "permits owner reads of %s without an expired legacy cookie",
    async (path) => {
      const req = new Request(`https://admin.anipotts.com${path}`, {
        headers: { "cf-access-jwt-assertion": await assertion() },
      });
      const principal = await retainedAccessPrincipal(req, config, keys);
      expect(principal?.authMethod).toBe("cloudflare_access");
      expect(principal?.displayName).toBe(EDITORIAL_OWNER_EMAIL);
      // Reads only: owner writes go through the editorial namespace.
      expect(principal?.role).toBe("viewer");
      expect(
        await retainedAccessPrincipal(
          new Request(req, { method: "POST" }),
          config,
          keys,
        ),
      ).toBeNull();
      expect(
        await retainedAccessPrincipal(new Request(req.url), config, keys),
      ).toBeNull();
    },
  );

  it("accepts the exact owner only after real signature verification", async () => {
    expect(
      await verifyEditorialOwner(request(await assertion()), config, keys),
    ).toEqual({
      email: EDITORIAL_OWNER_EMAIL,
      subject: "owner-subject",
      expiresAt: expect.any(Number),
    });
  });

  it("ignores a spoofed email header without an assertion", async () => {
    expect(await verifyEditorialOwner(request(), config, keys)).toBeNull();
  });

  it.each([
    ["expired", { exp: 1 }],
    ["missing expiry", { exp: undefined }],
    ["wrong issuer", { iss: "https://other.cloudflareaccess.com" }],
    ["wrong audience", { aud: "another-app" }],
    ["wrong owner", { email: "other@example.com" }],
    ["nonexact owner", { email: "Hello@anipotts.com" }],
    ["alias", { email: "hello+admin@anipotts.com" }],
    ["missing email", { email: undefined }],
    ["missing issuance", { iat: undefined }],
    ["missing type", { type: undefined }],
    ["missing subject", { sub: undefined }],
    ["blank subject", { sub: " " }],
    ["service identity", { common_name: "ci.access" }],
    ["nonapplication identity", { type: "org" }],
    ["not yet valid", { nbf: 9_999_999_999 }],
    ["future issuance", { iat: 9_999_999_999 }],
  ])("rejects %s", async (_label, claims) => {
    expect(
      await verifyEditorialOwner(
        request(await assertion(claims)),
        config,
        keys,
      ),
    ).toBeNull();
  });

  it("rejects a forged signature and malformed token", async () => {
    expect(
      await verifyEditorialOwner(
        request(await assertion({}, otherKey)),
        config,
        keys,
      ),
    ).toBeNull();
    expect(
      await verifyEditorialOwner(request("invalid"), config, keys),
    ).toBeNull();
  });

  it("fails closed on missing or invalid configuration and unavailable keys", async () => {
    const req = request(await assertion());
    for (const invalid of [
      {},
      { ...config, ACCESS_POLICY_AUD: "" },
      { ...config, ACCESS_TEAM_DOMAIN: "http://localhost" },
    ]) {
      expect(await verifyEditorialOwner(req, invalid, keys)).toBeNull();
    }
    expect(
      await verifyEditorialOwner(req, config, async () => {
        throw new Error("unavailable");
      }),
    ).toBeNull();
  });
});

describe("remote Access signing keys, with real jose verification", () => {
  it("rotates an unknown kid, retains verified cached keys during an outage, and fails closed otherwise", async () => {
    const first = await generateKeyPair("RS256");
    const second = await generateKeyPair("RS256");
    const jwk1 = {
      ...(await exportJWK(first.publicKey)),
      kid: "first",
      alg: "RS256",
    };
    const jwk2 = {
      ...(await exportJWK(second.publicKey)),
      kid: "second",
      alg: "RS256",
    };
    let published = [jwk1];
    let unavailable = false;
    const fetchKeys = vi.fn(async () => {
      if (unavailable) throw new Error("synthetic outage");
      return Response.json({ keys: published });
    });
    const remote = createRemoteJWKSet(
      new URL("/cdn-cgi/access/certs", config.ACCESS_TEAM_DOMAIN),
      {
        [customFetch]: fetchKeys,
        cooldownDuration: 0,
      },
    );
    const now = Math.floor(Date.now() / 1000);
    const sign = (kid: string, key: CryptoKey) =>
      new SignJWT({
        iss: config.ACCESS_TEAM_DOMAIN,
        aud: config.ACCESS_POLICY_AUD,
        iat: now,
        exp: now + 300,
        sub: "synthetic-owner",
        email: EDITORIAL_OWNER_EMAIL,
        type: "app",
      })
        .setProtectedHeader({ alg: "RS256", kid })
        .sign(key);
    const original = await sign("first", first.privateKey);
    expect(
      await verifyEditorialOwner(request(original), config, remote),
    ).not.toBeNull();
    published = [jwk1, jwk2];
    const rotated = await sign("second", second.privateKey);
    expect(
      await verifyEditorialOwner(request(rotated), config, remote),
    ).not.toBeNull();
    expect(fetchKeys).toHaveBeenCalledTimes(2);
    unavailable = true;
    expect(
      await verifyEditorialOwner(request(rotated), config, remote),
    ).not.toBeNull();
    expect(fetchKeys).toHaveBeenCalledTimes(2);
    expect(
      await verifyEditorialOwner(
        request(await sign("unknown", second.privateKey)),
        config,
        remote,
      ),
    ).toBeNull();
    expect(fetchKeys).toHaveBeenCalledTimes(3);
    const cold = createRemoteJWKSet(
      new URL("https://fixture.cloudflareaccess.com/certs"),
      { [customFetch]: fetchKeys },
    );
    expect(
      await verifyEditorialOwner(request(original), config, cold),
    ).toBeNull();
  });
  it.each([{}, { keys: "wrong" }, { keys: [{ kty: "invalid", kid: "test" }] }])(
    "denies unusable signing-key responses without identity fallback",
    async (body) => {
      const remote = createRemoteJWKSet(
        new URL("https://fixture.cloudflareaccess.com/certs"),
        {
          [customFetch]: async () => Response.json(body),
        },
      );
      expect(
        await verifyEditorialOwner(request(await assertion()), config, remote),
      ).toBeNull();
    },
  );
  it("denies unsigned/tampered assertions and ignores every retired cookie", async () => {
    const valid = await assertion();
    const [header, payload, signature] = valid.split(".");
    const unsigned = `${btoa(JSON.stringify({ alg: "none" }))}.${payload}.`;
    const tampered = `${header}.${payload}.${signature!.slice(0, -12)}aaaaaaaaaaaa`;
    for (const token of [unsigned, tampered, "x".repeat(16_385)]) {
      const req = new Request(request(token), {
        headers: {
          "cf-access-jwt-assertion": token,
          "cf-access-authenticated-user-email": EDITORIAL_OWNER_EMAIL,
          cookie:
            "__Host-admin_session=old; admin_passkey_session=old; admin_session=old",
        },
      });
      expect(await verifyEditorialOwner(req, config, keys)).toBeNull();
    }
    expect(
      await verifyEditorialOwner(
        new Request(request(), {
          headers: {
            cookie:
              "__Host-admin_session=old; admin_passkey_session=old; admin_session=old",
          },
        }),
        config,
        keys,
      ),
    ).toBeNull();
  });
});
