import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  type CryptoKey,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { EDITORIAL_OWNER_EMAIL } from "./editorial-owner";
import {
  PRIVATE_READER_CANARY_PATH,
  privateReaderCanaryApi,
  type PrivateReaderCanaryConfig,
} from "./private-reader-canary";
import {
  PRIVATE_READER_AUDIENCE,
  PRIVATE_READER_ISSUER,
} from "./private-reader-credential";

// Synthetic, throwaway keys and ids generated per run. No real token exists.
const team = "https://fixture-team.cloudflareaccess.com";
const ownerAud = "a".repeat(64);
const canaryAud = "b".repeat(64);
const clientId = `${"c".repeat(32)}.access`;
let accessPrivate: CryptoKey;
let resolveAccessKey: JWTVerifyGetKey;
let readerPublic: CryptoKey;
let config: PrivateReaderCanaryConfig;

beforeAll(async () => {
  const access = await generateKeyPair("RS256");
  accessPrivate = access.privateKey;
  resolveAccessKey = async () => access.publicKey;
  const reader = await generateKeyPair("ES256", { extractable: true });
  readerPublic = reader.publicKey;
  config = {
    ACCESS_TEAM_DOMAIN: team,
    ACCESS_POLICY_AUD: ownerAud,
    PRIVATE_READER_ENABLED: "true",
    PRIVATE_READER_CANARY_ENABLED: "true",
    PRIVATE_READER_CANARY_ACCESS_AUD: canaryAud,
    PRIVATE_READER_CANARY_CLIENT_ID: clientId,
    PRIVATE_READER_SIGNING_KEY: JSON.stringify(
      await exportJWK(reader.privateKey),
    ),
  };
});

type Claims = Record<string, unknown>;

/** A service token assertion as Cloudflare Access signs one: `common_name` is
 * the client id, `sub` is empty and there is no email. */
async function serviceAssertion({
  claims = {},
  audience = canaryAud,
  expiresIn = 86_400,
  issuedAgo = 5,
}: {
  claims?: Claims;
  audience?: string;
  expiresIn?: number;
  issuedAgo?: number;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ type: "app", common_name: clientId, sub: "", ...claims })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(team)
    .setAudience(audience)
    .setIssuedAt(now - issuedAgo)
    .setExpirationTime(now + expiresIn)
    .sign(accessPrivate);
}

async function call({
  method = "POST",
  path = PRIVATE_READER_CANARY_PATH,
  body,
  access,
  override = {},
}: {
  method?: string;
  path?: string;
  body?: string;
  access?: string | null;
  override?: Partial<PrivateReaderCanaryConfig>;
} = {}) {
  const token = access === undefined ? await serviceAssertion() : access;
  const request = new Request(`${PRIVATE_READER_ISSUER}${path}`, {
    method,
    headers: token ? { "cf-access-jwt-assertion": token } : {},
    body,
  });
  return privateReaderCanaryApi(
    request,
    { ...config, ...override },
    { resolveAccessKey },
  );
}

async function error(response: Response) {
  return ((await response.json()) as { error: string }).error;
}

describe("reader canary issuance", () => {
  it("signs a canary:read credential for the reader, with no email", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as {
      credential: string;
      scope: string[];
      expiresAt: number;
      issuedAt: number;
    };
    expect(body.scope).toEqual(["canary:read"]);
    expect(body.expiresAt - body.issuedAt).toBeLessThanOrEqual(60);
    const { payload, protectedHeader } = await jwtVerify(
      body.credential,
      readerPublic,
      { issuer: PRIVATE_READER_ISSUER, audience: PRIVATE_READER_AUDIENCE },
    );
    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.sub).toBe("canary");
    expect(payload.scope).toBe("canary:read");
    expect(payload.email).toBeUndefined();
    expect(Object.keys(payload).sort()).toEqual(
      ["aud", "exp", "iat", "iss", "nbf", "scope", "sub"].sort(),
    );
  });

  it("never admits a person, even the owner", async () => {
    const owner = await serviceAssertion({
      claims: {
        email: EDITORIAL_OWNER_EMAIL,
        sub: "owner",
        common_name: undefined,
      },
    });
    expect(await error(await call({ access: owner }))).toBe("canary_required");
    const ownerWithCommonName = await serviceAssertion({
      claims: { email: EDITORIAL_OWNER_EMAIL },
    });
    expect((await call({ access: ownerWithCommonName })).status).toBe(401);
    const withSubject = await serviceAssertion({ claims: { sub: "someone" } });
    expect((await call({ access: withSubject })).status).toBe(401);
  });

  it("admits only the configured service token and canary application", async () => {
    const otherToken = await serviceAssertion({
      claims: { common_name: `${"d".repeat(32)}.access` },
    });
    expect((await call({ access: otherToken })).status).toBe(401);
    const ownerApplication = await serviceAssertion({ audience: ownerAud });
    expect((await call({ access: ownerApplication })).status).toBe(401);
    const notApp = await serviceAssertion({ claims: { type: "org" } });
    expect((await call({ access: notApp })).status).toBe(401);
    expect((await call({ access: null })).status).toBe(401);
    expect((await call({ access: "not.a.jwt" })).status).toBe(401);
  });

  it("rejects expired and future-dated assertions", async () => {
    const expired = await serviceAssertion({ expiresIn: -10 });
    expect((await call({ access: expired })).status).toBe(401);
    const future = await serviceAssertion({ issuedAgo: -300 });
    expect((await call({ access: future })).status).toBe(401);
  });

  it("never outlives the Access assertion", async () => {
    const short = await serviceAssertion({ expiresIn: 20 });
    const response = await call({ access: short });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      issuedAt: number;
      expiresAt: number;
    };
    expect(body.expiresAt - body.issuedAt).toBeLessThanOrEqual(20);
  });

  it("stays off unless both flags are exactly true and it is fully configured", async () => {
    for (const override of [
      { PRIVATE_READER_ENABLED: "false" },
      { PRIVATE_READER_CANARY_ENABLED: undefined },
      { PRIVATE_READER_CANARY_ENABLED: "TRUE" },
      { PRIVATE_READER_CANARY_ACCESS_AUD: undefined },
      { PRIVATE_READER_CANARY_ACCESS_AUD: "short" },
      { PRIVATE_READER_CANARY_CLIENT_ID: "not-a-client-id" },
      // The owner application's AUD can never double as the canary's.
      { PRIVATE_READER_CANARY_ACCESS_AUD: ownerAud },
      { ACCESS_TEAM_DOMAIN: "https://evil.example.com" },
      { PRIVATE_READER_SIGNING_KEY: undefined },
    ] satisfies Partial<PrivateReaderCanaryConfig>[]) {
      const response = await call({ override });
      expect(response.status, JSON.stringify(override)).toBe(503);
      expect(await error(response)).toBe("reader_unavailable");
    }
  });

  it("takes POST with no body and no query only", async () => {
    expect((await call({ method: "GET" })).status).toBe(405);
    expect((await call({ body: "{}" })).status).toBe(400);
    expect(
      (await call({ path: `${PRIVATE_READER_CANARY_PATH}?x=1` })).status,
    ).toBe(400);
    expect((await call({ path: "/api/canary/other" })).status).toBe(404);
  });
});
