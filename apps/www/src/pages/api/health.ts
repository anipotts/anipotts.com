import type { APIRoute } from "astro";
import { runtimeEnv } from "../../lib/runtime-env";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  let tablesOk = false;
  try {
    const result = await runtimeEnv(locals)
      .DB.prepare(
        "SELECT COUNT(*) AS cnt FROM (SELECT id, email, status FROM newsletter_subscribers LIMIT 1)",
      )
      .first<{ cnt: number }>();
    tablesOk = typeof result?.cnt === "number" && result.cnt >= 0;
  } catch {
    // Report only availability, never database errors or subscriber data.
  }
  return Response.json(
    {
      app: "www",
      ok: tablesOk,
      d1: tablesOk ? "connected" : "error",
      tables_ok: tablesOk,
      release_sha: import.meta.env.PUBLIC_RELEASE_SHA || "dev",
      schema_version:
        import.meta.env.PUBLIC_RELEASE_SCHEMA_VERSION || "unknown",
      ts: new Date().toISOString(),
    },
    { status: tablesOk ? 200 : 503 },
  );
};
