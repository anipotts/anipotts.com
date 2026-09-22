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
  privateJson: (body: unknown, status: number) =>
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
import {
  LOCAL_OWNER_EMAIL,
  denyLocalOwnerFraming,
  localOwnerPrincipal,
} from "./admin-local-owner";

const DENY_FRAMING = "frame-ancestors 'none'";
const PREVIEW_POLICY =
  "sandbox allow-scripts; form-action 'none'; frame-ancestors 'self'; connect-src 'none'";

type Locals = { adminPrincipal?: unknown; runtime?: unknown };

async function dispatch(
  href: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    responseHeaders?: Record<string, string>;
  } = {},
) {
  const url = new URL(href);
  const locals: Locals = {};
  const next = vi.fn(
    async () => new Response("rendered", { headers: init.responseHeaders }),
  );
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
    const api = await dispatch("http://localhost:4321/api/admin/runtime-feed");
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

  it("adds no framing policy to a signed-in response", async () => {
    vi.mocked(retainedAccessPrincipal).mockResolvedValueOnce({
      userId: "owner",
    } as never);
    const { response, next } = await dispatch(
      "https://admin.anipotts.com/operations/observability",
    );
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("X-Frame-Options")).toBeNull();
  });

  it("adds duration-only Server-Timing to granted and denied responses", async () => {
    vi.mocked(retainedAccessPrincipal).mockResolvedValueOnce({
      userId: "owner",
    } as never);
    const granted = await dispatch(
      "https://admin.anipotts.com/operations/observability",
    );
    const denied = await dispatch(
      "http://localhost:4321/content/writing/example",
    );
    for (const { response, locals } of [granted, denied]) {
      expect(locals).toHaveProperty("serverTiming");
      expect(response.headers.get("Server-Timing")).toMatch(
        /^app;dur=\d+(?:\.\d)?$/,
      );
    }
  });
});

describe("local owner framing policy", () => {
  it.each([
    ["no policy", null, DENY_FRAMING],
    ["an empty policy", "  ", DENY_FRAMING],
    [
      "a policy without frame-ancestors",
      "default-src 'self'",
      `default-src 'self'; ${DENY_FRAMING}`,
    ],
    [
      "a policy with a trailing semicolon",
      "default-src 'self';",
      `default-src 'self'; ${DENY_FRAMING}`,
    ],
    [
      "a route that already denies framing",
      "default-src 'none'; frame-ancestors 'none'",
      "default-src 'none'; frame-ancestors 'none'",
    ],
    ["the same-origin draft preview", PREVIEW_POLICY, PREVIEW_POLICY],
    [
      "a directive name in another case",
      "Frame-Ancestors 'self'",
      "Frame-Ancestors 'self'",
    ],
  ])("merges into %s", (_name, existing, expected) => {
    const headers = new Headers();
    if (existing !== null) headers.set("Content-Security-Policy", existing);
    denyLocalOwnerFraming(headers);
    expect(headers.get("Content-Security-Policy")).toBe(expected);
  });

  it("does not mistake a source value for the directive", () => {
    const headers = new Headers({
      "Content-Security-Policy": "default-src https://frame-ancestors.example",
    });
    denyLocalOwnerFraming(headers);
    expect(headers.get("Content-Security-Policy")).toBe(
      `default-src https://frame-ancestors.example; ${DENY_FRAMING}`,
    );
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

  it("opens a record editor on a loopback dev server without Access", async () => {
    const { response, next, locals } = await dispatch(
      "http://127.0.0.1:4401/content/writing/example",
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

  it.each([
    ["an API response", "http://127.0.0.1:8787/api/admin/projections"],
    ["an Operations page", "http://localhost:4471/operations/observability"],
    ["the record editor", "http://127.0.0.1:4471/content/writing/example"],
    ["the Content index", "http://localhost:4471/content"],
  ])("refuses to be framed for %s", async (_name, href) => {
    const { response, locals } = await dispatch(href);
    expect(locals.adminPrincipal).toEqual(localOwnerPrincipal());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(DENY_FRAMING);
  });

  it("merges the framing policy into a route policy", async () => {
    const api = await dispatch("http://127.0.0.1:8787/api/admin/inbox", {
      responseHeaders: { "Content-Security-Policy": "default-src 'none'" },
    });
    expect(api.response.headers.get("Content-Security-Policy")).toBe(
      `default-src 'none'; ${DENY_FRAMING}`,
    );
    const editorial = await dispatch(
      "http://127.0.0.1:4471/api/editorial/draft",
      {
        responseHeaders: {
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'",
        },
      },
    );
    expect(editorial.response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it("keeps the same-origin frame the editor uses for draft previews", async () => {
    const { response, locals } = await dispatch(
      "http://127.0.0.1:4471/preview/record?kind=writing&id=example",
    );
    expect(locals.adminPrincipal).toEqual(localOwnerPrincipal());
    expect(response.headers.get("Content-Security-Policy")).toBe(
      PREVIEW_POLICY,
    );
  });

  it("adds no framing policy to a request it does not grant", async () => {
    const { response } = await dispatch(
      "http://localhost:4321/api/admin/inbox",
      { headers: { "x-forwarded-for": "203.0.113.9" } },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });
});
