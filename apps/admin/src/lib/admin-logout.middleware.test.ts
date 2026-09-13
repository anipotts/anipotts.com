import { beforeEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ env: {} }));
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
import { resolveAdminSession } from "./admin-auth";
beforeEach(() => vi.clearAllMocks());
for (const pathname of ["/api/admin/logout", "/auth/logout"])
  it(`dispatches ${pathname} without touching native sessions`, async () => {
    const next = vi.fn(
      async () => new Response("inert page or self-authenticating API"),
    );
    await onRequest(
      {
        url: new URL(`https://admin.example.test${pathname}`),
        locals: {},
      } as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(resolveAdminSession).not.toHaveBeenCalled();
  });
for (const pathname of ["/api/admin/logout/extra", "/auth/logout-other"])
  it(`does not bypass authentication for ${pathname}`, async () => {
    const url = new URL(`https://admin.example.test${pathname}`);
    const next = vi.fn();
    await onRequest(
      {
        url,
        request: new Request(url),
        locals: {},
        redirect: () => new Response(null, { status: 302 }),
      } as never,
      next,
    );
    expect(resolveAdminSession).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
