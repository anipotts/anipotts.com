import { existsSync, readdirSync } from "node:fs";
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
import { onRequest } from "../middleware";
import { retainedAccessPrincipal } from "./access-identity";
import {
  RETIRED_ADMIN_API_FILES,
  RETIRED_ADMIN_AUTH_FILES,
} from "../../../../scripts/ci/admin-route-inventory.mjs";
import { isPublicAdminPath } from "./admin-access-policy";

const repo = new URL("../../../../", import.meta.url);
const pages = new URL("apps/admin/src/pages/", repo);

/** Retired sign-in routes, plus the removed JSON and compatibility APIs
 * (MCP, projections, knowledge, runtime feed, control plane and the
 * compatibility writes). The API list also names their libraries. */
const REMOVED_FILES = [...RETIRED_ADMIN_AUTH_FILES, ...RETIRED_ADMIN_API_FILES];
const REMOVED_ROUTE_FILES = REMOVED_FILES.filter((file) =>
  file.startsWith("apps/admin/src/pages/"),
);

const routeFor = (file: string) =>
  file
    .replace(/^apps\/admin\/src\/pages/, "")
    .replace(/\.(?:astro|ts)$/, "")
    .replace(/\[[^\]]+\]/g, "opaque-request");

const removed = REMOVED_ROUTE_FILES.map((file) => ({
  file,
  route: routeFor(file),
}));
const removedPages = removed.filter(({ route }) => !route.startsWith("/api/"));
const removedApis = removed.filter(({ route }) => route.startsWith("/api/"));

async function dispatch(
  route: string,
  method = "GET",
  headers: Record<string, string> = {},
) {
  const url = new URL(`https://admin.anipotts.com${route}`);
  const next = vi.fn(async () => new Response("not found", { status: 404 }));
  const response = (await onRequest(
    {
      url,
      request: new Request(url, {
        method,
        headers: {
          origin: url.origin,
          "content-type": "application/json",
          ...headers,
        },
      }),
      locals: {},
      cookies: { get: () => ({ value: "retired-native-session" }) },
      redirect: (location: string, status: number) =>
        new Response(null, { status, headers: { location } }),
    } as never,
    next,
  )) as Response;
  return { response, next };
}

beforeEach(() => vi.resetAllMocks());

describe("retired sign-in, native-session and API routes", () => {
  it("covers every retired login page and API", () => {
    const routes = removed.map(({ route }) => route);
    for (const route of [
      "/auth/passkey",
      "/auth/invite",
      "/auth/recover",
      "/auth/device/opaque-request",
      "/api/admin/passkey/login-options",
      "/api/admin/password/login",
      "/api/admin/recovery/google/start",
      "/api/admin/device/start",
      "/api/admin/auth/session",
      "/api/mcp",
      "/api/admin/projections",
      "/api/admin/knowledge",
      "/api/admin/runtime-feed",
      "/api/admin/control-plane",
      "/api/admin/content/editor",
      "/api/admin/content/draft-operation",
    ])
      expect(routes).toContain(route);
  });

  it("has no page file, library or dynamic route left to answer them", () => {
    for (const file of REMOVED_FILES)
      expect(existsSync(new URL(file, repo)), file).toBe(false);
    for (const dir of ["auth", "api/admin", "api/admin/content"]) {
      const path = new URL(`${dir}/`, pages);
      if (!existsSync(path)) continue;
      for (const entry of readdirSync(path))
        expect(entry.startsWith("["), `${dir}/${entry}`).toBe(false);
    }
    for (const entry of readdirSync(new URL("api/", pages)))
      expect(entry.startsWith("["), `api/${entry}`).toBe(false);
  });

  it.each(removedPages)(
    "sends a signed-out visit to $route to sign-in",
    async ({ route }) => {
      const { response, next } = await dispatch(route);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `/auth?next=${encodeURIComponent(route)}`,
      );
      expect(next).not.toHaveBeenCalled();
    },
  );

  it.each(removedApis)(
    "answers $route with a 401 JSON refusal, never a native session",
    async ({ route }) => {
      for (const method of ["GET", "POST"]) {
        const { response, next } = await dispatch(route, method);
        expect(response.status).toBe(401);
        expect(response.headers.get("content-type")).toContain(
          "application/json",
        );
        expect(await response.json()).toEqual({
          error: "admin_session_required",
        });
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(next).not.toHaveBeenCalled();
      }
    },
  );

  it("no longer honors an MCP bearer token", async () => {
    expect(isPublicAdminPath("/api/mcp")).toBe(false);
    for (const method of ["GET", "POST"]) {
      const { response, next } = await dispatch("/api/mcp", method, {
        authorization: "Bearer retired-machine-token",
      });
      expect(response.status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it.each(removed)(
    "lets the Access owner reach the router, which 404s $route",
    async ({ route }) => {
      vi.mocked(retainedAccessPrincipal).mockImplementation(async (request) =>
        request.method === "GET"
          ? ({ authMethod: "cloudflare_access", role: "viewer" } as never)
          : null,
      );
      const read = await dispatch(route);
      expect(read.next).toHaveBeenCalledTimes(1);
      expect(read.response.status).toBe(404);
      if (route.startsWith("/api/")) {
        const write = await dispatch(route, "POST");
        expect(write.response.status).toBe(401);
        expect(write.next).not.toHaveBeenCalled();
      }
    },
  );
});
