import { describe, expect, it } from "vitest";
import type { APIContext } from "astro";
import { ALL } from "./retired-route";
import { RETIRED_ROUTE_REDIRECTS } from "./retired-routes.mjs";

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
});
