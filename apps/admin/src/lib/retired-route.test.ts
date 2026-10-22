import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext, AstroIntegration } from "astro";
import { ALL } from "./retired-route";
import { RETIRED_ROUTE_REDIRECTS } from "./retired-routes.mjs";
import config from "../../astro.config.mjs";

const answer = (path: string, method = "GET") =>
  ALL({
    url: new URL(path, "https://admin.anipotts.com"),
    request: new Request(new URL(path, "https://admin.anipotts.com"), {
      method,
    }),
  } as APIContext) as Response;

describe("retired routes", () => {
  it.each(Object.entries(RETIRED_ROUTE_REDIRECTS))(
    "%s answers 308 to %s for every method",
    (from, destination) => {
      for (const method of ["GET", "HEAD", "POST"]) {
        const response = answer(from, method);
        expect(response.status).toBe(308);
        expect(response.headers.get("Location")).toBe(destination);
      }
    },
  );

  it("sends each retired URL to a current workspace page", () => {
    for (const destination of Object.values(RETIRED_ROUTE_REDIRECTS))
      expect(destination).toMatch(
        /^\/(?:$|content\/pages$|data\/records$|observability\/(?:status|activity)$)/,
      );
  });

  it("are each injected into the router by the app's own Astro config", async () => {
    const integration = (config.integrations ?? [])
      .flat()
      .find(
        (item): item is AstroIntegration =>
          Boolean(item) &&
          (item as AstroIntegration).name === "admin-retired-routes",
      );
    expect(integration).toBeDefined();
    const injected: Array<{ pattern: string; entrypoint: string | URL }> = [];
    const setup = integration!.hooks[
      "astro:config:setup"
    ] as unknown as (options: {
      injectRoute: (route: (typeof injected)[number]) => void;
    }) => void;
    setup({ injectRoute: (route) => injected.push(route) });
    expect(injected.map((route) => route.pattern).sort()).toEqual(
      Object.keys(RETIRED_ROUTE_REDIRECTS).sort(),
    );
    for (const route of injected)
      expect(String(route.entrypoint)).toMatch(/\/retired-route\.ts$/);
  });
});

describe("isolated owner test toolbar", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["ordinary development", undefined, undefined, true],
    ["state without the local owner", undefined, "/tmp/synthetic-e2e", true],
    ["durable owner preview", "1", undefined, true],
    ["isolated owner e2e server", "1", "/tmp/synthetic-e2e", false],
  ] as const)(
    "%s preserves the supported toolbar boundary",
    async (_, owner, state, enabled) => {
      vi.stubEnv("ADMIN_LOCAL_OWNER", owner);
      vi.stubEnv("ADMIN_E2E_STATE_DIR", state);
      vi.stubEnv("GITHUB_ACTIONS", undefined);
      vi.resetModules();
      const { default: actual } = await import("../../astro.config.mjs");
      expect(actual.devToolbar?.enabled).toBe(enabled);
    },
  );
});
