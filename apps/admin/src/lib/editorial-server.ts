import { readPublishedBase } from "./editorial-published-base";
import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";
import type { EditorialDraftStore } from "../editorial/draft-store";
import { GIT_SHA } from "./patterns";

export function productionEditor(env: unknown) {
  if (!env || typeof env !== "object") return null;
  const values = env as Record<string, unknown>;
  if (values.EDITORIAL_ENABLED !== "true") return null;
  const binding = values.EDITORIAL as
    { getByName(name: string): EditorialDraftStore } | undefined;
  if (!binding || typeof binding.getByName !== "function") return null;
  if (!values.CONTENT_DB) throw new Error("content_database_unavailable");
  const db = values.CONTENT_DB as PublicationDatabase;
  return {
    storage: binding.getByName("production"),
    // EDITORIAL_PUBLISH_ENABLED is the kill switch: off keeps drafts and
    // publication status readable and accepts no new activation.
    publishing:
      values.EDITORIAL_PUBLISH_ENABLED === "true" &&
      Boolean(values.CONTENT_MEDIA) &&
      GIT_SHA.test(import.meta.env.PUBLIC_RELEASE_SHA || ""),
    readBase: (record: Parameters<typeof readPublishedBase>[1]) =>
      readPublishedBase(db, record),
  } as const;
}
