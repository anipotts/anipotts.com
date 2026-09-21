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
  PRIVATE_READER_AUDIENCE,
  PRIVATE_READER_ISSUER,
  PRIVATE_READER_OPS_PATH,
  privateReaderCredentialApi,
  type PrivateReaderConfig,
  type PrivateReaderMode,
} from "./private-reader-credential";

// Synthetic, throwaway keys generated per run. No real key exists.
const team = "https://fixture-team.cloudflareaccess.com";
const accessAud = "fixture-access-audience";
const origin = PRIVATE_READER_ISSUER;
const csrf = "a".repeat(64);
let accessPrivate: CryptoKey;
let resolveAccessKey: JWTVerifyGetKey;
let readerPublic: CryptoKey;
let config: PrivateReaderConfig;

beforeAll(async () => {
  const access = await generateKeyPair("RS256");
  accessPrivate = access.privateKey;
  resolveAccessKey = async () => access.publicKey;
  const reader = await generateKeyPair("ES256", { extractable: true });
  readerPublic = reader.publicKey;
  config = {
    ACCESS_TEAM_DOMAIN: team,
    ACCESS_POLICY_AUD: accessAud,
    PRIVATE_READER_ENABLED: "true",
    PRIVATE_READER_SIGNING_KEY: JSON.stringify(
      await exportJWK(reader.privateKey),
    ),
  };
});

async function assertion({
  email = EDITORIAL_OWNER_EMAIL,
  expiresIn = 3600,
}: { email?: string; expiresIn?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email, type: "app" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(team)
    .setAudience(accessAud)
    .setSubject("fixture-access-subject")
    .setIssuedAt(now - 5)
    .setExpirationTime(now + expiresIn)
    .sign(accessPrivate);
}

async function request({
  method = "POST",
  path = "/api/private-reader/credential",
  headers = {},
  body = "{}",
  access,
}: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string | null;
  access?: string | null;
} = {}) {
  const token = access === undefined ? await assertion() : access;
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      Cookie: `__Host-editorial-csrf=${csrf}`,
      "X-Editorial-CSRF": csrf,
      "Content-Type": "application/json",
      ...(token ? { "cf-access-jwt-assertion": token } : {}),
      ...headers,
    },
    body: method === "GET" || method === "HEAD" ? null : body,
  });
}

function expectPrivate(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
}

async function issue(
  req: Request,
  overrides: PrivateReaderConfig = {},
  mode?: PrivateReaderMode,
) {
  return privateReaderCredentialApi(
    req,
    { ...config, ...overrides },
    { resolveAccessKey },
    mode,
  );
}

describe("private reader credential issuance", () => {
  it("issues a bounded ES256 delegation with exact claims and no record payload", async () => {
    const response = await issue(await request());
    expect(response.status).toBe(200);
    expectPrivate(response);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "audience",
      "credential",
      "expiresAt",
      "issuedAt",
      "scope",
      "tokenType",
    ]);
    const { payload, protectedHeader } = await jwtVerify(
      body.credential as string,
      readerPublic,
      {
        issuer: PRIVATE_READER_ISSUER,
        audience: PRIVATE_READER_AUDIENCE,
        algorithms: ["ES256"],
      },
    );
    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.iss).toBe("https://admin.anipotts.com");
    expect(payload.aud).toBe("https://ap-mini.tail060490.ts.net");
    expect(payload.sub).toBe("fixture-access-subject");
    expect(payload.email).toBe(EDITORIAL_OWNER_EMAIL);
    expect(payload.scope).toBe("data:read activity:read");
    expect(payload.nbf).toBe(payload.iat);
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
    expect(body.expiresAt).toBe(payload.exp);
  });

  it("ignores client-requested scopes and spoofed device or principal headers", async () => {
    const response = await issue(
      await request({
        body: JSON.stringify({ scope: "admin:write", scopes: ["data:write"] }),
        headers: {
          "X-Reader-Scope": "data:write",
          "X-Reader-Principal": "someone-else",
          "Tailscale-User-Login": "intruder@example.com",
          "X-Device": "ap-unknown",
        },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      credential: string;
      scope: string[];
    };
    expect(body.scope).toEqual(["data:read", "activity:read"]);
    const { payload } = await jwtVerify(body.credential, readerPublic);
    expect(payload.scope).toBe("data:read activity:read");
    expect(payload.sub).toBe("fixture-access-subject");
    expect(payload.email).toBe(EDITORIAL_OWNER_EMAIL);
  });

  it("never outlives the parent Access session", async () => {
    const response = await issue(
      await request({ access: await assertion({ expiresIn: 20 }) }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      credential: string;
      issuedAt: number;
      expiresAt: number;
    };
    const { payload } = await jwtVerify(body.credential, readerPublic);
    const parentExp = Math.floor(Date.now() / 1000) + 20;
    expect(payload.exp!).toBeLessThanOrEqual(parentExp);
    expect(body.expiresAt - body.issuedAt).toBeLessThanOrEqual(20);
  });

  it("denies an expired parent session without grace", async () => {
    const response = await issue(
      await request({ access: await assertion({ expiresIn: -1 }) }),
    );
    expect(response.status).toBe(401);
    expectPrivate(response);
  });

  it("denies cross-origin issuance", async () => {
    for (const headers of <Record<string, string>[]>[
      { Origin: "https://evil.example" },
      { "Sec-Fetch-Site": "cross-site" },
      { Origin: "https://anipotts.com" },
    ]) {
      const response = await issue(await request({ headers }));
      expect(response.status).toBe(403);
      expectPrivate(response);
      expect(await response.json()).toEqual({ error: "origin_required" });
    }
    const wrongHost = new Request(
      "https://admin.example.net/api/private-reader/credential",
      (await request()).clone(),
    );
    expect((await issue(wrongHost)).status).toBe(403);
  });

  it("requires the matching CSRF token", async () => {
    const response = await issue(
      await request({ headers: { "X-Editorial-CSRF": "b".repeat(64) } }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "csrf_required" });
  });

  it("maps default deny, method, not found and malformed requests", async () => {
    const missing = await issue(await request({ access: null }));
    expect(missing.status).toBe(401);
    expectPrivate(missing);
    const stranger = await issue(
      await request({ access: await assertion({ email: "x@example.com" }) }),
    );
    expect(stranger.status).toBe(401);

    const get = await issue(await request({ method: "GET" }));
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("POST");
    expectPrivate(get);

    const other = await issue(
      await request({ path: "/api/private-reader/other" }),
    );
    expect(other.status).toBe(404);
    expectPrivate(other);

    for (const body of ["not json", "[]", "null", "x".repeat(2000)]) {
      const malformed = await issue(await request({ body }));
      expect(malformed.status).toBe(400);
      expectPrivate(malformed);
    }
    const query = await issue(
      await request({ path: "/api/private-reader/credential?scope=all" }),
    );
    expect(query.status).toBe(400);
    const text = await issue(
      await request({ headers: { "Content-Type": "text/plain" } }),
    );
    expect(text.status).toBe(400);
  });

  it("is unavailable unless explicitly enabled with a signing key", async () => {
    for (const overrides of [
      { PRIVATE_READER_ENABLED: undefined },
      { PRIVATE_READER_ENABLED: "1" },
      { PRIVATE_READER_SIGNING_KEY: undefined },
      { PRIVATE_READER_SIGNING_KEY: "not-a-jwk" },
      { PRIVATE_READER_SIGNING_KEY: JSON.stringify({ kty: "oct", k: "AA" }) },
    ]) {
      const response = await issue(await request(), overrides);
      expect(response.status).toBe(503);
      expectPrivate(response);
      expect(await response.json()).toEqual({ error: "reader_unavailable" });
    }
  });
});

describe("ops credential issuance", () => {
  const ops = (options: Parameters<typeof request>[0] = {}) =>
    request({ path: PRIVATE_READER_OPS_PATH, ...options });

  it("issues a delegation that carries only ops:read", async () => {
    const response = await issue(await ops(), {}, "ops");
    expect(response.status).toBe(200);
    expectPrivate(response);
    const body = (await response.json()) as {
      credential: string;
      scope: string[];
    };
    expect(body.scope).toEqual(["ops:read"]);
    const { payload } = await jwtVerify(body.credential, readerPublic, {
      issuer: PRIVATE_READER_ISSUER,
      audience: PRIVATE_READER_AUDIENCE,
      algorithms: ["ES256"],
    });
    expect(payload.scope).toBe("ops:read");
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
  });

  it("keeps the modes apart: each path serves only its own mode", async () => {
    expect((await issue(await ops(), {}, "data")).status).toBe(404);
    expect((await issue(await request(), {}, "ops")).status).toBe(404);
    const data = await issue(await request());
    expect(((await data.json()) as { scope: string[] }).scope).toEqual([
      "data:read",
      "activity:read",
    ]);
  });

  it("ignores client-requested scopes", async () => {
    const response = await issue(
      await ops({
        body: JSON.stringify({ scope: "data:read activity:read" }),
        headers: { "X-Reader-Scope": "data:read" },
      }),
      {},
      "ops",
    );
    const body = (await response.json()) as { scope: string[] };
    expect(body.scope).toEqual(["ops:read"]);
  });

  it("stays behind the same off flag and owner gate", async () => {
    const off = await issue(
      await ops(),
      { PRIVATE_READER_ENABLED: undefined },
      "ops",
    );
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ error: "reader_unavailable" });
    const anonymous = await issue(await ops({ access: null }), {}, "ops");
    expect(anonymous.status).toBe(401);
    const get = await issue(await ops({ method: "GET" }), {}, "ops");
    expect(get.status).toBe(405);
  });
});
