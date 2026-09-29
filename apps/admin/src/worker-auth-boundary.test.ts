import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  jwtVerify,
  type JWTPayload,
} from "jose";

// Only transport/adapter glue is substituted. Identity verification, middleware,
// mutation handlers and delegated-token signing execute their production code.
const fixture = vi.hoisted(() => ({
  config: {} as Record<string, string>,
  jwks: {} as unknown,
  adapter: vi.fn(),
  fetchKeys: vi.fn(),
}));
vi.mock("./lib/runtime-env", () => ({ runtimeEnv: () => fixture.config }));
vi.mock("./lib/editorial-content", () => ({
  publicSiteUrl: "https://fixture.example",
}));
vi.mock("./lib/editorial-media", () => ({
  editorialImagePreview: (value: string) => value,
}));
vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));
vi.mock("@astrojs/cloudflare/handler", () => ({
  handle: (...args: unknown[]) => fixture.adapter(...args),
}));
vi.mock("./editorial/draft-store", () => ({ EditorialDraftStore: class {} }));
vi.mock("jose", async (original) => {
  const real = await original<typeof import("jose")>();
  return {
    ...real,
    createRemoteJWKSet: (url: URL) =>
      real.createRemoteJWKSet(url, {
        [real.customFetch]: async (...args) => fixture.fetchKeys(...args),
        cooldownDuration: 0,
      }),
  };
});
import worker from "./worker";
import { onRequest } from "./middleware";
import { adminLogout } from "./lib/admin-logout";
import type { SaveDraft, SaveResult } from "./editorial/draft-store";
import { homeEditorApi } from "./lib/editorial-home-api";
import { editorialMediaApi } from "./lib/editorial-media-api";
import { privateReaderCredentialApi } from "./lib/private-reader-credential";
import { privateReaderCanaryApi } from "./lib/private-reader-canary";

const origin = "https://admin.anipotts.com";
const csrf = "c".repeat(64);
let signing: CryptoKey;
let wrongSigning: CryptoKey;
let readerPublic: CryptoKey;
const effects = {
  save: vi.fn(async (input: SaveDraft): Promise<SaveResult> => ({
    ok: true,
    draft: {
      ...input,
      key: "synthetic",
      revision: 1,
      updatedAt: 1,
      discardedAt: null,
    },
  })),
  startDirectPublication: vi.fn(),
  readMedia: vi.fn(),
  saveMedia: vi.fn(async () => ({
    ok: true as const,
    media: { id: "synthetic", type: "image/png" as const, size: 2 },
  })),
  readBase: vi.fn(async () => ({
    source: "synthetic",
    baseCommit: "fixture",
    baseFileHash: null,
  })),
};
const storage = {
  ...effects,
  get: vi.fn(),
  history: vi.fn(),
  historyPage: vi.fn(),
  discard: vi.fn(),
  restore: vi.fn(),
  rebase: vi.fn(),
  conflict: vi.fn(),
};

beforeAll(async () => {
  const rsa = await generateKeyPair("RS256");
  signing = rsa.privateKey;
  wrongSigning = (await generateKeyPair("RS256")).privateKey;
  fixture.jwks = {
    keys: [{ ...(await exportJWK(rsa.publicKey)), kid: "boundary" }],
  };
  const ec = await generateKeyPair("ES256", { extractable: true });
  readerPublic = ec.publicKey;
  fixture.config = {
    ACCESS_TEAM_DOMAIN: "https://boundary.cloudflareaccess.com",
    ACCESS_POLICY_AUD: "a".repeat(64),
    PRIVATE_READER_ENABLED: "true",
    PRIVATE_READER_OPS_ENABLED: "true",
    PRIVATE_READER_CANARY_ENABLED: "true",
    PRIVATE_READER_CANARY_ACCESS_AUD: "b".repeat(64),
    PRIVATE_READER_CANARY_CLIENT_ID: `${"d".repeat(32)}.access`,
    PRIVATE_READER_SIGNING_KEY: JSON.stringify(await exportJWK(ec.privateKey)),
  };
});
beforeEach(() => {
  vi.stubEnv("DEV", false);
  vi.stubGlobal("__LOCAL_OWNER_BUILD__", false);
  vi.clearAllMocks();
  fixture.fetchKeys.mockImplementation(async () => Response.json(fixture.jwks));
  fixture.adapter.mockImplementation(async (request: Request) => {
    const url = new URL(request.url);
    const context = {
      request,
      url,
      locals: {},
      cookies: { get: vi.fn() },
      redirect: (target: string, status: number) =>
        new Response(null, { status, headers: { location: target } }),
    };
    return onRequest(context as never, async () => {
      if (url.pathname === "/api/admin/logout")
        return adminLogout(context as never);
      if (url.pathname === "/api/canary/credential")
        return privateReaderCanaryApi(request, fixture.config);
      if (url.pathname.startsWith("/api/private-reader/"))
        return privateReaderCredentialApi(
          request,
          fixture.config,
          { owner: (context.locals as { accessOwner?: never }).accessOwner },
          url.pathname.includes("ops-")
            ? "ops"
            : url.pathname.includes("health-")
              ? "health"
              : "data",
        );
      if (url.pathname === "/api/editorial/media")
        return editorialMediaApi(request, effects);
      if (url.pathname.startsWith("/api/editorial/"))
        return homeEditorApi(request, storage, effects.readBase, {
          enabled: true,
          storage: storage as never,
        });
      return new Response("synthetic private view");
    });
  });
});

async function sign(claims: JWTPayload = {}, key = signing) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: fixture.config.ACCESS_TEAM_DOMAIN,
    aud: fixture.config.ACCESS_POLICY_AUD,
    email: "hello@anipotts.com",
    sub: "synthetic-owner",
    type: "app",
    iat: now,
    exp: now + 30,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "boundary" })
    .sign(key);
}
function request(
  path: string,
  token?: string,
  init: RequestInit = {},
  host = origin,
) {
  return new Request(`${host}${path}`, {
    ...init,
    headers: {
      "cf-access-authenticated-user-email": "hello@anipotts.com",
      cookie: `__Host-editorial-csrf=${csrf}; __Host-admin_session=retired; admin_passkey_session=retired; admin_session=retired`,
      ...(token ? { "cf-access-jwt-assertion": token } : {}),
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}
const mutation = (headers = {}, body = "{}"): RequestInit => ({
  method: "POST",
  body,
  headers: {
    origin,
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    "x-editorial-csrf": csrf,
    ...headers,
  },
});
const dispatch = (req: Request) =>
  worker.fetch(
    req as never,
    fixture.config as never,
    { waitUntil() {}, passThroughOnException() {} } as never,
  );
function noEffects() {
  for (const spy of Object.values(effects)) expect(spy).not.toHaveBeenCalled();
}
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
}

describe("Worker, signed identity and actual handler composition", () => {
  it("keeps canonical inert health and auth exceptions, and private unauthenticated redirects", async () => {
    for (const path of ["/api/health", "/auth"])
      expect((await dispatch(request(path))).status).toBe(200);
    const redirect = await dispatch(request("/data"));
    expect(redirect.status).toBe(302);
    privateResponse(redirect);
    expect(redirect.headers.get("location")).toBe("/auth?next=%2Fdata");
  });
  it("routes denied signed human entry to the inert auth shell without changing API or mutation denial", async () => {
    const wrongOwner = await sign({ email: "other@example.test" });
    for (const method of ["GET", "HEAD"]) {
      for (const path of [
        "/",
        "/content/pages?record=synthetic",
        "/newsletter/synthetic",
      ]) {
        const response = await dispatch(request(path, wrongOwner, { method }));
        expect(response.status).toBe(302);
        privateResponse(response);
        expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
          "no-store",
        );
        const destination = path === "/" ? "/content/pages" : path;
        expect(response.headers.get("location")).toBe(
          `/auth?next=${encodeURIComponent(destination)}`,
        );
        expect(await response.text()).toBe("");
      }
    }
    const shell = await dispatch(
      request("/auth?next=%2Fcontent%2Fpages", wrongOwner),
    );
    expect(shell.status).toBe(200);
    const logout = await dispatch(request("/auth/logout", wrongOwner));
    expect(logout.status).toBe(200);
    privateResponse(logout);
    for (const [path, init] of [
      ["/api/editorial/record?kind=writing&id=synthetic", {}],
      ["/content/pages", mutation()],
    ] as const) {
      const response = await dispatch(request(path, wrongOwner, init));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "owner_required" });
      expect(response.headers.get("location")).toBeNull();
      privateResponse(response);
    }
    noEffects();
  });
  it.each([
    ["wrong owner", { email: "other@example.test" }],
    ["alias", { email: "hello+admin@anipotts.com" }],
    ["wrong issuer", { iss: "https://other.cloudflareaccess.com" }],
    ["wrong audience", { aud: "other" }],
    ["service", { common_name: `${"d".repeat(32)}.access` }],
    ["expired", { exp: 1 }],
  ])("rejects %s before editorial effects", async (_label, claims) => {
    const response = await dispatch(
      request(
        "/api/editorial/create?kind=writing&id=synthetic",
        await sign(claims),
        mutation(),
      ),
    );
    expect(response.status).toBe(401);
    privateResponse(response);
    noEffects();
  });
  it("rejects old cookies, raw identity headers, malformed and forged assertions", async () => {
    for (const token of [undefined, "invalid", await sign({}, wrongSigning)]) {
      const response = await dispatch(
        request("/api/editorial/publish", token, mutation()),
      );
      expect(response.status).toBe(401);
      privateResponse(response);
      noEffects();
    }
  });
  it.each([
    { origin: "null" },
    { origin: "https://other.example.test" },
    { "sec-fetch-site": "same-site" },
    { "content-type": "text/plain" },
    { "x-editorial-csrf": "e".repeat(64) },
    { cookie: `__Host-editorial-csrf=${csrf}; __Host-editorial-csrf=${csrf}` },
  ])(
    "refuses an authenticated mutation boundary failure before effects: %j",
    async (headers) => {
      for (const path of [
        "/api/editorial/create?kind=writing&id=synthetic",
        "/api/editorial/media",
        "/api/private-reader/credential",
      ]) {
        const response = await dispatch(
          request(path, await sign(), mutation(headers)),
        );
        expect([400, 403]).toContain(response.status);
        privateResponse(response);
        noEffects();
      }
    },
  );
  it("does not reflect an alternate deployment into trusted origins or touch any handler", async () => {
    const response = await dispatch(
      request(
        "/api/editorial/create?kind=writing&id=synthetic",
        await sign(),
        mutation({ origin: "https://alternate.example" }),
        "https://alternate.example",
      ),
    );
    expect(response.status).toBe(403);
    privateResponse(response);
    expect(fixture.adapter).not.toHaveBeenCalled();
    noEffects();
  });
  it("preserves positive editorial creation and media save behind signed owner and CSRF", async () => {
    const created = await dispatch(
      request(
        "/api/editorial/create?kind=writing&id=synthetic",
        await sign(),
        mutation(
          {},
          JSON.stringify({
            expectedRevision: 0,
            title: "synthetic record",
            requestId: crypto.randomUUID(),
          }),
        ),
      ),
    );
    expect(created.status).toBe(201);
    privateResponse(created);
    expect(effects.save).toHaveBeenCalledTimes(1);
    const media = await dispatch(
      request(
        "/api/editorial/media",
        await sign(),
        mutation({}, JSON.stringify({ base64: "aGk=" })),
      ),
    );
    expect(media.status).toBe(201);
    privateResponse(media);
    expect(effects.saveMedia).toHaveBeenCalledWith(new Uint8Array([104, 105]));
  });
  it("bounds actual reader request bytes without Content-Length", async () => {
    const response = await dispatch(
      request(
        "/api/private-reader/credential",
        await sign(),
        mutation({}, JSON.stringify({ padding: "x".repeat(1025) })),
      ),
    );
    expect(response.status).toBe(400);
    privateResponse(response);
    noEffects();
  });
  it("preserves data/ops scope and parent expiry and refuses health when disabled", async () => {
    for (const [path, scope] of [
      ["credential", "data:read activity:read"],
      ["ops-credential", "ops:read"],
    ]) {
      const response = await dispatch(
        request(
          `/api/private-reader/${path}`,
          await sign(),
          mutation({}, JSON.stringify({ scope: "admin:write", role: "owner" })),
        ),
      );
      expect(response.status).toBe(200);
      privateResponse(response);
      const body = await response.json();
      const { payload } = await jwtVerify(body.credential, readerPublic, {
        algorithms: ["ES256"],
        issuer: origin,
        audience: "https://ap-mini.tail060490.ts.net",
      });
      expect(payload.scope).toBe(scope);
      expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(30);
    }
    expect(
      (
        await dispatch(
          request(
            "/api/private-reader/health-credential",
            await sign(),
            mutation(),
          ),
        )
      ).status,
    ).toBe(503);
  });
  it("keeps canary identity separate from owner and signs only canary:read", async () => {
    const service = await sign({
      aud: fixture.config.PRIVATE_READER_CANARY_ACCESS_AUD,
      common_name: fixture.config.PRIVATE_READER_CANARY_CLIENT_ID,
      sub: undefined,
      email: undefined,
    });
    expect(
      (
        await dispatch(
          request("/api/canary/credential", await sign(), { method: "POST" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await dispatch(
          request("/api/private-reader/credential", service, mutation()),
        )
      ).status,
    ).toBe(401);
    const response = await dispatch(
      request("/api/canary/credential", service, { method: "POST" }),
    );
    expect(response.status).toBe(200);
    privateResponse(response);
    const body = await response.json();
    const { payload } = await jwtVerify(body.credential, readerPublic);
    expect(payload.scope).toBe("canary:read");
    expect(payload.sub).toBe("canary");
    expect(payload.email).toBeUndefined();
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(30);
    noEffects();
  });
  it("retains assertion-bound logout CSRF and refuses another signed assertion", async () => {
    const token = await sign();
    const boot = await dispatch(request("/api/admin/logout", token));
    expect(boot.status).toBe(200);
    privateResponse(boot);
    const { csrf: logoutCsrf } = await boot.json();
    const completed = await dispatch(
      request(
        "/api/admin/logout",
        token,
        mutation({ "x-admin-csrf": logoutCsrf }),
      ),
    );
    expect(completed.status).toBe(200);
    privateResponse(completed);
    expect(completed.headers.get("set-cookie")).toContain("Max-Age=0");
    const rotated = await dispatch(
      request(
        "/api/admin/logout",
        await sign({ sub: "rotated-owner" }),
        mutation({ "x-admin-csrf": logoutCsrf }),
      ),
    );
    expect(rotated.status).toBe(403);
    privateResponse(rotated);
    noEffects();
  });
  it("refuses dormant native/inbox/control/MCP POSTs without effects", async () => {
    for (const path of [
      "/api/auth/login",
      "/api/admin/inbox",
      "/api/admin/control-plane",
      "/api/mcp",
    ]) {
      const response = await dispatch(request(path, await sign(), mutation()));
      expect(response.status).toBe(401);
      privateResponse(response);
      noEffects();
    }
  });
});
