import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("./admin-auth", () => ({
  resolveAdminSession: vi.fn(async () => ({ principal: null, setCookies: [] })),
  applyAdminSetCookies: (response: Response) => response,
  adminJson: (body: unknown, init: ResponseInit) => Response.json(body, init),
  sanitizeAdminReturnPath: () => "/",
}));
import { onRequest } from "../middleware";
import { isPublicAdminPath } from "./admin-access-policy";

/** The removed JSON and compatibility APIs. With no route file left, the
 * middleware refusal is the whole answer to a signed-out caller. */
const RETIRED_API_REQUESTS = [
  ["GET", "/api/mcp"],
  ["POST", "/api/mcp"],
  ["GET", "/api/admin/projections"],
  ["GET", "/api/admin/knowledge"],
  ["GET", "/api/admin/runtime-feed"],
  ["GET", "/api/admin/control-plane"],
  ["POST", "/api/admin/control-plane"],
  ["POST", "/api/admin/content/editor"],
  ["POST", "/api/admin/content/draft-operation"],
] as const;

async function dispatch(method: string, pathname: string, headers = {}) {
  const url = new URL(`https://admin.anipotts.com${pathname}`);
  const next = vi.fn(async () => new Response("<html>404</html>"));
  const response = (await onRequest(
    {
      url,
      request: new Request(url, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: method === "POST" ? "{}" : undefined,
      }),
      locals: {},
      cookies: { get: () => undefined },
      redirect: (location: string, status: number) =>
        new Response(null, { status, headers: { location } }),
    } as never,
    next,
  )) as Response;
  return { response, next };
}

beforeEach(() => vi.clearAllMocks());

describe("removed admin APIs", () => {
  it("drops the MCP bearer route from the signed-out allowlist", () => {
    expect(isPublicAdminPath("/api/mcp")).toBe(false);
  });

  it.each(RETIRED_API_REQUESTS)(
    "refuses a signed-out %s %s with 401 JSON, never a page",
    async (method, pathname) => {
      const { response, next } = await dispatch(method, pathname);
      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(await response.json()).toEqual({
        error: expect.any(String),
      });
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("no longer honors an MCP bearer token", async () => {
    for (const method of ["GET", "POST"]) {
      const { response, next } = await dispatch(method, "/api/mcp", {
        authorization: "Bearer retired-machine-token",
      });
      expect(response.status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });
});
