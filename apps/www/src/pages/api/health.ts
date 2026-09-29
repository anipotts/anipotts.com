import type { APIRoute } from "astro";
import { publicationReadiness } from "../../lib/publication-readiness";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  let tablesOk = false;
  try {
    const result = await locals.runtime.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM (SELECT id, email, status FROM newsletter_subscribers LIMIT 1)",
    ).first<{ cnt: number }>();
    tablesOk = typeof result?.cnt === "number" && result.cnt >= 0;
  } catch {
    // Report only availability, never database errors or subscriber data.
  }
  const content = await publicationReadiness(locals.runtime?.env);
  return Response.json(
    {
      app: "www",
      ...content,
      ok: tablesOk,
      d1: tablesOk ? "connected" : "error",
      tables_ok: tablesOk,
      release_sha: import.meta.env.PUBLIC_RELEASE_SHA || "dev",
      schema_version:
        import.meta.env.PUBLIC_RELEASE_SCHEMA_VERSION || "0042-unverified",
      ts: new Date().toISOString(),
    },
    { status: tablesOk ? 200 : 503 },
  );
};
