import { beforeEach, expect, it, vi } from "vitest";
// Worker bindings: none unless a case supplies them.
vi.mock("./runtime-env", () => ({ runtimeEnv: () => ({}) }));
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
import { onRequest } from "../middleware";
import { retainedAccessPrincipal } from "./access-identity";
beforeEach(() => vi.clearAllMocks());
for (const pathname of ["/api/admin/logout", "/auth/logout"])
  it(`dispatches ${pathname} to its own Access check`, async () => {
    const next = vi.fn(
      async () => new Response("inert page or self-authenticating API"),
    );
    // Locals only receive the per-request Server-Timing collector.
    await onRequest(
      {
        url: new URL(`https://admin.example.test${pathname}`),
        locals: {},
      } as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(retainedAccessPrincipal).not.toHaveBeenCalled();
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
    expect(retainedAccessPrincipal).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
