import { describe, expect, it } from "vitest";
import type { APIContext } from "astro";
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
    const integration = config.integrations?.find(
      (item) => item && "name" in item && item.name === "admin-retired-routes",
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
