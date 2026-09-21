import { editorialRuntime } from "../editorial/runtime";
import { readPublishedBase } from "./editorial-published-base";
import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";
import type { EditorialDraftStore } from "../editorial/draft-store";

export function productionEditor(env: unknown) {
  if (!env || typeof env !== "object") return null;
  const values = env as Record<string, unknown>;
  if (values.EDITORIAL_ENABLED !== "true") return null;
  const binding = values.EDITORIAL as
    { getByName(name: string): EditorialDraftStore } | undefined;
  if (!binding || typeof binding.getByName !== "function") return null;
  const storage = binding.getByName("production");
  const mode =
    values.EDITORIAL_PUBLISH_MODE === undefined
      ? "legacy"
      : values.EDITORIAL_PUBLISH_MODE;
  if (mode === "direct" || mode === "maintenance") {
    if (!values.CONTENT_DB) throw new Error("content_database_unavailable");
    const db = values.CONTENT_DB as PublicationDatabase;
    return {
      storage,
      publicationMode: mode,
      publishing:
        mode === "direct" &&
        values.EDITORIAL_PUBLISH_ENABLED === "true" &&
        Boolean(values.CONTENT_MEDIA) &&
        /^[a-f0-9]{40}$/.test(import.meta.env.PUBLIC_RELEASE_SHA || ""),
      readBase: (record: Parameters<typeof readPublishedBase>[1]) =>
        readPublishedBase(db, record),
    } as const;
  }
  // Unknown modes fail closed, never silently select the retired publisher.
  if (mode !== "legacy") throw new Error("invalid_publisher_mode");
  const runtime = editorialRuntime(env);
  return runtime
    ? { ...runtime, storage, publicationMode: "legacy" as const }
    : null;
}
