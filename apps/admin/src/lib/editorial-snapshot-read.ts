import type { Draft } from "../editorial/draft-store";

export type SnapshotRead =
  | { status: "found"; draft: Draft }
  | { status: "missing" }
  | { status: "unavailable" };

/** Read-only deadline includes bootstrap; late results cannot change the response. */
export async function readEditorialSnapshot(
  read: () => Promise<Draft | null>,
): Promise<SnapshotRead> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(read)
        .then((draft): SnapshotRead =>
          draft && draft.discardedAt === null
            ? { status: "found", draft }
            : { status: "missing" },
        ),
      new Promise<SnapshotRead>((resolve) => {
        timer = setTimeout(() => resolve({ status: "unavailable" }), 15_000);
      }),
    ]);
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
