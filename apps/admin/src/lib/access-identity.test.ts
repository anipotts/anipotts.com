import { beforeAll, describe, expect, it } from "vitest";
import {
  createLocalJWKSet,
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
import { hasAdminCapability } from "./admin-auth";

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
      expect(hasAdminCapability(principal!.role, "admin:read")).toBe(true);
      expect(hasAdminCapability(principal!.role, "control:execute")).toBe(
        false,
      );
      expect(hasAdminCapability(principal!.role, "content:publish")).toBe(
        false,
      );
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
