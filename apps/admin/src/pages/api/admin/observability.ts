import type { APIContext } from "astro";
import { readObservability } from "../../../lib/observability-reader";
import { measureServerTiming } from "../../../lib/server-timing";

// Existing Operations middleware authenticates this route. A runtime capability
// must be reviewed and wired by the integration owner before any live read.
export async function GET({ locals }: Pick<APIContext, "locals">) {
  const result = await measureServerTiming(locals, "operations", () =>
    readObservability(),
  );
  return Response.json(result, {
    status: result.status === "disconnected" ? 503 : 200,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
