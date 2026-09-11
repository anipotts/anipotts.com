import { editorialRecordPath } from "@anipotts/content/editorial/source";
import type { Publication } from "./publication";
import { publicationMediaFiles } from "./publication-media";

const sha = /^[a-f0-9]{40}$/;
export type GitBase = {
  head: string;
  tree: string;
  // These values come from reading this exact head, never independent latest reads.
  file: { path: string; sha: string; mode: string; type: string } | null;
};

/** Preserve unrelated main changes by parenting the publication to the inspected head.
 * No writes occur here. A changed file needs explicit reconciliation, not a force push.
 */
export function preparePublication(publication: Publication, base: GitBase) {
  if (!sha.test(base.head) || !sha.test(base.tree))
    return { ok: false, code: "invalid_git_snapshot" } as const;
  const path = editorialRecordPath(publication.record);
  if (path !== publication.path)
    return { ok: false, code: "invalid_publication_path" } as const;
  try {
    publicationMediaFiles(publication);
  } catch {
    return { ok: false, code: "invalid_publication_media" } as const;
  }
  if (publication.baseFileHash === null) {
    if (base.file !== null)
      return { ok: false, code: "record_already_exists" } as const;
  } else if (base.file === null) {
    return { ok: false, code: "record_removed" } as const;
  } else if (
    base.file.path !== path ||
    base.file.sha !== publication.baseFileHash ||
    base.file.mode !== "100644" ||
    base.file.type !== "blob"
  ) {
    return { ok: false, code: "record_changed" } as const;
  }
  return {
    ok: true,
    parent: base.head,
    baseTree: base.tree,
    branch: `codex/editorial-${publication.id}`,
    file: {
      path,
      mode: "100644" as const,
      type: "blob" as const,
      content: publication.source,
    },
  } as const;
}
