import type { APIRoute } from "astro";
import { privateJson } from "../../../lib/editorial-security";
import { productionEditor } from "../../../lib/editorial-server";
import { runtimeEnv } from "../../../lib/runtime-env";

/** The editorial middleware requires the exact owner. These probes are SQL
 * reads only: calling a draft RPC here could import legacy state on first use. */
export const GET: APIRoute = async () => {
  const env = runtimeEnv();
  const { CONTENT_DB: db } = env as unknown as { CONTENT_DB?: D1Database };
  const storageConfigured = Boolean(db && productionEditor(env));
  const probe = async (sql: string, requireRow = false) => {
    if (!db) return "unavailable";
    try {
      const row = await db.prepare(sql).first();
      return !requireRow || row !== null ? "ready" : "unavailable";
    } catch {
      return "unavailable";
    }
  };
  const [published, drafts] = await Promise.all([
    probe(
      "SELECT version FROM editorial_published_inventory WHERE singleton = 1",
      true,
    ),
    storageConfigured
      ? probe("SELECT revision FROM editorial_drafts LIMIT 1")
      : "unavailable",
  ]);
  return privateJson({
    release_sha: import.meta.env.PUBLIC_RELEASE_SHA || "dev",
    schema_version: import.meta.env.PUBLIC_RELEASE_SCHEMA_VERSION || "unknown",
    published,
    drafts,
  });
};
