import type { DraftStorage, PublicationStorage } from "./editorial-home-api";
import { editorialRuntime } from "../editorial/runtime";
import type { MediaStorage } from "./editorial-media-api";

export function productionEditor(env: unknown) {
  const runtime = editorialRuntime(env);
  if (!runtime || !env || typeof env !== "object" || !("EDITORIAL" in env))
    return null;
  const binding = env.EDITORIAL as
    | {
        getByName(
          name: string,
        ): DraftStorage &
          PublicationStorage &
          MediaStorage &
          Pick<
            import("../editorial/draft-store").EditorialDraftStore,
            "listWritingDrafts"
          >;
      }
    | undefined;
  if (!binding || typeof binding.getByName !== "function") return null;
  return { ...runtime, storage: binding.getByName("production") };
}
