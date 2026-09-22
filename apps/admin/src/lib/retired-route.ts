import type { APIRoute } from "astro";
import { RETIRED_ROUTE_REDIRECTS } from "./retired-routes.mjs";

const destinations: Readonly<Record<string, string>> = RETIRED_ROUTE_REDIRECTS;

// Every method, so a 308 keeps its method the way the old page stubs did.
export const ALL: APIRoute = ({ url }) =>
  new Response(null, {
    status: 308,
    headers: { Location: destinations[url.pathname] ?? "/" },
  });
