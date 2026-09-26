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
import {
  retainedAccessPrincipal,
  verifyEditorialOwner,
} from "./access-identity";
import { PRIVATE_READER_CANARY_PATH } from "./private-reader-canary";
beforeEach(() => vi.clearAllMocks());

function context(pathname: string) {
  const url = new URL(`https://admin.example.test${pathname}`);
  return {
    url,
    request: new Request(url, { method: "POST" }),
    locals: {},
    redirect: () => new Response(null, { status: 302 }),
  } as never;
}

it("hands the canary path to its own service token check, never the owner's", async () => {
  const next = vi.fn(async () => new Response("{}"));
  const response = (await onRequest(
    context(PRIVATE_READER_CANARY_PATH),
    next,
  )) as Response;
  expect(next).toHaveBeenCalledTimes(1);
  expect(verifyEditorialOwner).not.toHaveBeenCalled();
  expect(retainedAccessPrincipal).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

for (const pathname of [
  `${PRIVATE_READER_CANARY_PATH}/extra`,
  "/api/canary",
  "/api/canary/other",
  "/api/private-reader/canary",
])
  it(`does not bypass authentication for ${pathname}`, async () => {
    const next = vi.fn();
    await onRequest(context(pathname), next);
    expect(next).not.toHaveBeenCalled();
  });
