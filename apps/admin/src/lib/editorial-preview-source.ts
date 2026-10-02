import type { Draft } from "../editorial/draft-store";

/** A preview is pinned to an acknowledged draft or the exact read-only baseline.
 * Viewing an unchanged record never manufactures a private revision. */
export type PreviewSourceRead =
  { status: "found"; source: string } | { status: "stale" | "unavailable" };

type Readers = {
  draft: () => Promise<Pick<
    Draft,
    "source" | "revision" | "discardedAt"
  > | null>;
  baseline: () => Promise<{ source: string; baseFileHash: string | null }>;
};

export async function readEditorialPreviewSource(
  url: URL,
  readers: Readers,
): Promise<PreviewSourceRead> {
  const revision = url.searchParams.get("revision");
  if (!revision || !/^(0|[1-9]\d*)$/.test(revision)) return { status: "stale" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<PreviewSourceRead> => {
        if (revision === "0") {
          const hash = url.searchParams.get("baseline");
          if (!hash || !/^[a-f0-9]{40}$/.test(hash)) return { status: "stale" };
          const baseline = await readers.baseline();
          return baseline.baseFileHash === hash
            ? { status: "found", source: baseline.source }
            : { status: "stale" };
        }
        const draft = await readers.draft();
        return draft &&
          draft.discardedAt === null &&
          String(draft.revision) === revision
          ? { status: "found", source: draft.source }
          : { status: "stale" };
      })(),
      new Promise<PreviewSourceRead>((resolve) => {
        timer = setTimeout(() => resolve({ status: "unavailable" }), 15_000);
      }),
    ]);
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
