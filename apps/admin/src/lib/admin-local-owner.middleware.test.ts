import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));
vi.mock("./access-identity", () => ({
  retainedAccessPrincipal: vi.fn(async () => null),
  verifyEditorialOwner: vi.fn(async () => null),
}));
vi.mock("./editorial-content", () => ({
  publicSiteUrl: "https://example.test",
}));
vi.mock("./editorial-media", () => ({
  editorialImagePreview: (value: string) => value,
}));
vi.mock("./editorial-security", () => ({
  privateEditorialResponse: (body: unknown, status: number) =>
    Response.json(body, { status }),
}));
vi.mock("./admin-auth", () => ({
  resolveAdminSession: vi.fn(async () => ({ principal: null, setCookies: [] })),
  applyAdminSetCookies: (response: Response) => response,
  adminJson: (body: unknown, init: ResponseInit) => Response.json(body, init),
  sanitizeAdminReturnPath: () => "/",
}));
import { onRequest } from "../middleware";
import { resolveAdminSession } from "./admin-auth";
import {
  retainedAccessPrincipal,
  verifyEditorialOwner,
} from "./access-identity";
import { LOCAL_OWNER_EMAIL, localOwnerPrincipal } from "./admin-local-owner";

type Locals = { adminPrincipal?: unknown; runtime?: unknown };

async function dispatch(
  href: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  const url = new URL(href);
  const locals: Locals = {};
  const next = vi.fn(async () => new Response("rendered"));
  const response = (await onRequest(
    {
      url,
      request: new Request(url, {
        method: init.method ?? "GET",
        headers: { host: url.host, ...init.headers },
      }),
      locals,
      cookies: { get: () => undefined },
      redirect: (location: string, status: number) =>
        new Response(null, { status, headers: { location } }),
    } as never,
    next,
  )) as Response;
  return { response, next, locals };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("local owner identity", () => {
  it("is visibly synthetic and carries no credential or step-up", () => {
    expect(localOwnerPrincipal()).toEqual({
      userId: "local-owner",
      role: "owner",
      sessionId: "local-owner",
      authMethod: "local_owner",
      stepUpAt: null,
      restriction: null,
      displayName: LOCAL_OWNER_EMAIL,
      credentialId: null,
    });
    expect(LOCAL_OWNER_EMAIL).toBe("local-owner@localhost");
  });
});

describe("middleware without the build-time flag", () => {
  it("keeps loopback API and record requests on the existing denial", async () => {
    const api = await dispatch("http://localhost:4321/api/admin/observability");
    expect(api.response.status).toBe(401);
    expect(api.next).not.toHaveBeenCalled();
    expect(api.locals.adminPrincipal).toBeUndefined();
    expect(resolveAdminSession).toHaveBeenCalledTimes(1);

    const record = await dispatch(
      "http://localhost:4321/content/writing/example",
    );
    expect(record.response.status).toBe(401);
    expect(record.next).not.toHaveBeenCalled();
    expect(verifyEditorialOwner).toHaveBeenCalledTimes(1);
  });

  it("ignores a runtime ADMIN_LOCAL_OWNER value", async () => {
    vi.stubEnv("ADMIN_LOCAL_OWNER", "1");
    const { response, next } = await dispatch(
      "http://localhost:4321/api/admin/inbox",
      { method: "POST" },
    );
    expect(response.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("middleware with the build-time flag", () => {
  beforeEach(() => vi.stubGlobal("__LOCAL_OWNER_BUILD__", true));

  it("serves a loopback API write as the synthetic owner without native auth", async () => {
    const { response, next, locals } = await dispatch(
      "http://127.0.0.1:8787/api/admin/inbox",
      { method: "POST", headers: { origin: "http://127.0.0.1:8787" } },
    );
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(locals.adminPrincipal).toEqual(localOwnerPrincipal());
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(retainedAccessPrincipal).not.toHaveBeenCalled();
    expect(resolveAdminSession).not.toHaveBeenCalled();
  });

  it("opens a record editor through the Portless host without Access", async () => {
    const { response, next, locals } = await dispatch(
      "http://feature.admin.anipotts.localhost:1355/content/writing/example",
      {
        headers: {
          "x-forwarded-host": "feature.admin.anipotts.localhost:1355",
          "x-forwarded-for": "127.0.0.1",
        },
      },
    );
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(verifyEditorialOwner).not.toHaveBeenCalled();
    expect(locals.adminPrincipal).toEqual(localOwnerPrincipal());
  });

  it.each([
    ["production host", "https://admin.anipotts.com/api/admin/inbox", {}],
    [
      "spoofed Host",
      "http://localhost:4321/api/admin/inbox",
      { host: "admin.anipotts.com" },
    ],
    [
      "spoofed X-Forwarded-Host",
      "http://localhost:4321/api/admin/inbox",
      { "x-forwarded-host": "admin.anipotts.com" },
    ],
  ])("keeps the existing denial for a %s", async (_name, href, headers) => {
    const { response, next, locals } = await dispatch(href, {
      method: "POST",
      headers,
    });
    expect(response.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(locals.adminPrincipal).toBeUndefined();
  });

  it("leaves public auth paths on the native flow", async () => {
    await dispatch("http://localhost:4321/auth");
    expect(resolveAdminSession).toHaveBeenCalledTimes(1);
  });
});
