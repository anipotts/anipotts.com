import { editorialRecordPath } from "@anipotts/content/editorial/source";
import {
  validateEditorialSnapshot,
  type EditorialSourceRecord,
} from "@anipotts/content/editorial/snapshot";
import type { EditorialGitHub } from "./github";
import type { Publication } from "./publication";
import { preparePublication } from "./prepare-publication";

type GitReader = Pick<
  EditorialGitHub,
  "readBase" | "readContentInventory" | "readContentSource"
>;

/** This stage deliberately has no GitHub write capability. A successful content
 * preflight still needs release/protection/render-version readiness before writes.
 */
export async function publicationPreflight(
  publication: Publication,
  git: GitReader,
  pinnedHead?: string,
) {
  if (editorialRecordPath(publication.record) !== publication.path)
    return { ok: false, code: "invalid_publication_path" } as const;
  const base = await git.readBase(publication.record, pinnedHead);
  const plan = preparePublication(publication, base);
  if (!plan.ok) return plan;
  const inventory = await git.readContentInventory(base.head);
  if (inventory.head !== base.head || inventory.tree !== base.tree)
    return { ok: false, code: "invalid_git_snapshot" } as const;
  const existing = inventory.files.filter(
    (file) => file.path === publication.path,
  );
  if (
    existing.length !== (base.file === null ? 0 : 1) ||
    (base.file !== null && existing[0]?.sha !== base.file.sha)
  )
    return { ok: false, code: "invalid_git_snapshot" } as const;
  const entries: EditorialSourceRecord[] = [];
  let totalBytes = 0;
  // Bound memory and network fan-out. No private drafts are enumerated here.
  for (let start = 0; start < inventory.files.length; start += 4) {
    const batch = await Promise.all(
      inventory.files.slice(start, start + 4).map(async (file) => ({
        record: file.record,
        source:
          file.path === publication.path
            ? publication.source
            : await git.readContentSource(file),
      })),
    );
    for (const entry of batch) {
      totalBytes += new TextEncoder().encode(entry.source).byteLength;
      if (totalBytes > 8 * 1024 * 1024)
        return { ok: false, code: "snapshot_too_large" } as const;
      entries.push(entry);
    }
  }
  if (base.file === null)
    entries.push({ record: publication.record, source: publication.source });
  const issues = validateEditorialSnapshot(entries);
  if (issues.length)
    return { ok: false, code: "invalid_content", issues } as const;
  return { ok: true, base } as const;
}
