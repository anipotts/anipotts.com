import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  Response.json({
    ok: true,
    app: "admin-astro",
    target: "admin.anipotts.com",
    release_sha: import.meta.env.PUBLIC_RELEASE_SHA || "dev",
    schema_version: import.meta.env.PUBLIC_RELEASE_SCHEMA_VERSION || "unknown",
  });
