import { publicationSourceHash } from "@anipotts/content/editorial/publication-contract";
import type { HomeBase } from "./editorial-home-api";
import type { DirectPublicationStatus } from "./editorial-publication-status";

export function verifiedPublication(
  job: DirectPublicationStatus | null,
): job is DirectPublicationStatus & { publicationId: string } {
  return Boolean(
    job &&
    job.phase === "live" &&
    job.publicationId &&
    job.verifiedAt != null &&
    !job.blocked &&
    !job.superseded,
  );
}

/** The baseline must identify the approved public effect, not just a newer
 * timestamp. This function never receives or mutates the editable draft. */
export async function reconcilePublishedBaseline(
  job: DirectPublicationStatus,
  base: HomeBase,
): Promise<HomeBase> {
  if (
    !verifiedPublication(job) ||
    !base ||
    base.publicationId !== job.publicationId ||
    typeof base.source !== "string" ||
    (await publicationSourceHash(base.source)) !== job.sourceSha256
  )
    throw new Error("Published comparison is not confirmed");
  return base;
}
