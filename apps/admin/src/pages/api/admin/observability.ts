import { readObservability } from "../../../lib/observability-reader";

// Existing Operations middleware authenticates this route. A runtime capability
// must be reviewed and wired by the integration owner before any live read.
export async function GET() {
  const result = await readObservability();
  return Response.json(result, {
    status: result.status === "disconnected" ? 503 : 200,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
