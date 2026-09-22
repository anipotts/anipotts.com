// Retired Admin URLs and bare workspace roots, and the closest live page
// for each. One injected endpoint answers every one with a 308 behind the
// normal middleware, and the route inventory classifies them, so a retired
// URL needs no page file.
// Astro's own `redirects` option would send 301 for GET whenever the
// destination is a dynamic route, which most of these are.
// Routes whose destination depends on the request stay pages (/content,
// /newsletter, /life/[section], /knowledge and /knowledge/locations).
export const RETIRED_ROUTE_REDIRECTS = Object.freeze({
  "/data": "/data/records",
  "/observability": "/observability/status",
  "/life": "/data/records",
  "/operations/observability": "/observability/status",
  "/inbox": "/observability/status",
  "/repos": "/observability/status",
  "/fleet": "/observability/status",
  "/system": "/observability/status",
  "/work": "/observability/activity",
  "/handoffs": "/observability/activity",
  "/proof": "/observability/activity",
  "/deploys": "/observability/activity",
  "/ops/destructive": "/",
  "/mutations": "/",
  "/content/review": "/content/pages",
  "/content/drafts": "/content/pages",
  "/content/preview": "/content/pages",
  "/content/operations": "/content/pages",
  "/content/carousels": "/content/pages",
});

/** Injects the one redirect endpoint at every retired URL. */
export function retiredRoutes() {
  return {
    name: "admin-retired-routes",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        for (const pattern of Object.keys(RETIRED_ROUTE_REDIRECTS))
          injectRoute({
            pattern,
            entrypoint: new URL("./retired-route.ts", import.meta.url),
          });
      },
    },
  };
}
